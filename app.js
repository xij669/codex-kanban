"use strict";
/* Codex Kanban front end. Plain JS, no build step.
   Data: GET /api/state (board snapshot with a `rev`), GET /api/cards/<id> (comments + full runs).
   Design rules: see DEVELOPMENT.md → 设计原则 (less is more). */

/* All interface text comes from i18n.js: t("key", {params}). User content (names, titles, comments,
   tags, paths, agent output) is inserted verbatim and never passed through t(). */
const label = status => t(`status.${status}`);
const PREFIX = {development:"DEV",content:"CNT"};
const PRIORITY = {urgent:{rank:0},high:{rank:1},normal:{rank:2},low:{rank:3}};
const priorityLabel = id => t(`priority.${id}`);
const POLL_MS = 3000;

let S = null;                 // latest /api/state snapshot
let projectId = Number(storage("get","boardProject")) || null;
let currentView = "board";
let showHistory = false;
let searchText = "";
let mobileStatus = null;
let dragging = false, renderPending = false;
let detailData = null;        // /api/cards/<id> for the open drawer
let selectedCardId = null;
let modalKind = null;         // "detail" | "new-card" | "new-project" | "project-settings"
let formDrafts = {};          // form id -> values that differ from what the form opened with
const checklist = new Map();  // "<card>:<run>" -> Set of checked acceptance lines (not saved)
const pendingAuto = new Map();
const onMac = /Mac/.test(navigator.platform) && navigator.maxTouchPoints < 2;

function storage(op, key, value) { try { return op === "get" ? localStorage.getItem(key) : localStorage.setItem(key, value); } catch { return null; } }
const $ = selector => document.querySelector(selector);
const h = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const icon = name => `<svg class="ui-icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
const isMobile = () => window.matchMedia("(max-width: 620px)").matches;
const project = () => S?.projects.find(p => p.id === projectId) || S?.projects[0] || null;
const cardById = id => S?.cards.find(c => c.id === Number(id));
const projectOf = card => S?.projects.find(p => p.id === card.project_id);
const cardName = card => `${PREFIX[projectOf(card)?.workflow] || "TASK"}-${String(card.id).padStart(3, "0")}`;
const isDev = p => p?.workflow === "development";
const hasDrafts = () => Object.keys(formDrafts).length > 0;
const statusDot = status => `<span class="status-dot s-${status}"></span>`;
/* Server activity is "<code>" or "<code>:<detail>"; the detail (command, files, tool) stays verbatim. */
function activityText(value) {
  if (!value) return t("activity.preparing");
  const match = /^([a-z]+)(?::([\s\S]*))?$/.exec(value);
  if (!match) return value;   // runs recorded before activity codes existed
  const [, code, detail] = match;
  if (code === "files" && !detail) return t("activity.filesPlain");
  return hasKey(`activity.${code}`) ? t(`activity.${code}`, {detail: detail ?? ""}) : value;
}
const issueText = (issue, part) => t(`issue.${hasKey(`issue.${issue.code}.title`) ? issue.code : "unknown"}.${part}`);

function duration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(s / 60), hrs = Math.floor(m / 60);
  return hrs ? `${hrs}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}
