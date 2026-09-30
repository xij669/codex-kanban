"use strict";
/* Interface copy, looked up by key: t("key", {params}).
   - Only interface text lives here. Project names, task content, comments, tags, paths and
     agent output are user content and are never translated.
   - Every key needs zh, en and ja. i18n_test.py checks that each t("…") key used in app.js,
     each data-i18n key in index.html and each server error / failure code exists here.
   - Plurals: give {one, other}; the form is chosen with Intl.PluralRules.
   - Placeholders: {name}. Values are inserted as-is; callers escape HTML where needed. */

const LOCALES = [
  // Language names are always shown in their own language.
  {id: "zh-CN", name: "简体中文", short: "中"},
  {id: "en", name: "English", short: "EN"},
  {id: "ja", name: "日本語", short: "日"},
];

const MESSAGES = {
  // App shell
  "app.language": {zh: "语言", en: "Language", ja: "言語"},
  "app.newProject": {zh: "新建项目", en: "New project", ja: "新規プロジェクト"},
  "app.newProjectMenu": {zh: "＋ 新建项目…", en: "+ New project…", ja: "＋ 新規プロジェクト…"},
  "app.projects": {zh: "项目", en: "Projects", ja: "プロジェクト"},
  "app.selectProject": {zh: "选择项目", en: "Select project", ja: "プロジェクトを選択"},
  "app.projectSettings": {zh: "项目设置", en: "Project settings", ja: "プロジェクト設定"},
  "app.newTask": {zh: "新建任务", en: "New task", ja: "新規タスク"},
  "app.board": {zh: "看板", en: "Board", ja: "ボード"},
  "app.overview": {zh: "概览", en: "Overview", ja: "概要"},
  "app.search": {zh: "搜索", en: "Search", ja: "検索"},
  "app.searchTasks": {zh: "搜索任务", en: "Search tasks", ja: "タスクを検索"},
  "app.boardColumns": {zh: "看板列", en: "Board columns", ja: "ボードの列"},
  "app.taskBoard": {zh: "任务看板", en: "Task board", ja: "タスクボード"},
  "app.panel": {zh: "任务看板面板", en: "Task board panel", ja: "タスクボードパネル"},
  "app.close": {zh: "关闭", en: "Close", ja: "閉じる"},
  "app.cancel": {zh: "取消", en: "Cancel", ja: "キャンセル"},
  "app.loading": {zh: "正在加载…", en: "Loading…", ja: "読み込み中…"},
  "app.checkingCodex": {zh: "检查 Codex…", en: "Checking Codex…", ja: "Codex を確認中…"},
  "app.connecting": {zh: "正在连接…", en: "Connecting…", ja: "接続中…"},
  "app.synced": {zh: "已同步 · 自动更新", en: "Synced · auto refresh", ja: "同期済み · 自動更新"},
  "app.offline": {zh: "连接中断，正在重试…", en: "Connection lost · retrying…", ja: "接続が切れました · 再接続中…"},
  "app.codexOk": {zh: "Codex CLI 可用", en: "Codex CLI available", ja: "Codex CLI 利用可能"},
  "app.codexOff": {zh: "Codex CLI 未连接", en: "Codex CLI unavailable", ja: "Codex CLI に接続できません"},
  "app.noProjects": {zh: "还没有项目", en: "No projects yet", ja: "プロジェクトがありません"},
  "app.noProjectsHint": {zh: "新建一个项目，开始记录任务。", en: "Create a project to start tracking tasks.", ja: "プロジェクトを作成してタスクを記録しましょう。"},
  "app.version": {zh: "Codex Kanban v{version}", en: "Codex Kanban v{version}", ja: "Codex Kanban v{version}"},
  "app.showDone": {zh: "显示已完成 / 已取消", en: "Show done / cancelled", ja: "完了・キャンセルを表示"},
  "app.hideDone": {zh: "隐藏已完成 / 已取消", en: "Hide done / cancelled", ja: "完了・キャンセルを隠す"},
  "app.showDoneShort": {zh: "显示已完成", en: "Show done", ja: "完了を表示"},
  "app.hideDoneShort": {zh: "隐藏已完成", en: "Hide done", ja: "完了を隠す"},
  "app.needsYou": {zh: "需要你处理", en: "Needs you", ja: "対応が必要"},
  "app.noPath": {zh: "尚未关联 Mac 项目目录，Agent 无法执行。", en: "No Mac project folder linked, so the Agent cannot run tasks.", ja: "Mac のプロジェクトフォルダが未設定のため、エージェントは実行できません。"},
  "app.openSettings": {zh: "去设置", en: "Open settings", ja: "設定を開く"},
  "app.discardChanges": {zh: "有尚未保存的内容，确认放弃？", en: "Discard unsaved changes?", ja: "未保存の変更を破棄しますか？"},

  // Columns: long name, short name (phone tabs), one-line phone hint
  "status.backlog": {zh: "任务仓", en: "Backlog", ja: "バックログ"},
  "status.todo": {zh: "待办任务", en: "To do", ja: "未着手"},
  "status.progress": {zh: "进行中", en: "In progress", ja: "進行中"},
  "status.review": {zh: "审阅中", en: "In review", ja: "レビュー中"},
  "status.done": {zh: "已完成", en: "Done", ja: "完了"},
  "status.cancelled": {zh: "已取消", en: "Cancelled", ja: "キャンセル済み"},
  "short.backlog": {zh: "仓", en: "Backlog", ja: "バックログ"},
  "short.todo": {zh: "待办", en: "To do", ja: "未着手"},
  "short.progress": {zh: "进行", en: "Doing", ja: "進行中"},
  "short.review": {zh: "审阅", en: "Review", ja: "レビュー"},
  "short.done": {zh: "完成", en: "Done", ja: "完了"},
  "short.cancelled": {zh: "取消", en: "Cancelled", ja: "中止"},
  "hint.backlog": {zh: "填好验收标准后放入待办", en: "Add criteria, then move to To do", ja: "基準を書いて未着手へ"},
  "hint.todo": {zh: "按此顺序自动执行", en: "Runs in this order", ja: "この順に実行"},
  "hint.progress": {zh: "Agent 正在执行", en: "Agent is working", ja: "エージェント実行中"},
  "hint.review": {zh: "等你验收或返工", en: "Approve or revise", ja: "承認または修正依頼"},
  "hint.done": {zh: "已验收的任务", en: "Approved tasks", ja: "承認済み"},
  "hint.cancelled": {zh: "已取消的任务", en: "Cancelled tasks", ja: "キャンセル済み"},
  "column.queued": {zh: "按顺序执行", en: "Run order", ja: "実行順"},
  "column.empty": {zh: "暂无任务", en: "No tasks", ja: "タスクなし"},
  "column.noMatch": {zh: "没有匹配的任务", en: "No matching tasks", ja: "該当なし"},
  "chip.review": {zh: "审阅 {n}", en: "Review {n}", ja: "レビュー {n}"},
  "chip.backlog": {zh: "任务仓 {n}", en: "Backlog {n}", ja: "バックログ {n}"},

  // Priority
  "priority.label": {zh: "优先级", en: "Priority", ja: "優先度"},
  "priority.urgent": {zh: "紧急", en: "Urgent", ja: "緊急"},
  "priority.high": {zh: "高", en: "High", ja: "高"},
  "priority.normal": {zh: "中", en: "Medium", ja: "中"},
  "priority.low": {zh: "低", en: "Low", ja: "低"},

  // Auto-run control
  "auto.label": {zh: "自动认领", en: "Auto-run", ja: "自動実行"},
  "auto.aria": {zh: "自动认领当前项目的待办", en: "Auto-run queued tasks in this project", ja: "このプロジェクトの未着手タスクを自動実行"},
  "auto.running": {zh: "执行中 · {task}", en: "Running · {task}", ja: "実行中 · {task}"},
  "auto.runningElsewhere": {zh: "执行中（其他项目）", en: "Running in another project", ja: "別プロジェクトで実行中"},
  "auto.queued": {zh: "排队 {n} · 即将认领", en: "{n} queued · starting soon", ja: "{n} 件待ち · まもなく開始"},
  "auto.idle": {zh: "空闲 · 等待待办", en: "Idle · nothing queued", ja: "待機中 · タスクなし"},
  "auto.pausedQueued": {zh: "已暂停 · 排队 {n}", en: "Paused · {n} queued", ja: "一時停止 · {n} 件待ち"},
  "auto.paused": {zh: "已暂停", en: "Paused", ja: "一時停止"},
  "auto.toastOn": {zh: "{project}：自动认领已开启", en: "{project}: auto-run on", ja: "{project}：自動実行オン"},
  "auto.toastOff": {zh: "{project}：自动认领已暂停", en: "{project}: auto-run paused", ja: "{project}：自動実行を一時停止"},

  // Cards
  "card.missingCriteria": {zh: "缺验收标准", en: "Criteria missing", ja: "受け入れ基準なし"},
  "card.unsentFeedback": {zh: {other: "未交付评论 {n}"}, en: {one: "{n} unsent comment", other: "{n} unsent comments"}, ja: {other: "未送信コメント {n}"}},
  "card.stop": {zh: "停止", en: "Stop", ja: "停止"},
  "card.rework": {zh: "返工", en: "Revise", ja: "修正を依頼"},
  "card.approve": {zh: "验收通过", en: "Approve", ja: "承認"},
  "card.failedAria": {zh: "执行失败", en: "run failed", ja: "実行失敗"},
  "card.feedbackAria": {zh: "有新反馈", en: "new feedback", ja: "新しいコメントあり"},
  "card.retrying": {zh: "等待重试 {count}/2", en: "Retrying {count}/2", ja: "再試行待ち {count}/2"},

  // What the agent is doing (server sends "<code>" or "<code>:<detail>")
  "activity.command": {zh: "运行命令：{detail}", en: "Running: {detail}", ja: "実行中：{detail}"},
  "activity.files": {zh: "修改文件：{detail}", en: "Editing: {detail}", ja: "編集中：{detail}"},
  "activity.filesPlain": {zh: "修改文件", en: "Editing files", ja: "ファイルを編集中"},
  "activity.tool": {zh: "调用工具：{detail}", en: "Tool: {detail}", ja: "ツール：{detail}"},
  "activity.search": {zh: "搜索资料", en: "Searching", ja: "検索中"},
  "activity.thinking": {zh: "思考中", en: "Thinking", ja: "思考中"},
  "activity.message": {zh: "撰写答复", en: "Writing reply", ja: "回答を作成中"},
  "activity.plan": {zh: "更新计划", en: "Updating plan", ja: "計画を更新中"},
  "activity.preparing": {zh: "准备中", en: "Preparing", ja: "準備中"},

  // Run failure reasons (server failure_info code): full title, one-line card label, action
  "issue.needs_input.title": {zh: "需要补充信息", en: "More information needed", ja: "追加情報が必要"},
  "issue.needs_input.short": {zh: "需要补充信息", en: "Needs information", ja: "情報が必要"},
  "issue.needs_input.action": {zh: "在返工意见中补充所需信息，再提交并返工。", en: "Add the missing information as a change request, then submit.", ja: "修正依頼に必要な情報を書いて送信してください。"},
  "issue.restart.title": {zh: "服务中断，结果待确认", en: "Interrupted by a restart", ja: "再起動により中断"},
  "issue.restart.short": {zh: "服务中断", en: "Interrupted", ja: "中断"},
  "issue.restart.action": {zh: "先检查项目文件和执行记录，确认已完成哪些改动，再返工或移回待办。", en: "Check the project files and run history for completed changes, then revise or move back to To do.", ja: "プロジェクトのファイルと実行履歴で変更を確認してから、修正依頼するか未着手へ戻してください。"},
  "issue.stopped.title": {zh: "已手动停止", en: "Stopped manually", ja: "手動で停止"},
  "issue.stopped.short": {zh: "已手动停止", en: "Stopped", ja: "手動停止"},
  "issue.stopped.action": {zh: "检查已产生的改动，补充意见后返工，或移回待办任务。", en: "Check the changes made so far, then revise or move back to To do.", ja: "ここまでの変更を確認し、修正依頼するか未着手へ戻してください。"},
  "issue.timeout.title": {zh: "执行超时", en: "Run timed out", ja: "実行がタイムアウト"},
  "issue.timeout.short": {zh: "执行超时", en: "Timed out", ja: "タイムアウト"},
  "issue.timeout.action": {zh: "任务可能过大或卡住。拆分任务或补充意见后返工。", en: "The task may be too large or stuck. Split it or add guidance, then revise.", ja: "タスクが大きすぎるか停止した可能性があります。分割するか指示を追加して修正依頼してください。"},
  "issue.acceptance.title": {zh: "缺少验收标准", en: "Acceptance criteria missing", ja: "受け入れ基準がありません"},
  "issue.acceptance.short": {zh: "缺少验收标准", en: "Criteria missing", ja: "基準なし"},
  "issue.acceptance.action": {zh: "在任务详情中填写验收标准，再移回待办任务。", en: "Add acceptance criteria in Task details, then move back to To do.", ja: "タスク詳細で受け入れ基準を入力し、未着手へ戻してください。"},
  "issue.quota.title": {zh: "执行额度不足", en: "Usage limit reached", ja: "利用上限に達しました"},
  "issue.quota.short": {zh: "额度不足", en: "Usage limit", ja: "利用上限"},
  "issue.quota.action": {zh: "等待额度恢复后，移回待办任务继续。", en: "When usage resets, move the task back to To do.", ja: "利用上限が回復したら未着手へ戻してください。"},
  "issue.permission.title": {zh: "文件或操作权限不足", en: "Permission denied", ja: "権限がありません"},
  "issue.permission.short": {zh: "权限不足", en: "Permission denied", ja: "権限なし"},
  "issue.permission.action": {zh: "在 Mac 上检查项目目录及权限，解决后移回待办任务。", en: "Check the project folder and its permissions on the Mac, then move back to To do.", ja: "Mac でフォルダと権限を確認してから未着手へ戻してください。"},
  "issue.folder.title": {zh: "项目目录无法访问", en: "Project folder unavailable", ja: "プロジェクトフォルダにアクセスできません"},
  "issue.folder.short": {zh: "目录无法访问", en: "Folder unavailable", ja: "フォルダ不可"},
  "issue.folder.action": {zh: "在项目设置中确认文件夹仍存在且可访问，再移回待办任务。", en: "Confirm the folder in Project settings still exists, then move back to To do.", ja: "プロジェクト設定でフォルダを確認してから未着手へ戻してください。"},
  "issue.codex_missing.title": {zh: "执行器不可用", en: "Codex CLI not found", ja: "Codex CLI が見つかりません"},
  "issue.codex_missing.short": {zh: "执行器不可用", en: "No Codex CLI", ja: "CLI なし"},
  "issue.codex_missing.action": {zh: "在 Mac 上确认 Codex CLI 可用，再移回待办任务。", en: "Make sure the Codex CLI works on the Mac, then move back to To do.", ja: "Mac で Codex CLI が使えることを確認してから未着手へ戻してください。"},
  "issue.model.title": {zh: "模型配置不可用", en: "Model setting unavailable", ja: "モデル設定を利用できません"},
  "issue.model.short": {zh: "模型不可用", en: "Model unavailable", ja: "モデル不可"},
  "issue.model.action": {zh: "在返工意见框左下选择可用模型与 Thinking 档位，再返工。", en: "Pick an available model and thinking level below the change request, then submit.", ja: "修正依頼欄の下で利用可能なモデルと Thinking を選んで送信してください。"},
  "issue.login.title": {zh: "执行器需要登录", en: "Codex sign-in required", ja: "Codex へのログインが必要"},
  "issue.login.short": {zh: "需要登录", en: "Sign-in required", ja: "ログインが必要"},
  "issue.login.action": {zh: "在 Mac 上重新登录 Codex，完成后移回待办任务。", en: "Sign in to Codex on the Mac, then move the task back to To do.", ja: "Mac で Codex にログインしてから未着手へ戻してください。"},
  "issue.rate_limit.title": {zh: "请求暂时受限", en: "Rate limited", ja: "リクエスト制限中"},
  "issue.rate_limit.short": {zh: "请求受限", en: "Rate limited", ja: "制限中"},
  "issue.rate_limit.action": {zh: "稍后移回待办任务；若已有改动，请先检查执行记录。", en: "Move back to To do later. Check the run history for changes first.", ja: "時間をおいて未着手へ戻してください。先に実行履歴で変更を確認してください。"},
  "issue.network.title": {zh: "网络或服务暂时不可用", en: "Network or service unavailable", ja: "ネットワークまたはサービスを利用できません"},
  "issue.network.short": {zh: "网络不可用", en: "Network error", ja: "ネットワーク"},
  "issue.network.action": {zh: "检查网络，稍后移回待办任务；若已有改动，请先检查执行记录。", en: "Check the connection, then move back to To do. Check the run history for changes first.", ja: "接続を確認してから未着手へ戻してください。先に実行履歴で変更を確認してください。"},
  "issue.unknown.title": {zh: "执行未能完成", en: "Run did not finish", ja: "実行を完了できませんでした"},
  "issue.unknown.short": {zh: "执行失败", en: "Run failed", ja: "実行失敗"},
  "issue.unknown.action": {zh: "查看执行记录中的错误；修复问题或补充意见后返工。", en: "Check the error in the run history, fix it or add guidance, then revise.", ja: "実行履歴のエラーを確認し、修正するか指示を追加して修正依頼してください。"},

  // Overview
  "overview.needsYou": {zh: "需要你处理", en: "Needs you", ja: "対応が必要"},
  "overview.needsYouSub": {zh: "任务仓 {backlog} · 审阅 {review}", en: "Backlog {backlog} · Review {review}", ja: "バックログ {backlog} · レビュー {review}"},
  "overview.queue": {zh: "Agent 队列", en: "Agent queue", ja: "エージェントの待ち行列"},
  "overview.queueSub": {zh: "待办 {todo} · 执行中 {progress}", en: "To do {todo} · Running {progress}", ja: "未着手 {todo} · 実行中 {progress}"},
  "overview.done": {zh: "已完成", en: "Done", ja: "完了"},
  "overview.doneSub": {zh: "已取消 {n}", en: "Cancelled {n}", ja: "キャンセル {n}"},
  "overview.total": {zh: "全部任务", en: "All tasks", ja: "全タスク"},
  "overview.settings": {zh: "项目设置", en: "Project settings", ja: "プロジェクト設定"},
  "overview.flowDev": {zh: "流程：任务仓 → 待办 → Agent 执行 → 审阅验收", en: "Workflow: Backlog → To do → Agent run → Review", ja: "ワークフロー：バックログ → 未着手 → エージェント実行 → レビュー"},
  "overview.flowContent": {zh: "流程：任务仓 → 审阅 → 完成", en: "Workflow: Backlog → Review → Done", ja: "ワークフロー：バックログ → レビュー → 完了"},
  "overview.folder": {zh: "Mac 目录：", en: "Mac folder: ", ja: "Mac フォルダ："},
  "overview.notLinked": {zh: "未关联", en: "Not linked", ja: "未設定"},
  "overview.auto": {zh: "自动认领：{state} · 单轮执行上限 {limit}", en: "Auto-run: {state} · Run limit {limit}", ja: "自動実行：{state} · 1回の上限 {limit}"},
  "overview.on": {zh: "已开启", en: "On", ja: "オン"},
  "overview.off": {zh: "已关闭", en: "Off", ja: "オフ"},
  "overview.minutes": {zh: {other: "{n} 分钟"}, en: {one: "{n} minute", other: "{n} minutes"}, ja: {other: "{n}分"}},
  "overview.unlimited": {zh: "不限", en: "none", ja: "なし"},

  // Detail drawer
  "detail.round": {zh: "第 {n} 轮", en: "Run {n}", ja: "第{n}回"},
  "detail.agentDone": {zh: "Agent 已完成，等你验收", en: "Agent finished · awaiting your review", ja: "エージェントが完了 · レビュー待ち"},
  "detail.awaitReview": {zh: "等你审阅", en: "Awaiting your review", ja: "レビュー待ち"},
  "detail.checkCriteria": {zh: "对照下方验收标准检查结果", en: "Check the result against the criteria below", ja: "下の受け入れ基準で結果を確認"},
  "detail.running": {zh: "Agent 执行中 · ", en: "Agent running · ", ja: "エージェント実行中 · "},
  "detail.retryWait": {zh: "网络或服务受限，{seconds} 秒后重试（{count}/2）", en: "Network or service limited · retry in {seconds}s ({count}/2)", ja: "ネットワーク制限 · {seconds}秒後に再試行（{count}/2）"},
  "detail.queued": {zh: "排队中 · 第 {n} 位", en: "Queued · position {n}", ja: "待機中 · {n}番目"},
  "detail.autoOn": {zh: "自动认领已开启，将按顺序执行", en: "Auto-run is on; tasks run in order", ja: "自動実行オン · 順番に実行します"},
  "detail.autoOff": {zh: "自动认领已关闭，可立即手动运行", en: "Auto-run is off; you can run it now", ja: "自動実行オフ · 今すぐ手動で実行できます"},
  "detail.runNow": {zh: "立即运行", en: "Run now", ja: "今すぐ実行"},
  "detail.inBacklog": {zh: "在任务仓", en: "In backlog", ja: "バックログ"},
  "detail.readyHint": {zh: "放入待办后，Agent 才会执行", en: "Move to To do to let the Agent run it", ja: "未着手へ移すとエージェントが実行します"},
  "detail.needCriteria": {zh: "先在任务详情中填写验收标准，才能放入待办", en: "Add acceptance criteria in Task details first", ja: "先にタスク詳細で受け入れ基準を入力してください"},
  "detail.moveToTodo": {zh: "放入待办", en: "Move to To do", ja: "未着手へ移動"},
  "detail.contentHint": {zh: "整理好后送去审阅", en: "Send to review when ready", ja: "準備ができたらレビューへ"},
  "detail.sendToReview": {zh: "送去审阅", en: "Send to review", ja: "レビューへ送る"},
  "detail.result": {zh: "本轮结果", en: "Latest result", ja: "今回の結果"},
  "detail.took": {zh: "用时 {time}", en: "took {time}", ja: "所要 {time}"},
  "detail.noError": {zh: "没有错误详情", en: "No error details", ja: "エラーの詳細はありません"},
  "detail.noText": {zh: "（没有文字结果）", en: "(No text result)", ja: "（テキストの結果なし）"},
  "detail.criteria": {zh: "验收标准", en: "Acceptance criteria", ja: "受け入れ基準"},
  "detail.criteriaEmpty": {zh: "未填写。在下方“任务详情”中补充。", en: "Not set. Add them in Task details below.", ja: "未入力です。下の「タスク詳細」で追加してください。"},
  "detail.checksNote": {zh: " · 勾选仅用于本次核对，不保存", en: " · checks are not saved", ja: " · チェックは保存されません"},
  "detail.viewInCodex": {zh: "在 Codex 中查看过程 ↗", en: "View run in Codex ↗", ja: "Codex で実行を見る ↗"},
  "detail.saveCommentOnly": {zh: "仅保存评论", en: "Save comment only", ja: "コメントのみ保存"},
  "detail.submitRework": {zh: "提交并返工", en: "Submit changes", ja: "修正を依頼"},
  "detail.saveComment": {zh: "保存评论", en: "Save comment", ja: "コメントを保存"},
  "detail.changeRequest": {zh: "返工意见", en: "Change request", ja: "修正依頼"},
  "detail.comment": {zh: "评论", en: "Comment", ja: "コメント"},
  "detail.changePlaceholder": {zh: "写给 Agent 的修改意见。可先“仅保存评论”，调整优先级后再返工。", en: "Tell the Agent what to change. You can save the comment first, adjust priority, then submit.", ja: "エージェントへの修正内容。先にコメントだけ保存し、優先度を変えてから依頼することもできます。"},
  "detail.commentPlaceholder": {zh: "记录想法、补充信息或审阅结论", en: "Add a note, context or review decision", ja: "メモ、補足、レビュー結果を入力"},
  "detail.pendingHint": {zh: {other: "已有 {n} 条评论尚未交给 Agent；留空直接“提交并返工”也会一并交付。"}, en: {one: "{n} saved comment has not been sent to the Agent; submitting with an empty box sends it.", other: "{n} saved comments have not been sent to the Agent; submitting with an empty box sends them."}, ja: {other: "未送信のコメントが {n} 件あります。空欄のまま依頼するとそれらを送信します。"}},
  "detail.model": {zh: "模型", en: "Model", ja: "モデル"},
  "detail.thinking": {zh: "Thinking 档位", en: "Thinking level", ja: "Thinking レベル"},
  "detail.codexDefault": {zh: "Codex 默认配置", en: "Codex defaults", ja: "Codex 既定"},
  "detail.noModels": {zh: "未读取到本机模型列表，将使用 Codex 默认配置", en: "No local model list; Codex defaults will be used", ja: "モデル一覧がないため Codex の既定値を使います"},
  "detail.history": {zh: "执行记录", en: "Run history", ja: "実行履歴"},
  "detail.historyMeta": {zh: "{runs} · {comments}", en: "{runs} · {comments}", ja: "{runs} · {comments}"},
  "detail.runs": {zh: {other: "{n} 轮"}, en: {one: "{n} run", other: "{n} runs"}, ja: {other: "{n} 回"}},
  "detail.comments": {zh: {other: "{n} 条评论"}, en: {one: "{n} comment", other: "{n} comments"}, ja: {other: "コメント {n} 件"}},
  "detail.you": {zh: "你", en: "You", ja: "あなた"},
  "detail.agentRound": {zh: "Agent · 第 {n} 轮 · {state}", en: "Agent · run {n} · {state}", ja: "エージェント · 第{n}回 · {state}"},
  "detail.completed": {zh: "完成", en: "completed", ja: "完了"},
  "detail.failed": {zh: "失败", en: "failed", ja: "失敗"},
  "detail.details": {zh: "任务详情", en: "Task details", ja: "タスク詳細"},
  "detail.detailsMeta": {zh: "说明、验收标准、标签", en: "Description, criteria, tags", ja: "説明、基準、タグ"},
  "detail.hasDescription": {zh: "有说明", en: "Has description", ja: "説明あり"},
  "detail.tagCount": {zh: {other: "{n} 个标签"}, en: {one: "{n} tag", other: "{n} tags"}, ja: {other: "タグ {n} 件"}},
  "detail.title": {zh: "标题", en: "Title", ja: "タイトル"},
  "detail.description": {zh: "说明", en: "Description", ja: "説明"},
  "detail.criteriaPlaceholder": {zh: "每行一条，完成后如何确认结果", en: "One per line: how will you verify the result?", ja: "1行に1項目。どう確認しますか？"},
  "detail.tags": {zh: "标签", en: "Tags", ja: "タグ"},
  "detail.tagsPlaceholder": {zh: "逗号分隔", en: "Separate with commas", ja: "カンマ区切り"},
  "detail.source": {zh: "来源链接", en: "Source link", ja: "参照リンク"},
  "detail.saveDetails": {zh: "保存详情", en: "Save details", ja: "詳細を保存"},
  "detail.manage": {zh: "移到其他列 / 删除", en: "Move / delete", ja: "移動・削除"},
  "detail.deleteTask": {zh: "删除任务", en: "Delete task", ja: "タスクを削除"},
  "detail.lockedRunning": {zh: "执行中的任务不能移动或删除", en: "Running tasks cannot be moved or deleted", ja: "実行中のタスクは移動・削除できません"},
  "detail.deleteWarn": {zh: "删除后评论与执行记录一并删除，无法恢复。", en: "Comments and run history will also be deleted. This cannot be undone.", ja: "コメントと実行履歴も削除され、元に戻せません。"},
  "detail.deleteConfirm": {zh: "确认删除", en: "Delete permanently", ja: "完全に削除"},

  // New task / project / settings forms
  "form.newTask": {zh: "新建任务", en: "New task", ja: "新規タスク"},
  "form.createTask": {zh: "创建任务", en: "Create task", ja: "タスクを作成"},
  "form.titleRequired": {zh: "标题 *", en: "Title *", ja: "タイトル *"},
  "form.titlePlaceholder": {zh: "清楚描述要解决的问题", en: "Describe the problem clearly", ja: "解決したい問題を明確に"},
  "form.descPlaceholder": {zh: "背景、目标和限制条件", en: "Background, goal and constraints", ja: "背景、目標、制約"},
  "form.criteriaPlaceholderDev": {zh: "每行一条。进入待办前必须填写。", en: "One per line. Required before To do.", ja: "1行に1項目。未着手へ移す前に必須です。"},
  "form.criteriaPlaceholder": {zh: "每行一条。", en: "One per line.", ja: "1行に1項目。"},
  "form.more": {zh: "更多选项", en: "More options", ja: "その他の設定"},
  "form.moreMetaDev": {zh: "优先级、标签、来源、模型", en: "Priority, tags, source, model", ja: "優先度、タグ、参照、モデル"},
  "form.moreMeta": {zh: "优先级、标签、来源", en: "Priority, tags, source", ja: "優先度、タグ、参照"},
  "form.newTaskNoteDev": {zh: "新任务先进入任务仓，放入待办后才会执行。", en: "New tasks start in Backlog and run only after moving to To do.", ja: "新しいタスクはバックログに入り、未着手へ移すと実行されます。"},
  "form.newTaskNote": {zh: "新任务先进入任务仓。", en: "New tasks start in Backlog.", ja: "新しいタスクはバックログに入ります。"},
  "form.macFolder": {zh: "Mac 项目目录", en: "Mac project folder", ja: "Mac のプロジェクトフォルダ"},
  "form.pathPlaceholder": {zh: "/Users/你/项目目录", en: "/Users/you/project-folder", ja: "/Users/you/project-folder"},
  "form.chooseFolder": {zh: "选择文件夹…", en: "Choose folder…", ja: "フォルダを選択…"},
  "form.pathHintMac": {zh: "点击选择文件夹会打开 Mac 系统窗口，也可直接输入完整路径。开发任务执行前需设置目录。", en: "Choose a folder with the Mac dialog or enter its full path. Required before running development tasks.", ja: "Mac のダイアログで選ぶか、フルパスを入力してください。開発タスクの実行前に必要です。"},
  "form.pathHint": {zh: "请输入运行看板的 Mac 上的完整项目路径。开发任务执行前需设置目录。", en: "Enter the full project path on the Mac running this board. Required before running development tasks.", ja: "このボードを動かす Mac 上のフルパスを入力してください。開発タスクの実行前に必要です。"},
  "form.pickInMac": {zh: "请在 Mac 窗口选择…", en: "Choose in the Mac window…", ja: "Mac のウィンドウで選択…"},
  "form.newProject": {zh: "新建项目", en: "New project", ja: "新規プロジェクト"},
  "form.projectNameRequired": {zh: "项目名称 *", en: "Project name *", ja: "プロジェクト名 *"},
  "form.projectNamePlaceholder": {zh: "例如：我的应用", en: "For example: My app", ja: "例：マイアプリ"},
  "form.workflow": {zh: "工作流", en: "Workflow", ja: "ワークフロー"},
  "form.workflowDev": {zh: "开发看板", en: "Development", ja: "開発"},
  "form.workflowContent": {zh: "内容选题", en: "Content", ja: "コンテンツ"},
  "form.workflowDevColumns": {zh: "列：任务仓 → 待办 → 进行中 → 审阅中", en: "Columns: Backlog → To do → In progress → In review", ja: "列：バックログ → 未着手 → 進行中 → レビュー中"},
  "form.workflowContentColumns": {zh: "列：任务仓 → 审阅中 → 已完成 / 已取消", en: "Columns: Backlog → In review → Done / Cancelled", ja: "列：バックログ → レビュー中 → 完了 / キャンセル済み"},
  "form.createProject": {zh: "创建项目", en: "Create project", ja: "プロジェクトを作成"},
  "form.saveSettings": {zh: "保存设置", en: "Save settings", ja: "設定を保存"},
  "form.deleteProject": {zh: "删除项目", en: "Delete project", ja: "プロジェクトを削除"},
  "form.deleteProjectAsk": {zh: "删除项目…", en: "Delete project…", ja: "プロジェクトを削除…"},
  "form.deleteProjectWarn": {zh: {other: "将删除项目及其中 {n} 个任务、全部评论与执行记录，无法恢复。不会删除 Mac 上的项目文件。"}, en: {one: "Deletes the project, its {n} task, all comments and run history. This cannot be undone. Files on the Mac are kept.", other: "Deletes the project, its {n} tasks, all comments and run history. This cannot be undone. Files on the Mac are kept."}, ja: {other: "プロジェクトと {n} 件のタスク、すべてのコメントと実行履歴を削除します。元に戻せません。Mac 上のファイルは残ります。"}},
  "form.confirmNameLabel": {zh: "输入项目名称以确认：", en: "Type the project name to confirm:", ja: "確認のためプロジェクト名を入力："},
  "form.deleteProjectConfirm": {zh: "永久删除项目", en: "Delete permanently", ja: "完全に削除"},
  "form.interface": {zh: "界面", en: "Interface", ja: "表示"},

  // Toasts
  "toast.saveFirst": {zh: "请先保存或清空未保存的内容", en: "Save or clear unsaved changes first", ja: "未保存の内容を保存するか消去してください"},
  "toast.approved": {zh: "验收通过，任务已完成", en: "Approved · task done", ja: "承認しました · 完了"},
  "toast.saveEdits": {zh: "请先保存修改或评论", en: "Save your changes or comment first", ja: "先に変更またはコメントを保存してください"},
  "toast.started": {zh: "Codex 已开始执行", en: "Codex started the task", ja: "Codex が開始しました"},
  "toast.stopConfirm": {zh: "停止后本轮记为失败，已产生的文件改动会保留。确认停止？", en: "Stopping marks this run as failed. File changes already made remain. Stop now?", ja: "停止すると今回の実行は失敗扱いになり、既存の変更は残ります。停止しますか？"},
  "toast.stopRequested": {zh: "已发送停止指令", en: "Stop requested", ja: "停止を指示しました"},
  "toast.moved": {zh: "已移到{column}", en: "Moved to {column}", ja: "{column}へ移動しました"},
  "toast.taskDeleted": {zh: "{task} 已删除", en: "{task} deleted", ja: "{task} を削除しました"},
  "toast.projectDeleted": {zh: "项目“{project}”已删除", en: "Project “{project}” deleted", ja: "プロジェクト「{project}」を削除しました"},
  "toast.folderSelected": {zh: "已选择项目文件夹", en: "Project folder selected", ja: "フォルダを選択しました"},
  "toast.priority": {zh: "优先级已改为{level}", en: "Priority set to {level}", ja: "優先度を{level}に変更しました"},
  "toast.nextRun": {zh: "下一轮使用 {model}", en: "Next run uses {model}", ja: "次回は {model} を使用"},
  "toast.projectCreated": {zh: "项目已创建", en: "Project created", ja: "プロジェクトを作成しました"},
  "toast.projectSaved": {zh: "项目设置已保存", en: "Project settings saved", ja: "設定を保存しました"},
  "toast.taskCreated": {zh: "任务已创建到任务仓", en: "Task created in Backlog", ja: "バックログにタスクを作成しました"},
  "toast.detailsSaved": {zh: "详情已保存", en: "Details saved", ja: "詳細を保存しました"},
  "toast.saveDetailsFirst": {zh: "请先保存任务详情，再提交返工", en: "Save task details before submitting changes", ja: "修正依頼の前にタスク詳細を保存してください"},
  "toast.reworkSubmitted": {zh: "已提交返工，任务回到待办", en: "Change request sent · task back in To do", ja: "修正を依頼しました · 未着手へ戻しました"},
  "toast.commentSaved": {zh: "评论已保存", en: "Comment saved", ja: "コメントを保存しました"},
  "toast.taskGone": {zh: "该任务已被删除", en: "This task was deleted", ja: "このタスクは削除されました"},

  // Relative time
  "time.justNow": {zh: "刚刚", en: "just now", ja: "たった今"},
  "time.minutesAgo": {zh: {other: "{n} 分钟前"}, en: {one: "{n}m ago", other: "{n}m ago"}, ja: {other: "{n}分前"}},
  "time.hoursAgo": {zh: {other: "{n} 小时前"}, en: {one: "{n}h ago", other: "{n}h ago"}, ja: {other: "{n}時間前"}},

  // Server errors (server.py ERRORS; the response carries `code`)
  "err.http": {zh: "请求失败（HTTP {status}）", en: "Request failed (HTTP {status})", ja: "リクエスト失敗（HTTP {status}）"},
  "err.model_invalid": {zh: "请选择本机模型列表中的模型及其支持的 Thinking 档位", en: "Choose a model from the local list and a thinking level it supports", ja: "一覧のモデルと対応する Thinking レベルを選んでください"},
  "err.task_not_found": {zh: "任务不存在", en: "Task not found", ja: "タスクが見つかりません"},
  "err.config_locked_running": {zh: "当前任务正在执行，请在本轮结束后修改配置", en: "The task is running; change settings after this run", ja: "実行中です。終了後に設定を変更してください"},
  "err.approve_not_review": {zh: "只有审阅中的任务可以验收通过", en: "Only tasks in review can be approved", ja: "レビュー中のタスクのみ承認できます"},
  "err.approve_failed_run": {zh: "本轮执行未成功，不能直接验收。请补充意见后返工，或移回待办任务", en: "This run failed and cannot be approved. Revise it or move it back to To do", ja: "今回の実行は失敗したため承認できません。修正依頼するか未着手へ戻してください"},
  "err.path_not_dir": {zh: "项目路径不是现有目录", en: "The project path is not an existing folder", ja: "パスが既存のフォルダではありません"},
  "err.folder_picker_failed": {zh: "无法打开 Mac 文件夹选择器", en: "Could not open the Mac folder picker", ja: "Mac のフォルダ選択を開けません"},
  "err.project_fields": {zh: "请填写项目名称并选择有效流程", en: "Enter a project name and choose a workflow", ja: "プロジェクト名とワークフローを指定してください"},
  "err.project_name_required": {zh: "请填写项目名称", en: "Enter a project name", ja: "プロジェクト名を入力してください"},
  "err.project_not_found": {zh: "项目不存在", en: "Project not found", ja: "プロジェクトが見つかりません"},
  "err.confirm_name_mismatch": {zh: "请输入完整的项目名称以确认删除", en: "Type the full project name to confirm", ja: "確認のため正確なプロジェクト名を入力してください"},
  "err.project_has_running": {zh: "项目中有正在执行的任务，请先停止或等待结束", en: "A task in this project is running; stop it or wait first", ja: "実行中のタスクがあります。停止するか終了を待ってください"},
  "err.auto_bool": {zh: "自动认领设置必须为布尔值", en: "Auto-run must be on or off", ja: "自動実行はオンかオフで指定してください"},
  "err.auto_content": {zh: "内容项目不支持自动认领", en: "Content projects do not auto-run", ja: "コンテンツプロジェクトは自動実行できません"},
  "err.title_required": {zh: "请填写卡片标题", en: "Enter a task title", ja: "タイトルを入力してください"},
  "err.priority_invalid": {zh: "无效优先级", en: "Invalid priority", ja: "無効な優先度"},
  "err.nothing_to_update": {zh: "没有可更新的内容", en: "Nothing to update", ja: "更新する内容がありません"},
  "err.title_empty": {zh: "标题不能为空", en: "Title cannot be empty", ja: "タイトルは必須です"},
  "err.acceptance_locked": {zh: "待办和进行中的任务必须保留验收标准", en: "Queued and running tasks must keep acceptance criteria", ja: "未着手・進行中のタスクは受け入れ基準が必要です"},
  "err.column_invalid": {zh: "目标列不属于此项目流程", en: "That column is not part of this workflow", ja: "その列はこのワークフローにありません"},
  "err.done_via_approve": {zh: "请在审阅中点击独立的验收通过按钮", en: "Use Approve on a task in review", ja: "レビュー中の「承認」を使ってください"},
  "err.progress_auto_only": {zh: "进行中由执行器自动设置", en: "In progress is set by the executor", ja: "進行中は実行時に自動で設定されます"},
  "err.move_running": {zh: "执行中的卡片暂不能移动", en: "Running tasks cannot be moved", ja: "実行中のタスクは移動できません"},
  "err.acceptance_required": {zh: "进入待办前请先填写验收标准", en: "Add acceptance criteria before To do", ja: "未着手へ移す前に受け入れ基準を入力してください"},
  "err.delete_running": {zh: "执行中的任务不能删除，请先停止", en: "Stop the running task before deleting it", ja: "削除する前に実行を停止してください"},
  "err.comment_empty": {zh: "评论不能为空", en: "Comment cannot be empty", ja: "コメントを入力してください"},
  "err.rework_not_review": {zh: "只有审阅中的开发任务可以返工", en: "Only development tasks in review can be sent back", ja: "レビュー中の開発タスクのみ修正依頼できます"},
  "err.acceptance_save_first": {zh: "请先保存验收标准", en: "Save the acceptance criteria first", ja: "先に受け入れ基準を保存してください"},
  "err.feedback_required": {zh: "请先填写返工意见", en: "Write a change request first", ja: "先に修正依頼を入力してください"},
  "err.run_not_todo": {zh: "只有开发流程的待办卡片可以执行", en: "Only development tasks in To do can run", ja: "未着手の開発タスクのみ実行できます"},
  "err.auto_paused": {zh: "此项目已暂停自动认领", en: "Auto-run is paused for this project", ja: "このプロジェクトの自動実行は停止中です"},
  "err.blocked_acceptance": {zh: "缺少验收标准，无法执行", en: "Acceptance criteria missing; cannot run", ja: "受け入れ基準がないため実行できません"},
  "err.blocked_path": {zh: "请先为项目设置有效的本地目录", en: "Set a valid local folder for the project first", ja: "先に有効なローカルフォルダを設定してください"},
  "err.blocked_codex": {zh: "未找到 Codex CLI", en: "Codex CLI not found", ja: "Codex CLI が見つかりません"},
  "err.blocked_model": {zh: "模型配置无效", en: "Model setting is invalid", ja: "モデル設定が無効です"},
  "err.single_run": {zh: "同一时间只能执行一张卡片", en: "Only one task can run at a time", ja: "同時に実行できるタスクは1つです"},
  "err.already_claimed": {zh: "卡片已被其他执行器认领", en: "Another run already claimed this task", ja: "このタスクは既に開始されています"},
  "err.busy": {zh: "已有任务正在执行", en: "Another task is running", ja: "別のタスクを実行中です"},
  "err.not_running": {zh: "该任务当前没有在执行", en: "This task is not running", ja: "このタスクは実行中ではありません"},
  "err.bad_length": {zh: "请求长度无效", en: "Invalid request length", ja: "リクエスト長が無効です"},
  "err.too_large": {zh: "请求过大或长度无效", en: "Request too large", ja: "リクエストが大きすぎます"},
  "err.bad_body": {zh: "请求内容必须是对象", en: "Invalid request body", ja: "リクエスト内容が無効です"},
  "err.bad_request": {zh: "请求无效", en: "Invalid request", ja: "無効なリクエスト"},
  "err.untrusted_host": {zh: "访问地址不受信任", en: "Untrusted address", ja: "信頼できないアドレスです"},
  "err.untrusted_origin": {zh: "请求来源不受信任", en: "Untrusted origin", ja: "信頼できない送信元です"},
  "err.not_found": {zh: "接口不存在", en: "Not found", ja: "見つかりません"},
  "err.number_exhausted": {zh: "任务编号已达到安全上限，无法创建新任务", en: "The safe task number limit has been reached; no new task was created.", ja: "タスク番号が安全な上限に達したため、新しいタスクを作成できません。"},
  "err.internal": {zh: "服务器内部错误", en: "Internal server error", ja: "サーバー内部エラー"},
};

