"use strict";
/* Codex Kanban front end. Plain JS, no build step.
   Data: GET /api/state (board snapshot with a `rev`), GET /api/cards/<id> (comments + full runs).
   Design rules: see DEVELOPMENT.md → 设计原则 (less is more). */

const LABELS = {backlog:"任务仓",todo:"待办任务",progress:"进行中",review:"审阅中",done:"已完成",cancelled:"已取消"};
const SHORT = {backlog:"仓",todo:"待办",progress:"进行",review:"审阅",done:"完成",cancelled:"取消"};
const HINTS = {backlog:"想法与待整理任务，填好验收标准后放入待办",todo:"任务排队中，自动认领按此顺序执行",progress:"Agent 正在执行",review:"Agent 做完的任务，等你验收或返工",done:"已验收的任务",cancelled:"已取消的任务"};
const PREFIX = {development:"DEV",content:"CNT"};
const PRIORITY = {urgent:{rank:0,label:"紧急"},high:{rank:1,label:"高"},normal:{rank:2,label:"中"},low:{rank:3,label:"低"}};
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

function duration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(s / 60), hrs = Math.floor(m / 60);
  return hrs ? `${hrs}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}
function ago(iso) {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  if (m < 1440) return `${Math.floor(m / 60)} 小时前`;
  return new Date(iso).toLocaleString("zh-CN", {month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit"});
}
const stamp = iso => iso ? new Date(iso).toLocaleString("zh-CN", {month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit"}) : "";

async function api(path, data) {
  const response = await fetch(path, {method: data === undefined ? "GET" : "POST", headers: {"Content-Type": "application/json"},
                                      body: data === undefined ? undefined : JSON.stringify(data)});
  const text = await response.text();
  let result = null;
  try { result = text ? JSON.parse(text) : {}; } catch { result = null; }
  if (!response.ok || result === null) throw new Error(result?.error || `请求失败（HTTP ${response.status}）`);
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

/* ---------- Refresh: only re-render when the server revision changes ---------- */
async function refresh(force = false) {
  try {
    const data = await api(`/api/state${S && !force ? `?rev=${S.rev}` : ""}`);
    $("#sync-status").textContent = "已同步 · 自动更新";
    if (data.unchanged) return;
    const previous = S;
    S = data;
    if (S.projects.length && !S.projects.some(p => p.id === projectId)) {
      projectId = S.projects[0].id; storage("set", "boardProject", projectId); mobileStatus = null;
    }
    render();
    if (modalKind === "detail" && selectedCardId) {
      const now = cardById(selectedCardId), before = previous?.cards.find(c => c.id === selectedCardId);
      if (!now) { closeModal(true); toast("该任务已被删除"); }
      else if (JSON.stringify(now) !== JSON.stringify(before) && !hasDrafts()) loadDetail(selectedCardId, {keepScroll: true});
    }
  } catch (error) {
    $("#sync-status").textContent = "连接中断，正在重试…";
    if (force) toast(error.message);
  }
}

/* ---------- Page ---------- */
function render() {
  if (!S) return;
  if (dragging) { renderPending = true; return; }
  const p = project();
  document.body.classList.toggle("no-project", !p);
  $("#empty").hidden = !!p;
  $("#connection-dot").className = "dot " + (S.codexAvailable ? "ok" : "off");
  $("#connection-text").textContent = S.codexAvailable ? "Codex CLI 可用" : "Codex CLI 未连接";
  renderProjects(p);
  if (!p) { $("#board").innerHTML = ""; $("#overview").innerHTML = ""; $("#agent-control").hidden = true; return; }
  document.title = `${p.name} · Codex Kanban`;
  $("#page-title").textContent = currentView === "board" ? p.name : `${p.name} · 概览`;
  renderAgent(p);
  document.querySelectorAll(".tab").forEach(el => { el.classList.toggle("active", el.dataset.action === currentView); el.setAttribute("aria-selected", String(el.dataset.action === currentView)); });
  // Eye = "show them", eye with a slash = "hide them": the icon names the action the button performs.
  $("#history-toggle").innerHTML = showHistory ? `${icon("eye-off")}隐藏已完成 / 已取消` : `${icon("eye")}显示已完成 / 已取消`;
  $("#history-toggle").setAttribute("aria-pressed", String(showHistory));
  $("#history-toggle").hidden = currentView !== "board";
  $("#search-box").hidden = currentView !== "board";
  $("#mobile-history").innerHTML = showHistory ? `${icon("eye-off")}隐藏已完成` : `${icon("eye")}显示已完成`;
  const needsPath = isDev(p) && !p.path;
  $("#notice").hidden = !needsPath;
  if (needsPath) $("#notice").innerHTML = `尚未关联 Mac 项目目录，Agent 无法执行。<button class="text-button" data-action="project-settings">去设置</button>`;
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
    return `<button class="project-item ${item.id === p?.id ? "active" : ""}" data-action="select-project" data-id="${item.id}">${icon("folder")}<span class="project-name">${h(item.name)}</span>${review ? `<span class="count-badge" title="${review} 个任务等你审阅">${review}</span>` : ""}</button>`;
  }).join("");
  $("#mobile-project").innerHTML = S.projects.map(item => `<option value="${item.id}" ${item.id === p?.id ? "selected" : ""}>${h(item.name)}</option>`).join("")
    + `<option value="new">＋ 新建项目…</option>`;
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
  if (running && running.project_id === p.id) { text = `执行中 · ${cardName(running)}`; dot = "running"; }
  else if (running) { text = "执行中（其他项目）"; dot = enabled ? "on" : "off"; }
  else if (enabled) { text = queued ? `排队 ${queued} · 即将认领` : "空闲 · 等待待办"; dot = "on"; }
  else { text = queued ? `已暂停 · 排队 ${queued}` : "已暂停"; dot = "off"; }
  $("#agent-status").textContent = text;
  $("#agent-dot").className = "agent-dot " + dot;
}

function renderAttention(p) {
  const review = countBy(p, "review"), backlog = countBy(p, "backlog");
  const chips = [];
  if (review) chips.push(`<button class="chip chip-review" data-action="jump" data-status="review">${statusDot("review")}审阅 ${review}</button>`);
  if (backlog) chips.push(`<button class="chip chip-backlog" data-action="jump" data-status="backlog">${statusDot("backlog")}任务仓 ${backlog}</button>`);
  $("#attention").innerHTML = chips.length && currentView === "board" ? `<span class="attention-label">需要你处理</span>${chips.join("")}` : "";
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
    $("#mobile-tabs").innerHTML = all.map(status => {
      const n = countBy(p, status), selected = status === mobileStatus;
      const count = status === "review" && n ? `<span class="count-badge">${n}</span>` : `<span class="tab-count">${n}</span>`;
      return `<button role="tab" aria-selected="${selected}" class="m-tab ${selected ? "active" : ""}" data-action="mobile-status" data-status="${status}">${statusDot(status)}${SHORT[status]}${count}</button>`;
    }).join("");
    $("#mobile-hint").textContent = HINTS[mobileStatus];
    statuses = [mobileStatus];
  }
  const scroll = {};
  document.querySelectorAll(".card-list").forEach(el => { scroll[el.dataset.drop] = el.scrollTop; });
  const focused = document.activeElement?.closest?.("[data-card]")?.dataset.card;
  $("#board").style.setProperty("--columns", statuses.length);
  $("#board").innerHTML = statuses.map(status => {
    const cards = cardsIn(status), n = countBy(p, status);
    const count = status === "review" && n ? `<span class="count-badge">${n}</span>` : `<span class="column-count">${n}</span>`;
    const hint = status === "todo" && isDev(p) ? `<span class="column-hint">任务排队中</span>` : "";
    return `<div class="column" data-status="${status}"><div class="column-header">${statusDot(status)}<span class="column-title">${LABELS[status]}</span>${count}${hint}</div>`
      + `<div class="card-list" data-drop="${status}">${cards.length ? cards.map((c, i) => renderCard(c, p, i)).join("") : `<div class="empty-column">${searchText ? "没有匹配的任务" : "暂无任务"}</div>`}</div></div>`;
  }).join("");
  document.querySelectorAll(".card-list").forEach(el => { if (scroll[el.dataset.drop]) el.scrollTop = scroll[el.dataset.drop]; });
  if (focused) document.querySelector(`[data-card="${focused}"]`)?.focus({preventScroll: true});
  tick();
}

function priorityChip(card) {
  return card.priority === "urgent" || card.priority === "high" ? `<span class="prio prio-${card.priority}">${PRIORITY[card.priority].label}</span>` : "";
}

function renderCard(card, p, index) {
  const run = card.latestRun;
  const parts = [];
  const seq = card.status === "todo" && isDev(p) ? `<span class="seq ${index === 0 ? "first" : ""}">${index + 1}</span>` : "";
  const right = card.status === "review" && !card.issue ? `<span class="card-time">${ago(run?.ended_at || card.updated_at)}</span>` : priorityChip(card);
  parts.push(`<div class="card-top">${seq}<span class="card-id">${cardName(card)}</span>${card.status === "review" && !card.issue ? priorityChip(card) : ""}${right}</div>`);
  parts.push(`<div class="card-title">${h(card.title)}</div>`);
  if (card.status === "backlog" && isDev(p) && !card.acceptance.trim()) parts.push(`<div class="card-note">缺验收标准</div>`);
  if (card.status === "progress" && run) {
    const wait = run.retry_wait ? `等待重试 ${run.retry_count}/2` : (run.activity || "准备中");
    parts.push(`<div class="card-run"><span class="elapsed" data-since="${h(run.started_at)}"></span><span class="run-activity">${h(wait)}</span><button class="btn btn-secondary btn-sm" data-action="stop" data-id="${card.id}">停止</button></div>`);
  }
  if (card.issue) parts.push(`<div class="card-issue">${icon("warning")}<span>${card.issue.title === "已手动停止" || card.issue.title === "执行超时" ? h(card.issue.title) : "执行失败 · " + h(card.issue.title)}</span></div>`);
  else if (card.status === "review" && run?.outputPreview) parts.push(`<div class="card-preview">${h(run.outputPreview.split("\n").find(line => line.trim()) || "")}</div>`);
  const tags = card.tags.split(",").map(x => x.trim()).filter(Boolean).slice(0, 3).map(tag => `<span class="tag">${h(tag)}</span>`);
  if (card.pendingFeedbackCount) tags.push(`<span class="feedback-badge">${icon("comment")}新反馈 ${card.pendingFeedbackCount} · 未交给 Agent</span>`);
  if (tags.length) parts.push(`<div class="card-meta">${tags.join("")}</div>`);
  if (card.status === "review") {
    const rework = isDev(p) ? `<button class="btn btn-secondary btn-sm" data-action="rework" data-id="${card.id}">返工</button>` : "";
    const approve = card.issue ? "" : `<button class="btn btn-primary btn-sm" data-action="approve" data-id="${card.id}">验收通过</button>`;
    if (rework || approve) parts.push(`<div class="card-actions">${rework}${approve}</div>`);
  }
  const label = `${cardName(card)} ${card.title}${card.issue ? "，执行失败" : ""}${card.pendingFeedbackCount ? "，有新反馈" : ""}`;
  return `<article class="card ${card.issue ? "is-failed" : ""} ${card.status === "progress" ? "is-running" : ""}" draggable="${card.status !== "progress"}" data-card="${card.id}" tabindex="0" role="button" aria-label="${h(label)}">${parts.join("")}</article>`;
}

function renderOverview(p) {
  const n = s => countBy(p, s);
  const total = projectCards(p).length;
  const stats = isDev(p)
    ? [["需要你处理", n("backlog") + n("review"), `任务仓 ${n("backlog")} · 审阅 ${n("review")}`], ["Agent 队列", n("todo") + n("progress"), `待办 ${n("todo")} · 执行中 ${n("progress")}`], ["已完成", n("done"), `已取消 ${n("cancelled")}`], ["全部任务", total, ""]]
    : [["需要你处理", n("backlog") + n("review"), `任务仓 ${n("backlog")} · 审阅 ${n("review")}`], ["已完成", n("done"), `已取消 ${n("cancelled")}`], ["全部任务", total, ""]];
  $("#overview").innerHTML = stats.map(([label, value, sub]) => `<div class="stat-card"><small>${label}</small><strong>${value}</strong><span>${sub}</span></div>`).join("")
    + `<div class="overview-panel"><h3>项目设置</h3><p>流程：${isDev(p) ? "开发看板（任务仓 → 待办 → Agent 执行 → 审阅验收）" : "内容选题（任务仓 → 审阅 → 完成）"}<br>Mac 目录：${p.path ? h(p.path) : "未关联"}${isDev(p) ? `<br>自动认领：${p.auto_enabled ? "已开启" : "已关闭"} · 单轮执行上限 ${S.runTimeoutMinutes || "不限"} 分钟` : ""}</p></div>`;
}

/* Elapsed timers update text only; no re-render. */
function tick() {
  document.querySelectorAll("[data-since]").forEach(el => { el.textContent = duration(Date.now() - new Date(el.dataset.since)); });
}

/* ---------- Drawers ---------- */
function modal(kind, content) {
  modalKind = kind;
  document.body.style.overflow = "hidden";
  $("#modal-root").innerHTML = `<div class="modal-backdrop" data-action="backdrop"><aside class="drawer" role="dialog" aria-modal="true" aria-label="任务看板面板">${content}</aside></div>`;
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
  if (!force && hasDrafts() && !confirm("有尚未保存的内容，确认放弃？")) return false;
  $("#modal-root").innerHTML = "";
  selectedCardId = null; detailData = null; modalKind = null; formDrafts = {};
  document.body.style.overflow = "";
  return true;
}

const closeButton = `<button class="icon-button" data-action="close" aria-label="关闭">${icon("close")}</button>`;

function modelControls(card, disabled) {
  const models = S.executionModels;
  if (!models.length) return `<select class="mini-select" disabled title="未读取到本机模型列表，将使用 Codex 默认配置"><option>Codex 默认配置</option></select>`;
  const chosen = card.model || S.executionDefaults.model;
  const model = models.find(m => m.id === chosen);
  const effort = card.thinking || model?.defaultEffort || "";
  return `<select class="mini-select" data-setting="model" aria-label="模型" ${disabled ? "disabled" : ""}>${!model ? `<option value="">Codex 默认</option>` : ""}${models.map(m => `<option value="${h(m.id)}" ${m.id === chosen ? "selected" : ""}>${h(m.name)}</option>`).join("")}</select>`
    + `<select class="mini-select" data-setting="thinking" aria-label="Thinking 档位" ${disabled || !model ? "disabled" : ""}>${(model?.efforts || []).map(e => `<option ${e === effort ? "selected" : ""}>${h(e)}</option>`).join("")}</select>`;
}
function priorityControl(card) {
  return `<select class="mini-select" data-setting="priority" aria-label="优先级">${Object.entries(PRIORITY).map(([id, v]) => `<option value="${id}" ${id === card.priority ? "selected" : ""}>优先级 ${v.label}</option>`).join("")}</select>`;
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
  if (!detailData || detailData.card.id !== cardId) modal("detail", `<div class="drawer-header"><div class="drawer-heading"><div class="eyebrow">${cardName(card)}</div><h2>${h(card.title)}</h2></div>${closeButton}</div><div class="drawer-body"><p class="muted">正在加载…</p></div>`);
  loadDetail(cardId, options);
}

function decisionBar(card, p, runs) {
  const latest = runs[0];
  if (card.status === "review" && card.issue) {
    return `<div class="decision is-failed"><div class="decision-text"><strong>${icon("warning")}${h(card.issue.title)}</strong><span>${h(card.issue.action)}</span></div></div>`;
  }
  if (card.status === "review") {
    const text = isDev(p) ? "Agent 已完成，等你验收" : "等你审阅";
    return `<div class="decision"><div class="decision-text"><strong>${text}</strong><span>对照下方验收标准检查结果</span></div><button class="btn btn-primary" data-action="approve" data-id="${card.id}">验收通过</button></div>`;
  }
  if (card.status === "progress" && latest) {
    const doing = latest.retry_wait ? `网络或服务受限，${latest.retry_wait} 秒后重试（${latest.retry_count}/2）` : (latest.activity || "准备中");
    return `<div class="decision is-running"><div class="decision-text"><strong>Agent 执行中 · <span data-since="${h(latest.started_at)}"></span></strong><span>${h(doing)}</span></div><button class="btn btn-primary" data-action="stop" data-id="${card.id}">停止</button></div>`;
  }
  if (card.status === "todo" && isDev(p)) {
    const queue = sortCards("todo", projectCards(p).filter(c => c.status === "todo"));
    const position = queue.findIndex(c => c.id === card.id) + 1;
    const note = p.auto_enabled ? "自动认领已开启，将按顺序执行" : "自动认领已关闭，可立即手动运行";
    return `<div class="decision"><div class="decision-text"><strong>排队中 · 第 ${position} 位</strong><span>${note}</span></div><button class="btn btn-primary" data-action="run" data-id="${card.id}">立即运行</button></div>`;
  }
  if (card.status === "backlog") {
    if (isDev(p)) {
      const ready = !!card.acceptance.trim();
      return `<div class="decision"><div class="decision-text"><strong>在任务仓</strong><span>${ready ? "放入待办后，Agent 才会执行" : "先在任务详情中填写验收标准，才能放入待办"}</span></div><button class="btn btn-primary" data-action="move" data-status="todo" ${ready ? "" : "disabled"}>放入待办</button></div>`;
    }
    return `<div class="decision"><div class="decision-text"><strong>在任务仓</strong><span>整理好后送去审阅</span></div><button class="btn btn-primary" data-action="move" data-status="review">送去审阅</button></div>`;
  }
  return "";
}

function resultSection(card, runs) {
  const run = runs[0];
  if (!run || run.status === "running") return "";
  const took = run.ended_at ? ` · 用时 ${duration(new Date(run.ended_at) - new Date(run.started_at))}` : "";
  const model = run.model ? ` · ${h(run.model)}${run.thinking ? " · " + h(run.thinking) : ""}` : "";
  const body = run.status === "failed"
    ? `<pre class="result-body is-error">${h(run.error || "没有错误详情")}</pre>`
    : `<div class="result-body">${h(run.output || "（没有文字结果）")}</div>`;
  return `<section class="section"><div class="section-head"><span class="section-label">本轮结果</span><span class="muted">${ago(run.ended_at || run.started_at)}${took}${model}</span></div>${body}</section>`;
}

function acceptanceSection(card, runs) {
  const lines = card.acceptance.split("\n").map(x => x.replace(/^\s*[-*·•\d.、)]+\s*/, "").trim()).filter(Boolean);
  if (!lines.length) return `<section class="section"><span class="section-label">验收标准</span><p class="muted">未填写。在下方“任务详情”中补充。</p></section>`;
  const key = `${card.id}:${runs[0]?.id || 0}`;
  const checked = checklist.get(key) || new Set();
  const checkable = card.status === "review";
  return `<section class="section"><span class="section-label">验收标准${checkable ? `<span class="muted"> · 勾选仅用于本次核对，不保存</span>` : ""}</span><div class="checklist">${lines.map((line, i) => checkable
    ? `<label class="check"><input type="checkbox" data-check="${key}" data-index="${i}" ${checked.has(i) ? "checked" : ""}><span>${h(line)}</span></label>`
    : `<div class="check">· ${h(line)}</div>`).join("")}</div></section>`;
}

/* Link to the executor's own record of a run. Each executor declares how its runs can be opened;
   only Codex (codex://threads/<id>, Mac Codex App) exists today. Hidden where the app cannot open it. */
const EXECUTOR_LINKS = {
  codex: run => run.thread_id && onMac ? {href: `codex://threads/${encodeURIComponent(run.thread_id)}`, label: "在 Codex 中查看过程 ↗"} : null,
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
    ? `<button type="submit" class="btn btn-secondary" name="intent" value="comment">仅保存评论</button><button type="submit" class="btn btn-primary" name="intent" value="requeue">提交并返工</button>`
    : `<button type="submit" class="btn btn-primary" name="intent" value="comment">保存评论</button>`;
  const hint = rework && card.pendingFeedbackCount ? `<p class="muted">已有 ${card.pendingFeedbackCount} 条评论尚未交给 Agent；留空直接“提交并返工”也会一并交付。</p>` : "";
  return `<form id="composer" class="section composer"><label class="section-label" for="composer-body">${rework ? "返工意见" : "评论"}</label>`
    + `<textarea id="composer-body" name="body" placeholder="${rework ? "写给 Agent 的修改意见。可先“仅保存评论”，调整优先级后再返工。" : "记录想法、补充信息或审阅结论"}"></textarea>${hint}`
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
    if (e.kind === "comment") return `<div class="msg msg-you"><div class="msg-meta">你 · ${stamp(e.at)}</div><div class="msg-body">${h(e.item.body)}</div></div>`;
    round += 1;
    const r = e.item, state = r.status === "completed" ? "完成" : "失败";
    return `<div class="msg msg-agent ${r.status === "failed" ? "is-failed" : ""}"><div class="msg-meta">Agent · 第 ${round} 轮 · ${state} · ${stamp(e.at)}${r.model ? ` · ${h(r.model)}` : ""}</div><div class="msg-body">${h(r.status === "failed" ? (r.error || "没有错误详情") : (r.output || "（没有文字结果）"))}</div>${processLink(r)}</div>`;
  }).join("");
  return `<details class="fold" data-key="history"><summary><span>执行记录</span><span class="muted">${total} 轮 · ${comments.length} 条评论</span></summary><div class="thread">${items}</div></details>`;
}