function ago(iso) {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return t("time.justNow");
  if (m < 60) return t("time.minutesAgo", {n: m});
  if (m < 1440) return t("time.hoursAgo", {n: Math.floor(m / 60)});
  return new Date(iso).toLocaleDateString(currentLocale, {month:"numeric", day:"numeric"});   // older than a day: date only, fits narrow cards
}
const stamp = iso => iso ? new Date(iso).toLocaleString(currentLocale, {month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit"}) : "";

async function api(path, data) {
  const response = await fetch(path, {method: data === undefined ? "GET" : "POST", headers: {"Content-Type": "application/json"},
                                      body: data === undefined ? undefined : JSON.stringify(data)});
  const text = await response.text();
  let result = null;
  try { result = text ? JSON.parse(text) : {}; } catch { result = null; }
  if (!response.ok || result === null) {
    // Translate by the server's error code; never show a half-translated server sentence.
    const code = result?.code && hasKey(`err.${result.code}`) ? result.code : null;
    throw new Error(code ? t(`err.${code}`) : t("err.http", {status: response.status}));
  }
  return result;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3300);
}

/* ---------- Sorting: what you see is the execution order ---------- */
const byPriority = (a, b) => (PRIORITY[a.priority]?.rank ?? 2) - (PRIORITY[b.priority]?.rank ?? 2) || a.id - b.id;
const byRecent = (a, b) => String(b.updated_at).localeCompare(String(a.updated_at)) || b.id - a.id;
function sortCards(status, cards) {
  const list = [...cards];
  if (status === "backlog" || status === "todo") return list.sort(byPriority);   // same ORDER BY as auto_candidate()
  if (status === "progress") return list.sort((a, b) => a.id - b.id);
  if (status === "review") return list.sort((a, b) => (!!b.issue - !!a.issue) || byRecent(a, b));
  return list.sort(byRecent);
}

/* Connection text is dynamic; keep its key so a language switch re-translates it instead of restoring the static "connecting" text. */
let syncKey = "app.connecting";
function setSync(key) { syncKey = key; $("#sync-status").textContent = t(key); }

/* ---------- Refresh: only re-render when the server revision changes ---------- */
async function refresh(force = false) {
  try {
    const data = await api(`/api/state${S && !force ? `?rev=${S.rev}` : ""}`);
    setSync("app.synced");
    if (data.unchanged) return;
    const previous = S;
    S = data;
    if (S.projects.length && !S.projects.some(p => p.id === projectId)) {
      projectId = S.projects[0].id; storage("set", "boardProject", projectId); mobileStatus = null;
    }
    render();
    if (modalKind === "detail" && selectedCardId) {
      const now = cardById(selectedCardId), before = previous?.cards.find(c => c.id === selectedCardId);
      if (!now) { closeModal(true); toast(t("toast.taskGone")); }
      else if (JSON.stringify(now) !== JSON.stringify(before) && !hasDrafts()) loadDetail(selectedCardId, {keepScroll: true});
    }
  } catch (error) {
    setSync("app.offline");
    if (force) toast(error.message);
  }
}

/* ---------- Page ---------- */
function render() {
  if (!S) return;
  if (dragging) { renderPending = true; return; }
  document.querySelectorAll("[data-app-version]").forEach(el => { el.textContent = t("app.version", {version: S.version}); });
  const p = project();
  document.body.classList.toggle("no-project", !p);
  $("#empty").hidden = !!p;
  $("#connection-dot").className = "dot " + (S.codexAvailable ? "ok" : "off");
  $("#connection-text").textContent = t(S.codexAvailable ? "app.codexOk" : "app.codexOff");
  renderProjects(p);
  if (!p) { $("#board").innerHTML = ""; $("#overview").innerHTML = ""; $("#agent-control").hidden = true; return; }
  document.title = `${p.name} · Codex Kanban`;
  $("#page-title").textContent = currentView === "board" ? p.name : `${p.name} · ${t("app.overview")}`;
  renderAgent(p);
  document.querySelectorAll(".tab").forEach(el => { el.classList.toggle("active", el.dataset.action === currentView); el.setAttribute("aria-selected", String(el.dataset.action === currentView)); });
  // Eye = "show them", eye with a slash = "hide them": the icon names the action the button performs.
  $("#history-toggle").innerHTML = showHistory ? `${icon("eye-off")}${t("app.hideDone")}` : `${icon("eye")}${t("app.showDone")}`;
  $("#history-toggle").setAttribute("aria-pressed", String(showHistory));
  $("#history-toggle").hidden = currentView !== "board";
  $("#search-box").hidden = currentView !== "board";
  $("#mobile-history").innerHTML = showHistory ? `${icon("eye-off")}${t("app.hideDoneShort")}` : `${icon("eye")}${t("app.showDoneShort")}`;
  const needsPath = isDev(p) && !p.path;
  $("#notice").hidden = !needsPath;
  if (needsPath) $("#notice").innerHTML = `${t("app.noPath")}<button class="text-button" data-action="project-settings">${t("app.openSettings")}</button>`;
  $("#board").hidden = currentView !== "board";
  $("#overview").hidden = currentView !== "overview";
  document.body.classList.toggle("view-overview", currentView === "overview");
  renderAttention(p);
  if (currentView === "board") renderBoard(p); else renderOverview(p);
}

function projectCards(p) { return S.cards.filter(c => c.project_id === p.id); }
function countBy(p, status) { return projectCards(p).filter(c => c.status === status).length; }

function renderProjects(p) {
  $("#project-list").innerHTML = S.projects.map(item => {
    const review = countBy(item, "review");
    return `<button class="project-item ${item.id === p?.id ? "active" : ""}" data-action="select-project" data-id="${item.id}">${icon("folder")}<span class="project-name" title="${h(item.name)}"><span class="project-name-text">${h(item.name)}</span></span>${review ? `<span class="count-badge" title="${h(t("chip.review", {n: review}))}">${review}</span>` : ""}</button>`;
  }).join("");
  $("#mobile-project").innerHTML = S.projects.map(item => `<option value="${item.id}" ${item.id === p?.id ? "selected" : ""}>${h(item.name)}</option>`).join("")
    + `<option value="new">${t("app.newProjectMenu")}</option>`;
}

// Measure only on interaction; long names travel at a gentle, consistent speed.
function scrollProjectName(event) {
  const item = event.target.closest(".project-item");
  if (!item || (event.type === "pointerenter" && event.target !== item)) return;
  const label = item.querySelector(".project-name");
  const distance = label.scrollWidth - label.clientWidth;
  if (distance <= 1) return;
  item.style.setProperty("--name-travel", `${-distance}px`);
  item.style.setProperty("--name-duration", `${Math.max(3, distance / 24 + 1.2)}s`);
  item.classList.add("is-scrolling");
}
$("#project-list").addEventListener("pointerenter", scrollProjectName, true);
$("#project-list").addEventListener("focusin", scrollProjectName);
for (const type of ["pointerleave", "focusout"]) {
  $("#project-list").addEventListener(type, event => {
    const item = event.target.closest(".project-item");
    if (item && (type !== "pointerleave" || event.target === item)) item.classList.remove("is-scrolling");
  }, true);
}

function runningCard() { return S.cards.find(c => c.status === "progress"); }

function renderAgent(p) {
  const control = $("#agent-control");
  control.hidden = !isDev(p);
  if (!isDev(p)) return;
  const toggle = $("#auto-toggle");
  const enabled = pendingAuto.has(p.id) ? pendingAuto.get(p.id) : !!p.auto_enabled;
  toggle.checked = enabled;
  toggle.disabled = pendingAuto.has(p.id);
  const running = runningCard(), queued = countBy(p, "todo");
  let text, dot;
  if (running && running.project_id === p.id) { text = t("auto.running", {task: cardName(running)}); dot = "running"; }
  else if (running) { text = t("auto.runningElsewhere"); dot = enabled ? "on" : "off"; }
  else if (enabled) { text = queued ? t("auto.queued", {n: queued}) : t("auto.idle"); dot = "on"; }
  else { text = queued ? t("auto.pausedQueued", {n: queued}) : t("auto.paused"); dot = "off"; }
  $("#agent-status").textContent = text;
  $("#agent-dot").className = "agent-dot " + dot;
}

function renderAttention(p) {
  const review = countBy(p, "review"), backlog = countBy(p, "backlog");
  const chips = [];
  if (review) chips.push(`<button class="chip chip-review" data-action="jump" data-status="review">${statusDot("review")}${t("chip.review", {n: review})}</button>`);
  if (backlog) chips.push(`<button class="chip chip-backlog" data-action="jump" data-status="backlog">${statusDot("backlog")}${t("chip.backlog", {n: backlog})}</button>`);
  $("#attention").innerHTML = chips.length && currentView === "board" ? `<span class="attention-label">${t("app.needsYou")}</span>${chips.join("")}` : "";
}

function visibleStatuses(p) {
  let statuses = isDev(p) ? ["backlog", "todo", "progress", "review"] : ["backlog", "review"];
  if (showHistory) statuses = [...statuses, "done", "cancelled"];
  return statuses;
}

function matches(card) {
  if (!searchText) return true;
  if (searchText.startsWith("#")) return card.tags.toLowerCase().split(",").some(t => t.trim().includes(searchText.slice(1)));
  return `${cardName(card)} ${card.title} ${card.description} ${card.tags}`.toLowerCase().includes(searchText);
}

function renderBoard(p) {
  const all = visibleStatuses(p);
  const cardsIn = status => sortCards(status, projectCards(p).filter(c => c.status === status && matches(c)));
  let statuses = all;
  if (isMobile()) {
    if (!mobileStatus || !all.includes(mobileStatus)) {
      mobileStatus = countBy(p, "review") ? "review" : all.find(s => countBy(p, s)) || all[0];
    }
    $("#mobile-tabs").style.setProperty("--tabs", all.length);
    $("#mobile-tabs").classList.toggle("many", all.length > 4);   // 6 tabs scroll sideways instead of truncating
    $("#mobile-tabs").innerHTML = all.map(status => {
      const n = countBy(p, status), selected = status === mobileStatus;
      const count = status === "review" && n ? `<span class="count-badge">${n}</span>` : `<span class="tab-count">${n}</span>`;
      return `<button role="tab" aria-selected="${selected}" class="m-tab ${selected ? "active" : ""}" data-action="mobile-status" data-status="${status}">${statusDot(status)}<span class="m-tab-label">${t(`short.${status}`)}</span>${count}</button>`;
    }).join("");
    $("#mobile-hint").textContent = t(`hint.${mobileStatus}`);
    statuses = [mobileStatus];
  }
  const scroll = {};
  document.querySelectorAll(".card-list").forEach(el => { scroll[el.dataset.drop] = el.scrollTop; });
  const focused = document.activeElement?.closest?.("[data-card]")?.dataset.card;
  $("#board").style.setProperty("--columns", statuses.length);
  $("#board").innerHTML = statuses.map(status => {
    const cards = cardsIn(status), n = countBy(p, status);
    const count = status === "review" && n ? `<span class="count-badge">${n}</span>` : `<span class="column-count">${n}</span>`;
    const hint = status === "todo" && isDev(p) ? `<span class="column-hint">${t("column.queued")}</span>` : "";
    return `<div class="column" data-status="${status}"><div class="column-header">${statusDot(status)}<span class="column-title">${label(status)}</span>${count}${hint}</div>`
      + `<div class="card-list" data-drop="${status}">${cards.length ? cards.map((c, i) => renderCard(c, p, i)).join("") : `<div class="empty-column">${t(searchText ? "column.noMatch" : "column.empty")}</div>`}</div></div>`;
  }).join("");
  document.querySelectorAll(".card-list").forEach(el => { if (scroll[el.dataset.drop]) el.scrollTop = scroll[el.dataset.drop]; });
  if (focused) document.querySelector(`[data-card="${focused}"]`)?.focus({preventScroll: true});
  tick();
}

function priorityChip(card) {
  return card.priority === "urgent" || card.priority === "high" ? `<span class="prio prio-${card.priority}">${priorityLabel(card.priority)}</span>` : "";
}

function renderCard(card, p, index) {
  const run = card.latestRun;
  const parts = [];
  const seq = card.status === "todo" && isDev(p) ? `<span class="seq ${index === 0 ? "first" : ""}">${index + 1}</span>` : "";
  const right = card.status === "review" && !card.issue ? `<span class="card-time">${ago(run?.ended_at || card.updated_at)}</span>` : priorityChip(card);
  parts.push(`<div class="card-top">${seq}<span class="card-id">${cardName(card)}</span>${card.status === "review" && !card.issue ? priorityChip(card) : ""}${right}</div>`);
  parts.push(`<div class="card-title">${h(card.title)}</div>`);
  if (card.status === "backlog" && isDev(p) && !card.acceptance.trim()) parts.push(`<div class="card-note">${t("card.missingCriteria")}</div>`);
  if (card.status === "progress" && run) {
    const wait = run.retry_wait ? t("card.retrying", {count: run.retry_count}) : activityText(run.activity);
    parts.push(`<div class="card-run"><span class="elapsed" data-since="${h(run.started_at)}"></span><span class="run-activity">${h(wait)}</span><button class="btn btn-secondary btn-sm" data-action="stop" data-id="${card.id}">${t("card.stop")}</button></div>`);
  }
  if (card.issue) parts.push(`<div class="card-issue" title="${h(issueText(card.issue, "title"))}">${icon("warning")}<span>${h(issueText(card.issue, "short"))}</span></div>`);
  else if (card.status === "review" && run?.outputPreview) parts.push(`<div class="card-preview">${h(run.outputPreview.split("\n").find(line => line.trim()) || "")}</div>`);
  const tags = card.tags.split(",").map(x => x.trim()).filter(Boolean).slice(0, 3).map(tag => `<span class="tag">${h(tag)}</span>`);
  if (card.pendingFeedbackCount) tags.push(`<span class="feedback-badge">${icon("comment")}<span>${t("card.unsentFeedback", {n: card.pendingFeedbackCount})}</span></span>`);
  if (tags.length) parts.push(`<div class="card-meta">${tags.join("")}</div>`);
  if (card.status === "review") {
    const rework = isDev(p) ? `<button class="btn btn-secondary btn-sm" data-action="rework" data-id="${card.id}">${t("card.rework")}</button>` : "";
    const approve = card.issue ? "" : `<button class="btn btn-primary btn-sm" data-action="approve" data-id="${card.id}">${t("card.approve")}</button>`;
    if (rework || approve) parts.push(`<div class="card-actions">${rework}${approve}</div>`);
  }
  const aria = [`${cardName(card)} ${card.title}`, card.issue && t("card.failedAria"), card.pendingFeedbackCount && t("card.feedbackAria")].filter(Boolean).join(", ");
  return `<article class="card ${card.issue ? "is-failed" : ""} ${card.status === "progress" ? "is-running" : ""}" draggable="${card.status !== "progress"}" data-card="${card.id}" tabindex="0" role="button" aria-label="${h(aria)}">${parts.join("")}</article>`;
}

function renderOverview(p) {
  const n = s => countBy(p, s);
  const total = projectCards(p).length;
  const needs = [t("overview.needsYou"), n("backlog") + n("review"), t("overview.needsYouSub", {backlog: n("backlog"), review: n("review")})];
  const done = [t("overview.done"), n("done"), t("overview.doneSub", {n: n("cancelled")})];
  const all = [t("overview.total"), total, ""];
  const stats = isDev(p) ? [needs, [t("overview.queue"), n("todo") + n("progress"), t("overview.queueSub", {todo: n("todo"), progress: n("progress")})], done, all] : [needs, done, all];
  const limit = S.runTimeoutMinutes ? t("overview.minutes", {n: S.runTimeoutMinutes}) : t("overview.unlimited");
  $("#overview").innerHTML = stats.map(([name, value, sub]) => `<div class="stat-card"><small>${name}</small><strong>${value}</strong><span>${sub}</span></div>`).join("")
    + `<div class="overview-panel"><h3>${t("overview.settings")}</h3><p>${t(isDev(p) ? "overview.flowDev" : "overview.flowContent")}<br>${t("overview.folder")}${p.path ? h(p.path) : t("overview.notLinked")}`
    + `${isDev(p) ? `<br>${t("overview.auto", {state: t(p.auto_enabled ? "overview.on" : "overview.off"), limit})}` : ""}</p></div>`;
}

/* Elapsed timers update text only; no re-render. */
function tick() {
  document.querySelectorAll("[data-since]").forEach(el => { el.textContent = duration(Date.now() - new Date(el.dataset.since)); });
}

/* ---------- Drawers ---------- */
function modal(kind, content) {
  modalKind = kind;
  document.body.style.overflow = "hidden";
  $("#modal-root").innerHTML = `<div class="modal-backdrop" data-action="backdrop"><aside class="drawer" data-kind="${kind}" role="dialog" aria-modal="true" aria-label="${h(t("app.panel"))}">${content}</aside></div>`;
  prepareForms();
}

/* Remember each form's opening values, then restore any drafts on top. */
function prepareForms() {
  document.querySelectorAll("#modal-root form[id]").forEach(form => {
    form.dataset.initial = JSON.stringify(Object.fromEntries(new FormData(form)));
    const draft = formDrafts[form.id];
    if (draft) for (const [name, value] of Object.entries(draft)) { const field = form.elements.namedItem(name); if (field) field.value = value; }
  });
}
function trackDraft(form) {
  if (!form?.id || !form.dataset.initial) return;
  const current = JSON.stringify(Object.fromEntries(new FormData(form)));
  if (current === form.dataset.initial) delete formDrafts[form.id]; else formDrafts[form.id] = Object.fromEntries(new FormData(form));
}

function closeModal(force = false) {
  if (!modalKind) return true;
  if (!force && hasDrafts() && !confirm(t("app.discardChanges"))) return false;
  $("#modal-root").innerHTML = "";
  selectedCardId = null; detailData = null; modalKind = null; formDrafts = {};
  document.body.style.overflow = "";
  return true;
}

const closeButton = () => `<button class="icon-button" data-action="close" aria-label="${h(t("app.close"))}">${icon("close")}</button>`;

function modelControls(card, disabled) {
  const models = S.executionModels;
  if (!models.length) return `<select class="mini-select" disabled title="${h(t("detail.noModels"))}"><option>${t("detail.codexDefault")}</option></select>`;
  const chosen = card.model || S.executionDefaults.model;
  const model = models.find(m => m.id === chosen);
  const effort = card.thinking || model?.defaultEffort || "";
  return `<select class="mini-select" data-setting="model" aria-label="${h(t("detail.model"))}" ${disabled ? "disabled" : ""}>${!model ? `<option value="">${t("detail.codexDefault")}</option>` : ""}${models.map(m => `<option value="${h(m.id)}" ${m.id === chosen ? "selected" : ""}>${h(m.name)}</option>`).join("")}</select>`
    + `<select class="mini-select" data-setting="thinking" aria-label="${h(t("detail.thinking"))}" ${disabled || !model ? "disabled" : ""}>${(model?.efforts || []).map(e => `<option ${e === effort ? "selected" : ""}>${h(e)}</option>`).join("")}</select>`;
}
function priorityControl(card) {
  // The flag icon names the control; options stay one short word so the row never wraps.
  return `<select class="mini-select prio-select" data-setting="priority" aria-label="${h(t("priority.label"))}" title="${h(t("priority.label"))}">${Object.keys(PRIORITY).map(id => `<option value="${id}" ${id === card.priority ? "selected" : ""}>${priorityLabel(id)}</option>`).join("")}</select>`;
}

async function loadDetail(cardId, {keepScroll = false, focusComposer = false} = {}) {
  const drawer = $("#modal-root .drawer");
  const scroll = keepScroll && drawer ? drawer.scrollTop : 0;
  const open = keepScroll ? [...document.querySelectorAll("#modal-root details[data-key]")].filter(d => d.open).map(d => d.dataset.key) : [];
  try {
    detailData = await api(`/api/cards/${cardId}`);
  } catch (error) { toast(error.message); return; }
  if (selectedCardId !== cardId) return;
  renderDetail();
  const next = $("#modal-root .drawer");
  open.forEach(key => { const d = document.querySelector(`#modal-root details[data-key="${key}"]`); if (d) d.open = true; });
  if (next) next.scrollTop = scroll;
  if (focusComposer) { const box = $("#composer textarea"); box?.scrollIntoView({block: "center"}); box?.focus({preventScroll: true}); }
}

function openDetail(cardId, options = {}) {
  if (modalKind && modalKind !== "detail" && !closeModal()) return;
  if (selectedCardId !== cardId) formDrafts = {};
  selectedCardId = cardId;
  const card = cardById(cardId);
  if (!card) return;
  if (!detailData || detailData.card.id !== cardId) modal("detail", `<div class="drawer-header"><div class="drawer-heading"><div class="eyebrow">${cardName(card)}</div><h2>${h(card.title)}</h2></div>${closeButton()}</div><div class="drawer-body"><p class="muted">${t("app.loading")}</p></div>`);
  loadDetail(cardId, options);
}

function decisionBar(card, p, runs) {
  const latest = runs[0];
  const bar = (text, sub, button = "", kind = "") => `<div class="decision ${kind}"><div class="decision-text"><strong>${text}</strong><span>${sub}</span></div>${button}</div>`;
  if (card.status === "review" && card.issue) return bar(`${icon("warning")}${h(issueText(card.issue, "title"))}`, h(issueText(card.issue, "action")), "", "is-failed");
  if (card.status === "review") {
    return bar(t(isDev(p) ? "detail.agentDone" : "detail.awaitReview"), t("detail.checkCriteria"),
      `<button class="btn btn-primary" data-action="approve" data-id="${card.id}">${t("card.approve")}</button>`);
  }
  if (card.status === "progress" && latest) {
    const doing = latest.retry_wait ? t("detail.retryWait", {seconds: latest.retry_wait, count: latest.retry_count}) : activityText(latest.activity);
    return bar(`${t("detail.running")}<span data-since="${h(latest.started_at)}"></span>`, h(doing),
      `<button class="btn btn-primary" data-action="stop" data-id="${card.id}">${t("card.stop")}</button>`, "is-running");
  }
  if (card.status === "todo" && isDev(p)) {
    const queue = sortCards("todo", projectCards(p).filter(c => c.status === "todo"));
    const position = queue.findIndex(c => c.id === card.id) + 1;
    return bar(t("detail.queued", {n: position}), t(p.auto_enabled ? "detail.autoOn" : "detail.autoOff"),
      `<button class="btn btn-primary" data-action="run" data-id="${card.id}">${t("detail.runNow")}</button>`);
  }
  if (card.status === "backlog") {
    if (isDev(p)) {
      const ready = !!card.acceptance.trim();
      return bar(t("detail.inBacklog"), t(ready ? "detail.readyHint" : "detail.needCriteria"),
        `<button class="btn btn-primary" data-action="move" data-status="todo" ${ready ? "" : "disabled"}>${t("detail.moveToTodo")}</button>`);
    }
    return bar(t("detail.inBacklog"), t("detail.contentHint"), `<button class="btn btn-primary" data-action="move" data-status="review">${t("detail.sendToReview")}</button>`);
  }
  return "";
}

function resultSection(card, runs) {
  const run = runs[0];
  if (!run || run.status === "running") return "";
  const took = run.ended_at ? ` · ${t("detail.took", {time: duration(new Date(run.ended_at) - new Date(run.started_at))})}` : "";
  const model = run.model ? ` · ${h(run.model)}${run.thinking ? " · " + h(run.thinking) : ""}` : "";
  const body = run.status === "failed"
    ? `<pre class="result-body is-error">${h(run.error || t("detail.noError"))}</pre>`
    : `<div class="result-body">${h(run.output || t("detail.noText"))}</div>`;
  return `<section class="section"><div class="section-head"><span class="section-label">${t("detail.result")}</span><span class="muted">${ago(run.ended_at || run.started_at)}${took}${model}</span></div>${body}</section>`;
}

function acceptanceSection(card, runs) {
  const lines = card.acceptance.split("\n").map(x => x.replace(/^\s*[-*·•\d.、)]+\s*/, "").trim()).filter(Boolean);
  if (!lines.length) return `<section class="section"><span class="section-label">${t("detail.criteria")}</span><p class="muted">${t("detail.criteriaEmpty")}</p></section>`;
  const key = `${card.id}:${runs[0]?.id || 0}`;
  const checked = checklist.get(key) || new Set();
  const checkable = card.status === "review";
  return `<section class="section"><span class="section-label">${t("detail.criteria")}${checkable ? `<span class="muted">${t("detail.checksNote")}</span>` : ""}</span><div class="checklist">${lines.map((line, i) => checkable
    ? `<label class="check"><input type="checkbox" data-check="${key}" data-index="${i}" ${checked.has(i) ? "checked" : ""}><span>${h(line)}</span></label>`
    : `<div class="check">· ${h(line)}</div>`).join("")}</div></section>`;
}

