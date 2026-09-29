# Codex Kanban

[English](README.md) · **简体中文** · [日本語](README.ja.md)

本地运行、人工批准执行、评论驱动返工的 Codex CLI 任务看板：你批准每个任务，Agent 在你自己的电脑上执行，你审阅通过后才算完成。个人项目，非 OpenAI 官方产品。

**单人使用的预览版，优先支持 macOS。** 使用 Python 标准库、SQLite 和原生 JavaScript，无 pip/npm 依赖，无需构建。Windows 执行尚未适配；Linux 未完整验证。手机通过浏览器操作，任务始终在宿主电脑执行。

界面支持简体中文、English、日本語（桌面在侧栏切换，手机在“项目设置”中切换），选择保存在浏览器。项目名、任务、评论和 Agent 输出等你自己的内容不会被翻译。

## 快速开始

1. 下载：**Code → Download ZIP** 并解压；或 `git clone https://github.com/xij669/codex-kanban.git`。
2. 在该目录确认 Python 3.9+ 并启动：
   ```sh
   python3 --version
   python3 -B server.py
   ```
3. 打开 [http://127.0.0.1:8765](http://127.0.0.1:8765)。首次启动生成演示项目；按 `Ctrl+C` 停止。
4. 端口被占用时：`BOARD_PORT=8766 python3 -B server.py`，访问对应端口。

只体验看板不需要 Codex。要执行任务，请安装并登录 [Codex CLI](https://developers.openai.com/codex/cli/)，在同一终端确认 `codex --version`、`codex exec --help` 可用。CLI 需支持 `--json`、`--approve-for-me`、`--cd`、`--skip-git-repo-check`。模型列表读取本机 Codex 缓存，没有缓存时使用 CLI 默认模型。

## 工作方式

| 列 | 谁处理 | 说明 |
| --- | --- | --- |
| 任务仓 | 你 | 想法与草稿，永不自动执行。填好验收标准后才能放入待办。 |
| 待办任务 | Agent | 按显示顺序排队：紧急 → 高 → 中 → 低，同级先建先执行。 |
| 进行中 | Agent | 显示已运行时长和当前动作，可随时停止。 |
| 审阅中 | 你 | **验收通过**，或写返工意见后**提交并返工**回到待办。失败、停止、超时也会回到这里并显示原因。 |
| 已完成 / 已取消 | — | 默认隐藏。 |

同一时间只执行一张任务，紧急任务不抢占正在执行的任务。单轮默认 60 分钟超时（`BOARD_RUN_TIMEOUT_MINUTES`，`0` 为不限）。**自动认领**按项目设置，默认关闭。

## 更新时保留你的数据

项目、任务、评论、执行记录和项目设置保存在你运行看板的目录中的 `board.sqlite3`；语言和所选项目保存在浏览器。**更新不会替换以上任何数据。**

更新前：等待或停止正在执行的任务，再停止看板服务。更新后继续使用同一地址和端口，浏览器会保留语言和所选项目。

- **Git 安装：** 在原目录运行 `git pull --ff-only`。`board.sqlite3`、`backups/`、`.remote/` 被 Git 忽略，不会被覆盖。若自己改过程序文件，请正常处理冲突，不要强制重置覆盖数据。
- **ZIP 安装：** 把新版解压到**另一个目录**，在新版目录运行：

  ```sh
  python3 -B update.py "/完整路径/旧版/codex-kanban"
  ```

  只替换 `VERSION` 和六个程序文件；替换前在旧目录的 `backups/` 创建私人 SQLite 备份；有任务正在执行时拒绝更新。数据库、项目、`.remote/` 和其他文件都不会改动。之后**从旧目录**启动。不要把新 ZIP 直接覆盖旧目录。

数据库迁移在启动时自动运行，只增加结构，并用首个预览版的数据库做了测试（`compat_test.py`）。如需回退，先停止服务，再从 `backups/` 恢复；备份之后的修改会丢失。

## 数据与安全

- 只监听 `127.0.0.1`，**没有登录**。不要公开到互联网、GitHub Pages 或公共代理，也不要开启 Tailscale Funnel。手机访问见 [REMOTE.md](REMOTE.md)。
- 看板会启动读写项目目录的 Agent。请先用测试目录或版本控制；沙箱不等于备份。
- Codex 会把任务上下文和读取的文件发送给所配置的模型服务，请勿提供不允许发送的资料。凭证由 CLI 自行管理。
- 重启无法接管正在执行的任务，请先停止任务再退出服务。
- 暂不包含：额度恢复后自动复工、多用户、自动备份、Claude 执行器。

更多：[SECURITY.md](SECURITY.md)（英文）。

## 开发

```sh
for t in *_test.py; do python3 -B "$t" || exit 1; done
```

测试使用临时数据库和模拟执行器，不调用真实模型。界面文案在 `i18n.js` 中按编号查找，`i18n_test.py` 会检查三种语言是否齐全。快捷键：`N` 新建任务，`/` 搜索，`Esc` 关闭。贡献规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

[MIT](LICENSE) © 2026 xij669.