function detailsSection(card) {
  const meta = [card.tags && `标签 ${h(card.tags)}`, card.description && "有说明"].filter(Boolean).join(" · ");
  return `<details class="fold" data-key="details"><summary><span>任务详情</span><span class="muted">${meta || "说明、验收标准、标签"}</span></summary>`
    + `<form id="edit-form" class="fold-body"><div class="field"><label for="f-title">标题</label><input id="f-title" name="title" value="${h(card.title)}" required></div>`
    + `<div class="field"><label for="f-desc">说明</label><textarea id="f-desc" name="description">${h(card.description)}</textarea></div>`
    + `<div class="field"><label for="f-acc">验收标准</label><textarea id="f-acc" name="acceptance" placeholder="每行一条，完成后如何确认结果">${h(card.acceptance)}</textarea></div>`
    + `<div class="form-grid"><div class="field"><label for="f-tags">标签</label><input id="f-tags" name="tags" value="${h(card.tags)}" placeholder="逗号分隔"></div><div class="field"><label for="f-src">来源链接</label><input id="f-src" name="source" value="${h(card.source)}" placeholder="https://"></div></div>`
    + `<div class="form-actions"><button type="submit" class="btn btn-primary">保存详情</button></div></form></details>`;
}

function manageSection(card, p) {
  const targets = S.workflows[p.workflow].filter(s => !["progress", "done", card.status].includes(s));
  const locked = card.status === "progress";
  return `<details class="fold" data-key="manage"><summary><span>移到其他列 / 删除</span></summary><div class="fold-body">`
    + `<div class="move-row">${targets.map(s => `<button class="btn btn-secondary" data-action="move" data-status="${s}" ${locked ? "disabled" : ""}>${statusDot(s)}${LABELS[s]}</button>`).join("")}</div>`
    + `<div id="delete-zone" class="danger-row"><button class="btn btn-danger-text" data-action="delete-card-ask" ${locked ? "disabled" : ""}>删除任务</button>${locked ? `<span class="muted">执行中的任务不能移动或删除</span>` : ""}</div>`
    + `</div></details>`;
}