/* Link to the executor's own record of a run. Each executor declares how its runs can be opened;
   only Codex (codex://threads/<id>, Mac Codex App) exists today. Hidden where the app cannot open it. */
const EXECUTOR_LINKS = {
  codex: run => run.thread_id && onMac ? {href: `codex://threads/${encodeURIComponent(run.thread_id)}`, label: t("detail.viewInCodex")} : null,
};
function processLink(run) {
  const link = EXECUTOR_LINKS[run.executor || "codex"]?.(run);
  return link ? `<a class="link msg-link" href="${link.href}">${link.label}</a>` : "";
}

function composer(card, p) {
  const rework = isDev(p) && card.status === "review";
  const closed = card.status === "done" || card.status === "cancelled";   // will not run again: no execution settings
  const selects = closed ? "" : `${isDev(p) ? modelControls(card, card.status === "progress") : ""}${priorityControl(card)}`;
  const actions = rework
    ? `<button type="submit" class="btn btn-secondary" name="intent" value="comment">${t("detail.saveCommentOnly")}</button><button type="submit" class="btn btn-primary" name="intent" value="requeue">${t("detail.submitRework")}</button>`
    : `<button type="submit" class="btn btn-primary" name="intent" value="comment">${t("detail.saveComment")}</button>`;
  const hint = rework && card.pendingFeedbackCount ? `<p class="muted">${t("detail.pendingHint", {n: card.pendingFeedbackCount})}</p>` : "";
  return `<form id="composer" class="section composer"><label class="section-label" for="composer-body">${t(rework ? "detail.changeRequest" : "detail.comment")}</label>`
    + `<textarea id="composer-body" name="body" placeholder="${h(t(rework ? "detail.changePlaceholder" : "detail.commentPlaceholder"))}"></textarea>${hint}`
    + `<div class="composer-bar"><div class="composer-settings">${selects}</div><div class="composer-actions">${actions}</div></div></form>`;
}

