# 接力胶囊 · Codex Handoff Capsule

**换一个对话，接着把事情做完。**

长任务做了一半，想开一个新对话，却又得重新交代目标、约束和进度？接力胶囊把 Codex 本地会话里的近期有效消息和原始记录位置整理成一份小型 Markdown 交接单，让下一段对话有据可查。

本项目分享的是**生成胶囊的工具**。仓库不包含作者的聊天记录、实际胶囊、账号配置或项目文件。

## 它做什么

- 读取 Codex 本地 JSONL 会话，兼容 `event_msg` 和 `response_item` 消息格式。
- 保存最近 14 条消息，每条最多 2,400 字符，附会话来源和状态。
- 大记录只读取头部和最后 16 MiB，避免加载整段历史。
- 按工作区路径和会话分别保存，减少同名项目和不同任务之间的覆盖。
- 没读到有效消息就停止，不用空壳覆盖已有胶囊。
- 排除工具输出、推理记录、图片数据和常见注入式环境说明；对常见凭据格式做尽力脱敏。
- 本地运行、零依赖、不调用模型、不需要 API Key、不上传数据。

**它是交接材料，不是完整记忆。** 脚本提取近期对话，不会自动理解所有历史并生成准确的目标总结。重要决策最好在交接前用一条清楚的总结写进对话。

## 快速开始

需要 [Node.js 20+](https://nodejs.org/) 和本机已有的 Codex 会话记录。下载本仓库后，在目录中运行：

```sh
node scripts/update-capsule.mjs --workspace "/path/to/your/project"
```

Windows 示例：

```powershell
node scripts/update-capsule.mjs --workspace "D:\Projects\demo"
```

命令会打印生成文件的位置。默认读取 `CODEX_HOME`，未设置时使用用户目录下的 `.codex`。默认输出：

```text
~/.codex/handoffs/<工作区名称与路径摘要>/<会话摘要>.md
```

同时有多个任务时，建议显式指定来源：

```sh
node scripts/update-capsule.mjs --workspace "/path/to/project" --session "/path/to/rollout.jsonl"
```

在新对话中告诉 Codex：

> 读取这个接力胶囊，先确认目标、已完成内容和下一步，再继续工作：<生成文件的路径>

### 作为 Codex 技能安装

把本仓库的 `SKILL.md` 和 `scripts` 文件夹复制到 `~/.codex/skills/task-handoff-capsule/`。已有同名技能时先备份并比较。在新任务中调用 `$task-handoff-capsule`。

仓库不修改你的全局配置，也不安装后台进程。安装技能不等于每条消息都会自动刷新；可让 Codex 在重大进展或任务结束时执行刷新命令。

## 参数

| 参数 | 用途 |
| --- | --- |
| `--workspace PATH` | 目标工作区，默认当前目录 |
| `--session FILE` | 指定来源 JSONL；省略时按修改时间选择匹配工作区的会话 |
| `--output FILE.md` | 自定义输出位置，兼容旧版固定路径集成 |
| `--stdout` | 只输出到终端，不保存文件 |
| `--codex-home PATH` | 指定本地 Codex 数据根目录 |
| `--help` | 显示帮助 |

会话搜索包含 `sessions` 和 `archived_sessions`。复制或迁移文件可能改变修改时间，因此自动选择结果只是线索。`--session` 更适合精确接力。`--output` 固定别名会覆盖该文件，请不要让多个任务共用一个别名。

## 胶囊长什么样

下面完全是虚构示例：

```text
# Codex handoff capsule
- Session: fictional-session
- Last observed state: in_progress

## Recent conversation
### user
> 给示例应用增加搜索，保留现有排序。
### assistant
> 搜索逻辑已完成，单元测试通过。
> 还需人工确认移动端输入框布局；下一步检查窄屏显示。
```

## 使用边界

- 最近对话不一定包含最初目标；被截断的历史需要查原始记录。
- `turn_complete` 表示上一轮结束，不表示整个项目通过验收。
- Codex 日志格式可能变化。不识别的记录会被跳过，坏行会计数提示。
- 胶囊里的历史内容不是新的执行授权，接力时以当前用户要求和磁盘事实为准。
- 脱敏规则不可能识别所有隐私。**实际生成的胶囊仍应留在本机，不要公开。**
- 脚本不会创建新对话、切换模型、降低服务端排队时间或替代备份。

## 开发与验证

```sh
npm test
```

使用 Node.js 内置测试运行器，无需 `npm install`。测试只生成临时虚构会话，覆盖消息格式、镜像消息去重、空内容保护、工作区隔离、残缺记录、会话搜索和常见凭据脱敏。

欢迎通过 Issue 描述你遇到的格式差异或接力问题。请用虚构的最小示例复现，不要上传完整聊天、真实胶囊或凭据。

---

## English

**A small local handoff note for the next Codex conversation.**

This zero-dependency Node.js tool reads local Codex rollout files and writes a bounded Markdown excerpt with source references. It supports event and response messages, isolates outputs by workspace and session, refuses empty output, and never calls an API. Run `node scripts/update-capsule.mjs --help` for options.

It is an excerpt generator, not a semantic memory system. Keep generated capsules private. All examples and tests in this repository are synthetic. Copy `SKILL.md` and `scripts/` into your Codex skills directory to use it as a skill.