const LOCALE_STORAGE_KEY = "codexKanbanLocale";   // Keep this key: installed boards keep their language after updates.
const LANG = {"zh-CN": "zh", en: "en", ja: "ja"};
let currentLocale = (() => { try { return localStorage.getItem(LOCALE_STORAGE_KEY) || "zh-CN"; } catch { return "zh-CN"; } })();
if (!LANG[currentLocale]) currentLocale = "zh-CN";
const pluralRules = {};
const missingKeys = new Set();

function t(key, params = {}) {
  const entry = MESSAGES[key];
  if (!entry) {
    if (!missingKeys.has(key)) { missingKeys.add(key); console.warn("[i18n] missing key:", key); }
    return key;
  }
  let text = entry[LANG[currentLocale]] ?? entry.zh;
  if (typeof text === "object") {
    const rules = pluralRules[currentLocale] ||= new Intl.PluralRules(currentLocale);
    text = text[rules.select(Number(params.n) || 0)] ?? text.other;
  }
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}
const hasKey = key => Object.prototype.hasOwnProperty.call(MESSAGES, key);

/* Static markup: data-i18n="key" sets text; data-i18n-attr="attr:key;attr:key" sets attributes. */
function applyStaticText(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-attr]").forEach(el => {
    for (const pair of el.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split(":").map(x => x.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}

function localeOptions(short = false) {
  return LOCALES.map(l => `<option value="${l.id}" ${l.id === currentLocale ? "selected" : ""}>${short ? l.short : l.name}</option>`).join("");
}

function setLocale(locale) {
  if (!LANG[locale]) return;
  currentLocale = locale;
  try { localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch {}
  document.documentElement.lang = locale;
  applyStaticText();
  document.querySelectorAll(".locale-select").forEach(select => { select.value = locale; });
  if (typeof onLocaleChange === "function") onLocaleChange();
}

document.documentElement.lang = currentLocale;