function historySection(card, comments, runs) {
  const events = [
    ...comments.map(c => ({at: c.created_at, order: c.id, kind: "comment", item: c})),
    ...runs.filter(r => r.status !== "running").map(r => ({at: r.ended_at || r.started_at, order: r.id, kind: "run", item: r})),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)) || (a.kind === "comment" ? -1 : 1));
  if (!events.length) return "";
  const total = runs.filter(r => r.status !== "running").length;
  let round = 0;
  const items = events.map(e => {
    if (e.kind === "comment") return `<div class="msg msg-you"><div class="msg-meta">${t("detail.you")} · ${stamp(e.at)}</div><div class="msg-body">${h(e.item.body)}</div></div>`;
    round += 1;
    const r = e.item, state = t(r.status === "completed" ? "detail.completed" : "detail.failed");
    return `<div class="msg msg-agent ${r.status === "failed" ? "is-failed" : ""}"><div class="msg-meta">${t("detail.agentRound", {n: round, state})} · ${stamp(e.at)}${r.model ? ` · ${h(r.model)}` : ""}</div><div class="msg-body">${h(r.status === "failed" ? (r.error || t("detail.noError")) : (r.output || t("detail.noText")))}</div>${processLink(r)}</div>`;
  }).join("");
  return `<details class="fold" data-key="history"><summary><span>${t("detail.history")}</span><span class="muted">${t("detail.historyMeta", {runs: t("detail.runs", {n: total}), comments: t("detail.comments", {n: comments.length})})}</span></summary><div class="thread">${items}</div></details>`;
}