function renderDetail() {
  const card = cardById(selectedCardId) || detailData.card;
  const full = {...detailData.card, ...card};
  const p = projectOf(full) || project();
  const {comments, runs} = detailData;
  const rounds = runs.length ? ` · 第 ${runs.length} 轮` : "";
  modal("detail", `<div class="drawer-header"><div class="drawer-heading"><div class="eyebrow">${cardName(full)}<span class="pill pill-${full.status}">${statusDot(full.status)}${LABELS[full.status]}</span>${rounds}</div><h2>${h(full.title)}</h2></div>${closeButton}</div>`
    + `${decisionBar(full, p, runs)}<div class="drawer-body">${resultSection(full, runs)}${acceptanceSection(full, runs)}${composer(full, p)}`
    + `<div class="folds">${historySection(full, comments, runs)}${detailsSection(full)}${manageSection(full, p)}</div></div>`);
  const header = $("#modal-root .drawer-header");
  if (header) $("#modal-root .drawer").style.setProperty("--header-h", header.offsetHeight + "px");
  tick();
}

function newCardForm() {
  const p = project();
  modal("new-card", `<div class="drawer-header"><div class="drawer-heading"><div class="eyebrow">${h(p.name)}</div><h2>新建任务</h2></div>${closeButton}</div>`
    + `<form id="card-form" class="drawer-body">`
    + `<div class="field"><label for="n-title">标题 *</label><input id="n-title" name="title" required placeholder="清楚描述要解决的问题"></div>`
    + `<div class="field"><label for="n-desc">说明</label><textarea id="n-desc" name="description" placeholder="背景、目标和限制条件"></textarea></div>`
    + `<div class="field"><label for="n-acc">验收标准</label><textarea id="n-acc" name="acceptance" placeholder="每行一条。${isDev(p) ? "进入待办前必须填写。" : ""}"></textarea></div>`
    + `<details class="fold"><summary><span>更多选项</span><span class="muted">优先级、标签、来源${isDev(p) ? "、模型" : ""}</span></summary><div class="fold-body">`
    + `<div class="form-grid"><div class="field"><label for="n-prio">优先级</label><select id="n-prio" name="priority">${Object.entries(PRIORITY).map(([id, v]) => `<option value="${id}" ${id === "normal" ? "selected" : ""}>${v.label}</option>`).join("")}</select></div>`
    + `<div class="field"><label for="n-tags">标签</label><input id="n-tags" name="tags" placeholder="逗号分隔"></div></div>`
    + `<div class="field"><label for="n-src">来源链接</label><input id="n-src" name="source" type="url" placeholder="https://"></div>`
    + (isDev(p) && S.executionModels.length ? newCardModelFields() : "")
    + `</div></details><p class="muted">新任务先进入任务仓${isDev(p) ? "，放入待办后才会执行" : ""}。</p>`
    + `<div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close">取消</button><button type="submit" class="btn btn-primary">新建任务</button></div></form>`);
  $("#n-title").focus();
}
function newCardModelFields() {
  const chosen = S.executionDefaults.model, model = S.executionModels.find(m => m.id === chosen) || S.executionModels[0];
  return `<div class="form-grid"><div class="field"><label for="n-model">模型</label><select id="n-model" name="model">${S.executionModels.map(m => `<option value="${h(m.id)}" ${m.id === model.id ? "selected" : ""}>${h(m.name)}</option>`).join("")}</select></div>`
    + `<div class="field"><label for="n-thinking">Thinking 档位</label><select id="n-thinking" name="thinking">${model.efforts.map(e => `<option ${e === (S.executionDefaults.thinking || model.defaultEffort) ? "selected" : ""}>${h(e)}</option>`).join("")}</select></div></div>`;
}

