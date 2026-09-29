# Codex Kanban

A local-first task board for human-reviewed Codex CLI work. 本地运行、人工批准执行、评论驱动返工的任务看板。个人项目，非 OpenAI 官方产品。

**当前为单人使用的原型，优先支持 macOS。** 看板使用 Python 标准库、SQLite 和原生 JavaScript，无 pip/npm 项目依赖。Windows 原生执行器尚未适配；Linux 未完成完整实机验证。手机通过浏览器操作，任务仍在宿主电脑执行。

## 快速开始

1. 从本仓库 **Code → Download ZIP** 下载并解压；或 `git clone https://github.com/xij669/codex-kanban.git`。
2. 在解压/克隆后的目录打开终端，确认 Python 3.9+：
   ```sh
   python3 --version
   python3 -B server.py
   ```
3. 浏览器打开 **http://127.0.0.1:8765**。首次启动生成演示数据；按 `Ctrl+C` 停止。
4. 如端口被占用，运行 `BOARD_PORT=8766 python3 -B server.py`，访问对应端口。

仅体验看板不需要 Codex。实际执行任务前，按 [Codex 官方说明](https://developers.openai.com/codex/cli/) 安装并登录 CLI；在同一终端确认 `codex --version`、`codex exec --help` 可用。当前调用需要支持 `--json`、`--approve-for-me`、`--cd`、`--skip-git-repo-check` 的 CLI。模型列表来自本机 Codex 缓存；没有缓存时使用 CLI 默认模型。

## 交给 AI Agent 导入

将以下内容与**仓库链接或已解压的文件夹**一起交给 Agent：

> 请先读 README.md、AGENTS.md 和 SECURITY.md。在当前克隆目录确认 Python 3.9+，执行 `for t in *_test.py; do python3 -B "$t" || exit 1; done`。选择空闲本地端口启动 `python3 -B server.py`，访问 `/api/state` 确认服务正常，把浏览器链接给我。先只启动看板；不要创建真实执行任务、开启自动认领、修改已有项目文件、读取或上传登录凭证。若我要求执行任务，再检查 Codex CLI 是否安装登录，并让我指定一个测试项目目录。不要公开服务或更改 Tailscale、开机启动配置。

Agent 入口：[AGENTS.md](AGENTS.md)。不需要导入个人 Codex 配置，不需要复制任何数据库、API Key 或 Tailscale 文件。

## 第一次执行

1. 创建一个空测试目录，在看板新建开发项目并关联它。
2. 新建任务，写明目标和验收标准。任务先进入**任务仓**，不会自动执行。
3. 将任务放入**待办**，手动“立即运行”；确认流程后才开启该项目的自动认领。
4. 执行结束进入**审阅中**；检查实际文件和结果，点击“验收通过”，或填写意见“提交并返工”。

优先级：紧急 > 高 > 中 > 低，同级按创建顺序。全局只执行一张任务；紧急任务不抢占正在执行的任务。失败、停止、超时都回到审阅中并提示原因。默认单轮超时 60 分钟，可用 `BOARD_RUN_TIMEOUT_MINUTES` 调整（0 为不限）。

## 数据与安全

- 数据保存在启动代码目录的 `board.sqlite3`。升级前停止服务并备份数据库；迁移时不要用下载文件覆盖数据库。
- 仅监听 `127.0.0.1`，**没有内置登录系统**。不要部署到公网、GitHub Pages、公共反向代理，也不要打开 Tailscale Funnel。
- 看板能启动会读写项目目录的 Agent。请先使用测试目录或版本控制；沙箱限制不等于备份，也不保证读取内容只限项目目录。
- Codex 会将任务上下文及读取的相关内容交给所配置的模型服务处理；不要提供不允许发送给该服务的资料。凭证由 CLI 自行管理。
- 手机访问见 [REMOTE.md](REMOTE.md)。只有受信任设备应获得访问权限。
- 重启不会恢复执行中的子进程；请先停止任务并等待结束，再退出服务。没有额度恢复自动复工、多人权限、自动备份或 Claude 执行器。

## 开发与验证

```sh
for t in *_test.py; do python3 -B "$t" || exit 1; done
```

测试使用临时数据库和模拟执行器，不调用真实模型。前端修改还需检查桌面和 390×844 手机布局。

文件：`server.py` 为服务和调度，`app.js` / `index.html` / `style.css` 为 UI，`*_test.py` 为测试。按 `N` 新建、`/` 搜索、`Esc` 关闭。开发与内容任务使用不同工作流；内容项目不自动执行。

## License

[MIT](LICENSE) © 2026 xij669.