function detailsSection(card) {
  const tagCount = card.tags.split(",").map(x => x.trim()).filter(Boolean).length;
  const meta = [tagCount && t("detail.tagCount", {n: tagCount}), card.description && t("detail.hasDescription")].filter(Boolean).join(" · ");
  return `<details class="fold" data-key="details"><summary><span>${t("detail.details")}</span><span class="muted">${meta || t("detail.detailsMeta")}</span></summary>`
    + `<form id="edit-form" class="fold-body"><div class="field"><label for="f-title">${t("detail.title")}</label><input id="f-title" name="title" value="${h(card.title)}" required></div>`
    + `<div class="field"><label for="f-desc">${t("detail.description")}</label><textarea id="f-desc" name="description">${h(card.description)}</textarea></div>`
    + `<div class="field"><label for="f-acc">${t("detail.criteria")}</label><textarea id="f-acc" name="acceptance" placeholder="${h(t("detail.criteriaPlaceholder"))}">${h(card.acceptance)}</textarea></div>`
    + `<div class="form-grid"><div class="field"><label for="f-tags">${t("detail.tags")}</label><input id="f-tags" name="tags" value="${h(card.tags)}" placeholder="${h(t("detail.tagsPlaceholder"))}"></div><div class="field"><label for="f-src">${t("detail.source")}</label><input id="f-src" name="source" value="${h(card.source)}" placeholder="https://"></div></div>`
    + `<div class="form-actions"><button type="submit" class="btn btn-primary">${t("detail.saveDetails")}</button></div></form></details>`;
}

function manageSection(card, p) {
  const targets = S.workflows[p.workflow].filter(s => !["progress", "done", card.status].includes(s));
  const locked = card.status === "progress";
  return `<details class="fold" data-key="manage"><summary><span>${t("detail.manage")}</span></summary><div class="fold-body">`
    + `<div class="move-row">${targets.map(s => `<button class="btn btn-secondary" data-action="move" data-status="${s}" ${locked ? "disabled" : ""}>${statusDot(s)}${label(s)}</button>`).join("")}</div>`
    + `<div id="delete-zone" class="danger-row"><button class="btn btn-danger-text" data-action="delete-card-ask" ${locked ? "disabled" : ""}>${t("detail.deleteTask")}</button>${locked ? `<span class="muted">${t("detail.lockedRunning")}</span>` : ""}</div>`
    + `</div></details>`;
}

function renderDetail() {
  const card = cardById(selectedCardId) || detailData.card;
  const full = {...detailData.card, ...card};
  const p = projectOf(full) || project();
  const {comments, runs} = detailData;
  const rounds = runs.length ? ` · ${t("detail.round", {n: runs.length})}` : "";
  modal("detail", `<div class="drawer-header"><div class="drawer-heading"><div class="eyebrow">${cardName(full)}<span class="pill pill-${full.status}">${statusDot(full.status)}${label(full.status)}</span>${rounds}</div><h2>${h(full.title)}</h2></div>${closeButton()}</div>`
    + `${decisionBar(full, p, runs)}<div class="drawer-body">${resultSection(full, runs)}${acceptanceSection(full, runs)}${composer(full, p)}`
    + `<div class="folds">${historySection(full, comments, runs)}${detailsSection(full)}${manageSection(full, p)}</div></div>`);
  const header = $("#modal-root .drawer-header");
  if (header) $("#modal-root .drawer").style.setProperty("--header-h", header.offsetHeight + "px");
  tick();
}