function pathField(value) {
  return `<div class="field"><label for="project-path">Mac 项目目录</label><div class="path-row"><input id="project-path" name="path" value="${h(value)}" placeholder="/Users/你/项目目录">${onMac ? `<button type="button" class="btn btn-secondary" data-action="native-folder">选择文件夹…</button>` : ""}</div><p class="muted">${onMac ? "点击选择文件夹会打开 Mac 系统窗口，也可直接输入完整路径。" : "请输入运行看板的 Mac 上的完整项目路径。"}开发任务执行前需设置目录。</p></div>`;
}

function newProjectForm() {
  modal("new-project", `<div class="drawer-header"><div class="drawer-heading"><div class="eyebrow">NEW PROJECT</div><h2>新建项目</h2></div>${closeButton}</div>`
    + `<form id="project-form" class="drawer-body"><div class="field"><label for="p-name">项目名称 *</label><input id="p-name" name="name" required placeholder="例如：我的应用"></div>`
    + `<div class="field"><label for="p-flow">工作流</label><select id="p-flow" name="workflow"><option value="development">开发看板 · 任务仓 / 待办 / 进行中 / 审阅中</option><option value="content">内容选题 · 任务仓 / 审阅中 / 已完成 / 已取消</option></select></div>`
    + `${pathField("")}<div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close">取消</button><button type="submit" class="btn btn-primary">创建项目</button></div></form>`);
  $("#p-name").focus();
}