function newCardForm() {
  const p = project();
  modal("new-card", `<div class="drawer-header"><div class="drawer-heading"><div class="eyebrow">${h(p.name)}</div><h2>${t("form.newTask")}</h2></div>${closeButton()}</div>`
    + `<form id="card-form" class="drawer-body">`
    + `<div class="field"><label for="n-title">${t("form.titleRequired")}</label><input id="n-title" name="title" required placeholder="${h(t("form.titlePlaceholder"))}"></div>`
    + `<div class="field"><label for="n-desc">${t("detail.description")}</label><textarea id="n-desc" name="description" placeholder="${h(t("form.descPlaceholder"))}"></textarea></div>`
    + `<div class="field"><label for="n-acc">${t("detail.criteria")}</label><textarea id="n-acc" name="acceptance" placeholder="${h(t(isDev(p) ? "form.criteriaPlaceholderDev" : "form.criteriaPlaceholder"))}"></textarea></div>`
    + `<details class="fold"><summary><span>${t("form.more")}</span><span class="muted">${t(isDev(p) ? "form.moreMetaDev" : "form.moreMeta")}</span></summary><div class="fold-body">`
    + `<div class="form-grid"><div class="field"><label for="n-prio">${t("priority.label")}</label><select id="n-prio" name="priority">${Object.keys(PRIORITY).map(id => `<option value="${id}" ${id === "normal" ? "selected" : ""}>${priorityLabel(id)}</option>`).join("")}</select></div>`
    + `<div class="field"><label for="n-tags">${t("detail.tags")}</label><input id="n-tags" name="tags" placeholder="${h(t("detail.tagsPlaceholder"))}"></div></div>`
    + `<div class="field"><label for="n-src">${t("detail.source")}</label><input id="n-src" name="source" type="url" placeholder="https://"></div>`
    + (isDev(p) && S.executionModels.length ? newCardModelFields() : "")
    + `</div></details><p class="muted">${t(isDev(p) ? "form.newTaskNoteDev" : "form.newTaskNote")}</p>`
    + `<div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close">${t("app.cancel")}</button><button type="submit" class="btn btn-primary">${t("form.createTask")}</button></div></form>`);
  $("#n-title").focus();
}
function newCardModelFields() {
  const chosen = S.executionDefaults.model, model = S.executionModels.find(m => m.id === chosen) || S.executionModels[0];
  return `<div class="form-grid"><div class="field"><label for="n-model">${t("detail.model")}</label><select id="n-model" name="model">${S.executionModels.map(m => `<option value="${h(m.id)}" ${m.id === model.id ? "selected" : ""}>${h(m.name)}</option>`).join("")}</select></div>`
    + `<div class="field"><label for="n-thinking">${t("detail.thinking")}</label><select id="n-thinking" name="thinking">${model.efforts.map(e => `<option ${e === (S.executionDefaults.thinking || model.defaultEffort) ? "selected" : ""}>${h(e)}</option>`).join("")}</select></div></div>`;
}

function pathField(value) {
  return `<div class="field"><label for="project-path">${t("form.macFolder")}</label><div class="path-row"><input id="project-path" name="path" value="${h(value)}" placeholder="${h(t("form.pathPlaceholder"))}">${onMac ? `<button type="button" class="btn btn-secondary" data-action="native-folder">${t("form.chooseFolder")}</button>` : ""}</div><p class="muted">${t(onMac ? "form.pathHintMac" : "form.pathHint")}</p></div>`;
}

function newProjectForm() {
  modal("new-project", `<div class="drawer-header"><div class="drawer-heading"><h2>${t("form.newProject")}</h2></div>${closeButton()}</div>`
    + `<form id="project-form" class="drawer-body"><div class="field"><label for="p-name">${t("form.projectNameRequired")}</label><input id="p-name" name="name" required placeholder="${h(t("form.projectNamePlaceholder"))}"></div>`
    + `<div class="field"><label for="p-flow">${t("form.workflow")}</label><select id="p-flow" name="workflow"><option value="development">${t("form.workflowDev")}</option><option value="content">${t("form.workflowContent")}</option></select><p class="muted" id="p-flow-hint">${t("form.workflowDevColumns")}</p></div>`
    + `${pathField("")}<div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close">${t("app.cancel")}</button><button type="submit" class="btn btn-primary">${t("form.createProject")}</button></div></form>`);
  $("#p-name").focus();
}

function projectSettingsForm() {
  const p = project();
  if (!p) return;
  const total = projectCards(p).length;
  modal("project-settings", `<div class="drawer-header"><div class="drawer-heading"><div class="eyebrow">${h(p.name)}</div><h2>${t("app.projectSettings")}</h2></div>${closeButton()}</div>`
    + `<div class="drawer-body"><form id="project-edit-form" class="stack"><div class="field"><label for="e-name">${t("form.projectNameRequired")}</label><input id="e-name" name="name" required value="${h(p.name)}"></div>`
    + `<div class="field"><label>${t("form.workflow")}</label><input value="${h(t(isDev(p) ? "form.workflowDev" : "form.workflowContent"))}" disabled></div>${pathField(p.path)}`
    + `<div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close">${t("app.cancel")}</button><button type="submit" class="btn btn-primary">${t("form.saveSettings")}</button></div></form>`
    // App-wide interface settings live here too, so the phone top bar stays free of rarely used controls.
    + `<section class="section settings-app"><span class="section-label">${t("form.interface")}</span><label class="locale-control"><span>${t("app.language")}</span><select class="locale-select" aria-label="${h(t("app.language"))}">${localeOptions()}</select></label><span class="muted">${t("app.version", {version: h(S.version)})}</span></section>`
    + `<section class="section danger-zone"><span class="section-label">${t("form.deleteProject")}</span><p class="muted">${t("form.deleteProjectWarn", {n: total})}</p>`
    + `<div id="project-delete-zone"><button class="btn btn-danger-text" data-action="delete-project-ask">${t("form.deleteProjectAsk")}</button></div></section></div>`);
}

/* ---------- Actions ---------- */
async function act(action, el) {
  const p = project();
  switch (action) {
    case "close": return closeModal();
    case "backdrop": if (el.classList.contains("modal-backdrop")) closeModal(); return;
    case "new-card": if (p && closeModal()) newCardForm(); return;
    case "new-project": if (closeModal()) newProjectForm(); return;
    case "project-settings": if (closeModal()) projectSettingsForm(); return;
    case "select-project": return switchProject(Number(el.dataset.id));
    case "board": case "overview": currentView = action; render(); return;
    case "history": showHistory = !showHistory; render(); return;
    case "toggle-search": document.body.classList.toggle("search-open"); if (document.body.classList.contains("search-open")) $("#search").focus(); return;
    case "mobile-status": mobileStatus = el.dataset.status; renderBoard(p); return;
    case "jump": return jumpTo(el.dataset.status);
    case "rework": return openDetail(Number(el.dataset.id), {focusComposer: true});
    case "approve": {
      if (modalKind === "detail" && hasDrafts()) { toast(t("toast.saveFirst")); return; }
      const id = Number(el.dataset.id || selectedCardId);
      await api(`/api/cards/${id}/approve`, {});
      if (modalKind === "detail") closeModal(true);
      await refresh(true); toast(t("toast.approved")); return;
    }
    case "run": {
      if (hasDrafts()) { toast(t("toast.saveEdits")); return; }
      await api(`/api/cards/${el.dataset.id}/run`, {}); await refresh(true); toast(t("toast.started")); return;
    }
    case "stop": {
      if (!confirm(t("toast.stopConfirm"))) return;
      await api(`/api/cards/${el.dataset.id}/stop`, {}); toast(t("toast.stopRequested")); setTimeout(() => refresh(true), 800); return;
    }
    case "move": {
      if (hasDrafts()) { toast(t("toast.saveEdits")); return; }
      await api(`/api/cards/${selectedCardId}/move`, {status: el.dataset.status});
      await refresh(true); if (selectedCardId) loadDetail(selectedCardId); toast(t("toast.moved", {column: label(el.dataset.status)})); return;
    }
    case "delete-card-ask":
      $("#delete-zone").innerHTML = `<span class="danger-text">${t("detail.deleteWarn")}</span><button class="btn btn-secondary" data-action="delete-card-cancel">${t("app.cancel")}</button><button class="btn btn-danger" data-action="delete-card-confirm">${t("detail.deleteConfirm")}</button>`;
      return;
    case "delete-card-cancel": loadDetail(selectedCardId, {keepScroll: true}); return;
    case "delete-card-confirm": {
      const card = cardById(selectedCardId);
      await api(`/api/cards/${selectedCardId}/delete`, {}); closeModal(true); await refresh(true); toast(t("toast.taskDeleted", {task: card ? cardName(card) : ""})); return;
    }
    case "delete-project-ask":
      // The project name is user content: shown verbatim in its own element, never inside translated text.
      $("#project-delete-zone").innerHTML = `<div class="field"><label for="confirm-name">${t("form.confirmNameLabel")} <strong class="confirm-name">${h(p.name)}</strong></label><input id="confirm-name" autocomplete="off"></div><div class="form-actions"><button class="btn btn-secondary" data-action="delete-project-cancel">${t("app.cancel")}</button><button class="btn btn-danger" data-action="delete-project-confirm" disabled>${t("form.deleteProjectConfirm")}</button></div>`;
      $("#confirm-name").focus(); return;
    case "delete-project-cancel": $("#project-delete-zone").innerHTML = `<button class="btn btn-danger-text" data-action="delete-project-ask">${t("form.deleteProjectAsk")}</button>`; return;
    case "delete-project-confirm": {
      await api(`/api/projects/${p.id}/delete`, {confirmName: $("#confirm-name").value});
      closeModal(true); projectId = null; await refresh(true); toast(t("toast.projectDeleted", {project: p.name})); return;
    }
    case "native-folder": {
      const form = el.closest("form"), label = el.textContent;
      el.disabled = true; el.textContent = t("form.pickInMac");
      try {
        const result = await api("/api/folders/native", {});
        if (!result.cancelled) { form.elements.path.value = result.path; trackDraft(form); toast(t("toast.folderSelected")); }
      } finally { el.disabled = false; el.textContent = label; }
      return;
    }
  }
}

function switchProject(id) {
  if (!closeModal()) { renderProjects(project()); return; }
  projectId = id; mobileStatus = null; storage("set", "boardProject", projectId); currentView = "board";
  document.body.classList.remove("search-open");
  render();
}

function jumpTo(status) {
  if (isMobile()) { mobileStatus = status; renderBoard(project()); return; }
  const column = document.querySelector(`.column[data-status="${status}"]`);
  if (!column) return;
  column.scrollIntoView({behavior: "smooth", inline: "nearest", block: "nearest"});
  column.classList.remove("flash"); void column.offsetWidth; column.classList.add("flash");
}

async function saveSetting(select) {
  const card = cardById(selectedCardId);
  if (!card) return;
  const setting = select.dataset.setting;
  try {
    if (setting === "priority") {
      await api(`/api/cards/${card.id}/edit`, {priority: select.value});
      toast(t("toast.priority", {level: priorityLabel(select.value)}));
    } else {
      const bar = select.closest(".composer-settings");
      let model = bar.querySelector('[data-setting="model"]').value;
      const entry = S.executionModels.find(m => m.id === model);
      if (setting === "model") {
        bar.querySelector('[data-setting="thinking"]').innerHTML = (entry?.efforts || []).map(e => `<option ${e === entry.defaultEffort ? "selected" : ""}>${h(e)}</option>`).join("");
        bar.querySelector('[data-setting="thinking"]').disabled = !entry;
      }
      const thinking = entry ? bar.querySelector('[data-setting="thinking"]').value : "";
      if (!entry) model = "";
      await api(`/api/cards/${card.id}/execution`, {model, thinking});
      toast(t("toast.nextRun", {model: entry ? `${entry.name} · ${thinking}` : t("detail.codexDefault")}));
    }
    await refresh(true);
  } catch (error) { toast(error.message); loadDetail(card.id, {keepScroll: true}); }
}

/* ---------- Events ---------- */
document.addEventListener("click", async event => {
  const actionEl = event.target.closest("[data-action]");
  if (actionEl) {
    if (actionEl.dataset.action === "backdrop" && event.target !== actionEl) return;
    if (actionEl.disabled) return;
    try { await act(actionEl.dataset.action, actionEl); } catch (error) { toast(error.message); }
    return;
  }
  const check = event.target.closest("[data-check]");
  if (check) {
    const set = checklist.get(check.dataset.check) || new Set();
    check.checked ? set.add(Number(check.dataset.index)) : set.delete(Number(check.dataset.index));
    checklist.set(check.dataset.check, set);
    return;
  }
  const cardEl = event.target.closest("[data-card]");
  if (cardEl) openDetail(Number(cardEl.dataset.card));
});