function projectSettingsForm() {
  const p = project();
  if (!p) return;
  const total = projectCards(p).length;
  modal("project-settings", `<div class="drawer-header"><div class="drawer-heading"><div class="eyebrow">PROJECT SETTINGS</div><h2>项目设置</h2></div>${closeButton}</div>`
    + `<div class="drawer-body"><form id="project-edit-form" class="stack"><div class="field"><label for="e-name">项目名称 *</label><input id="e-name" name="name" required value="${h(p.name)}"></div>`
    + `<div class="field"><label>工作流</label><input value="${isDev(p) ? "开发看板" : "内容选题"}" disabled></div>${pathField(p.path)}`
    + `<div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close">取消</button><button type="submit" class="btn btn-primary">保存设置</button></div></form>`
    + `<section class="section danger-zone"><span class="section-label">删除项目</span><p class="muted">将删除项目及其中 ${total} 个任务、全部评论与执行记录，无法恢复。不会删除 Mac 上的项目文件。</p>`
    + `<div id="project-delete-zone"><button class="btn btn-danger-text" data-action="delete-project-ask">删除项目…</button></div></section></div>`);
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
      if (modalKind === "detail" && hasDrafts()) { toast("请先保存或清空未保存的内容"); return; }
      const id = Number(el.dataset.id || selectedCardId);
      await api(`/api/cards/${id}/approve`, {});
      if (modalKind === "detail") closeModal(true);
      await refresh(true); toast("验收通过，任务已完成"); return;
    }
    case "run": {
      if (hasDrafts()) { toast("请先保存修改或评论"); return; }
      await api(`/api/cards/${el.dataset.id}/run`, {}); await refresh(true); toast("Codex 已开始执行"); return;
    }
    case "stop": {
      if (!confirm("停止后本轮记为失败，已产生的文件改动会保留。确认停止？")) return;
      await api(`/api/cards/${el.dataset.id}/stop`, {}); toast("已发送停止指令"); setTimeout(() => refresh(true), 800); return;
    }
    case "move": {
      if (hasDrafts()) { toast("请先保存修改或评论"); return; }
      await api(`/api/cards/${selectedCardId}/move`, {status: el.dataset.status});
      await refresh(true); if (selectedCardId) loadDetail(selectedCardId); toast(`已移到${LABELS[el.dataset.status]}`); return;
    }
    case "delete-card-ask":
      $("#delete-zone").innerHTML = `<span class="danger-text">删除后评论与执行记录一并删除，无法恢复。</span><button class="btn btn-secondary" data-action="delete-card-cancel">取消</button><button class="btn btn-danger" data-action="delete-card-confirm">确认删除</button>`;
      return;
    case "delete-card-cancel": loadDetail(selectedCardId, {keepScroll: true}); return;
    case "delete-card-confirm": {
      const card = cardById(selectedCardId);
      await api(`/api/cards/${selectedCardId}/delete`, {}); closeModal(true); await refresh(true); toast(`${card ? cardName(card) : "任务"} 已删除`); return;
    }
    case "delete-project-ask":
      $("#project-delete-zone").innerHTML = `<div class="field"><label for="confirm-name">输入项目名称“${h(p.name)}”以确认</label><input id="confirm-name" autocomplete="off"></div><div class="form-actions"><button class="btn btn-secondary" data-action="delete-project-cancel">取消</button><button class="btn btn-danger" data-action="delete-project-confirm" disabled>永久删除项目</button></div>`;
      $("#confirm-name").focus(); return;
    case "delete-project-cancel": $("#project-delete-zone").innerHTML = `<button class="btn btn-danger-text" data-action="delete-project-ask">删除项目…</button>`; return;
    case "delete-project-confirm": {
      await api(`/api/projects/${p.id}/delete`, {confirmName: $("#confirm-name").value});
      closeModal(true); projectId = null; await refresh(true); toast(`项目“${p.name}”已删除`); return;
    }
    case "native-folder": {
      const form = el.closest("form"), label = el.textContent;
      el.disabled = true; el.textContent = "请在 Mac 窗口选择…";
      try {
        const result = await api("/api/folders/native", {});
        if (!result.cancelled) { form.elements.path.value = result.path; trackDraft(form); toast("已选择项目文件夹"); }
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
      toast(`优先级已改为${PRIORITY[select.value].label}`);
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
      toast(`下一轮使用 ${entry ? entry.name + " · " + thinking : "Codex 默认配置"}`);
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
      projectId = result.id; storage("set", "boardProject", projectId); await refresh(true); toast("项目已创建");
    } else if (form.id === "project-edit-form") {
      await api(`/api/projects/${project().id}/edit`, data); formDrafts = {}; closeModal(true); await refresh(true); toast("项目设置已保存");
    } else if (form.id === "card-form") {
      const result = await api("/api/cards", {...data, projectId: project().id}); formDrafts = {}; closeModal(true);
      mobileStatus = "backlog"; await refresh(true); openDetail(result.id); toast("任务已创建到任务仓");
    } else if (form.id === "edit-form") {
      await api(`/api/cards/${selectedCardId}/edit`, data); delete formDrafts[form.id]; await refresh(true); await loadDetail(selectedCardId, {keepScroll: true}); toast("详情已保存");
    } else if (form.id === "composer") {
      const requeue = submitter?.value === "requeue";
      if (requeue && formDrafts["edit-form"]) throw new Error("请先保存任务详情，再提交返工");
      if (!requeue && !data.body.trim()) throw new Error("评论不能为空");
      await api(`/api/cards/${selectedCardId}/${requeue ? "feedback" : "comments"}`, {body: data.body});
      delete formDrafts[form.id];
      await refresh(true);
      if (requeue) { closeModal(true); toast("已提交返工，任务回到待办"); }
      else { await loadDetail(selectedCardId, {keepScroll: true}); toast("评论已保存"); }
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
    toast(`${p.name}：自动认领${enabled ? "已开启" : "已暂停"}`);
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
  try { await api(`/api/cards/${id}/move`, {status}); await refresh(true); toast("已移到" + LABELS[status]); }
  catch (error) { toast(error.message); render(); }
});

refresh(true);
setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
setInterval(tick, 1000);