document.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target, submitter = event.submitter;
  const data = Object.fromEntries(new FormData(form));
  if (submitter) submitter.disabled = true;
  try {
    if (form.id === "project-form") {
      const result = await api("/api/projects", data); formDrafts = {}; closeModal(true);
      projectId = result.id; storage("set", "boardProject", projectId); await refresh(true); toast(t("toast.projectCreated"));
    } else if (form.id === "project-edit-form") {
      await api(`/api/projects/${project().id}/edit`, data); formDrafts = {}; closeModal(true); await refresh(true); toast(t("toast.projectSaved"));
    } else if (form.id === "card-form") {
      const result = await api("/api/cards", {...data, projectId: project().id}); formDrafts = {}; closeModal(true);
      mobileStatus = "backlog"; await refresh(true); openDetail(result.id); toast(t("toast.taskCreated"));
    } else if (form.id === "edit-form") {
      await api(`/api/cards/${selectedCardId}/edit`, data); delete formDrafts[form.id]; await refresh(true); await loadDetail(selectedCardId, {keepScroll: true}); toast(t("toast.detailsSaved"));
    } else if (form.id === "composer") {
      const requeue = submitter?.value === "requeue";
      if (requeue && formDrafts["edit-form"]) throw new Error(t("toast.saveDetailsFirst"));
      if (!requeue && !data.body.trim()) throw new Error(t("err.comment_empty"));
      await api(`/api/cards/${selectedCardId}/${requeue ? "feedback" : "comments"}`, {body: data.body});
      delete formDrafts[form.id];
      await refresh(true);
      if (requeue) { closeModal(true); toast(t("toast.reworkSubmitted")); }
      else { await loadDetail(selectedCardId, {keepScroll: true}); toast(t("toast.commentSaved")); }
    }
  } catch (error) { toast(error.message); }
  finally { if (submitter && document.contains(submitter)) submitter.disabled = false; }
});

document.addEventListener("input", event => {
  if (event.target.id === "confirm-name") { $('[data-action="delete-project-confirm"]').disabled = event.target.value !== project()?.name; return; }
  trackDraft(event.target.closest("#modal-root form"));
});
document.addEventListener("change", event => {
  if (event.target.matches("[data-setting]")) return saveSetting(event.target);
  if (event.target.id === "n-model") {
    const model = S.executionModels.find(m => m.id === event.target.value);
    $("#n-thinking").innerHTML = (model?.efforts || []).map(e => `<option ${e === model.defaultEffort ? "selected" : ""}>${h(e)}</option>`).join("");
  }
  trackDraft(event.target.closest("#modal-root form"));
});
window.addEventListener("beforeunload", event => { if (hasDrafts()) { event.preventDefault(); event.returnValue = ""; } });

$("#search").addEventListener("input", event => { searchText = event.target.value.toLowerCase().trim(); if (project()) renderBoard(project()); });
$("#mobile-project").addEventListener("change", event => {
  if (event.target.value === "new") { event.target.value = String(project()?.id ?? ""); act("new-project"); return; }
  switchProject(Number(event.target.value));
});
let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

$("#auto-toggle").addEventListener("change", async event => {
  const p = project(), enabled = event.target.checked;
  pendingAuto.set(p.id, enabled); render();
  try {
    await api(`/api/projects/${p.id}/auto`, {autoEnabled: enabled});
    pendingAuto.delete(p.id);
    await refresh(true);
    toast(t(enabled ? "auto.toastOn" : "auto.toastOff", {project: p.name}));
  } catch (error) { toast(error.message); }
  finally { pendingAuto.delete(p.id); render(); }
});

document.addEventListener("keydown", event => {
  const typing = event.target.closest?.("input, textarea, select, [contenteditable]");
  if (event.key === "Escape") { if (modalKind) closeModal(); else if (document.body.classList.contains("search-open")) document.body.classList.remove("search-open"); return; }
  if (event.key === "Tab" && modalKind) {
    const controls = [...$("#modal-root .drawer").querySelectorAll('button:not([disabled]),input:not([disabled]),textarea,select:not([disabled]),summary,a[href]')].filter(el => el.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    return;
  }
  const card = event.target.closest?.("[data-card]");
  if (card && event.target === card && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openDetail(Number(card.dataset.card)); return; }
  if (typing || modalKind || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "n" || event.key === "N") { event.preventDefault(); act("new-card"); }
  if (event.key === "/") { event.preventDefault(); document.body.classList.add("search-open"); $("#search").focus(); }
});

/* Drag and drop (desktop). Rendering pauses while dragging so polling cannot drop the card. */
document.addEventListener("dragstart", event => {
  const card = event.target.closest?.("[data-card]");
  if (!card) return;
  dragging = true;
  event.dataTransfer.setData("text/plain", card.dataset.card);
  event.dataTransfer.effectAllowed = "move";
  card.classList.add("dragging");
});
document.addEventListener("dragend", () => {
  dragging = false;
  document.querySelectorAll(".dragging,.drag-over").forEach(x => x.classList.remove("dragging", "drag-over"));
  if (renderPending) { renderPending = false; render(); }
});
document.addEventListener("dragover", event => { const column = event.target.closest?.(".column"); if (column) { event.preventDefault(); column.classList.add("drag-over"); } });
document.addEventListener("dragleave", event => { const column = event.target.closest?.(".column"); if (column && !column.contains(event.relatedTarget)) column.classList.remove("drag-over"); });
document.addEventListener("drop", async event => {
  const column = event.target.closest?.(".column");
  if (!column) return;
  event.preventDefault(); column.classList.remove("drag-over");
  dragging = false;
  const id = Number(event.dataTransfer.getData("text/plain")), status = column.dataset.status;
  if (!id || cardById(id)?.status === status) { if (renderPending) { renderPending = false; render(); } return; }
  try { await api(`/api/cards/${id}/move`, {status}); await refresh(true); toast(t("toast.moved", {column: label(status)})); }
  catch (error) { toast(error.message); render(); }
});

/* Called by setLocale() in i18n.js: rebuild everything that holds interface text. */
function onLocaleChange() {
  document.querySelectorAll(".locale-select").forEach(select => { select.innerHTML = localeOptions(); select.value = currentLocale; });
  setSync(syncKey);
  if (!S) return;
  render();
  if (modalKind === "detail" && selectedCardId && detailData) {
    const drawer = $("#modal-root .drawer"), scroll = drawer?.scrollTop || 0;
    const open = [...document.querySelectorAll("#modal-root details[data-key]")].filter(d => d.open).map(d => d.dataset.key);
    renderDetail();
    open.forEach(key => { const d = document.querySelector(`#modal-root details[data-key="${key}"]`); if (d) d.open = true; });
    if ($("#modal-root .drawer")) $("#modal-root .drawer").scrollTop = scroll;
  } else if (modalKind === "project-settings") projectSettingsForm();
  else if (modalKind === "new-card" && !hasDrafts()) newCardForm();
  else if (modalKind === "new-project" && !hasDrafts()) newProjectForm();
}
document.addEventListener("change", event => {
  if (event.target.matches(".locale-select")) setLocale(event.target.value);
  if (event.target.id === "p-flow") $("#p-flow-hint").textContent = t(event.target.value === "content" ? "form.workflowContentColumns" : "form.workflowDevColumns");
});

applyStaticText();
document.querySelectorAll(".locale-select").forEach(select => { select.innerHTML = localeOptions(); });
refresh(true);
setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
setInterval(tick, 1000);
