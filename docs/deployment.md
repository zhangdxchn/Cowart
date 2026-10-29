# Cowart 开发与部署

Cowart 同时包含前端画布、STDIO MCP 服务、技能和插件清单。不同文件由 Codex 在不同阶段加载，因此开发时不应把每次源码修改都当成一次插件发布。

OpenAI 官方文档说明：

- 本地插件安装后从 Codex 插件缓存加载；插件目录发生变化后，需要更新安装并重启 ChatGPT 桌面应用。
- 新增或修改 MCP 配置后，需要重启对应的 Codex 客户端。
- MCP-backed app 可以通过 Developer Mode 测试，但 Cowart 依赖本机项目目录和本地画布资源，不适合直接迁移成纯远程 MCP。

参考：

- [Build plugins](https://learn.chatgpt.com/docs/build-plugins)
- [Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp)

## 推荐结构

Cowart 使用两套相互独立的运行方式：

1. **开发模式**：Codex 直接启动源码仓库里的 `cowart_dev` MCP，避免每次修改都重新安装插件。
2. **发布模式**：构建并安装带版本号的 Cowart 插件，供正常使用和发布验证。

开发模式和已安装的发布版插件不要同时启用，以免 Codex 同时看到两组 Cowart 工具。

## 哪些改动需要重启

| 改动 | 当前任务 | 新任务 | 重启 Codex |
| --- | --- | --- | --- |
| 画布数据、页面资源、用户项目下的 `canvas/` 文件 | 立即可见或重新打开页面 | 不需要 | 不需要 |
| 使用 `npm run dev` 修改本地 Vite 画布 UI | 支持热更新 | 不需要 | 不需要 |
| 修改 `mcp/server.mjs` 或其他 MCP 运行逻辑 | 当前 MCP 进程仍是旧代码 | 推荐 | 通常不需要 |
| 修改 MCP 工具名称、输入 schema 或 widget 资源注册 | 当前任务仍保留旧工具定义 | 需要 | 如果新任务仍未刷新则需要 |
| 修改 `.mcp.json`、`.codex-plugin/plugin.json` 或 MCP 启动环境 | 不会自动生效 | 不足以保证生效 | 需要 |
| 修改技能内容 | 当前任务可能仍保留旧技能上下文 | 需要 | 插件安装副本发生变化时需要 |
| 更新已安装插件的任意文件 | 当前任务继续使用旧安装副本 | 不足以保证生效 | 更新安装后需要 |

## 开发模式

### 1. 安装依赖并构建一次

```bash
npm install
npm run build
```

前端界面开发可以另外启动 Vite：

```bash
npm run dev
```

`npm run dev` 适合调试画布 UI。Codex 原生 widget 使用构建后的静态资源；要验证原生 widget 时，仍需先运行 `npm run build`。

### 2. 从源码注册开发 MCP

在 `~/.codex/config.toml` 中增加一个仅用于开发的 MCP。路径必须替换成当前机器上的绝对路径：

```toml
[mcp_servers.cowart_dev]
command = "/absolute/path/to/node"
args = ["./scripts/start-mcp.mjs"]
cwd = "/absolute/path/to/Cowart"
```

Node 路径示例：

- Apple Silicon Homebrew：`/opt/homebrew/bin/node`
- Intel macOS Homebrew：`/usr/local/bin/node`
- Linux：以 `command -v node` 的结果为准
- Windows：使用本机 `node.exe` 的绝对路径

使用绝对路径可以避免桌面应用没有继承终端 PATH 时，MCP 无法启动。

保存配置后重启一次 Codex。之后只要这段 MCP 配置不变，就不需要因为普通源码修改反复重启整个应用。

### 3. 日常开发循环

1. 修改前端或 MCP 代码。
2. 前端调试使用 Vite 热更新；原生 widget 验证前运行 `npm run build`。
3. MCP 实现发生变化时，结束旧任务并开启新任务，让 Codex 启动新的 MCP 进程。
4. 工具 schema、技能或 MCP 配置发生变化时，重启 Codex 后再开启新任务。
5. 通过 `render_cowart_canvas_widget` 打开真实 widget，不能只用编译结果代替运行时验证。

## 发布模式

### 1. 发布前验证

```bash
npm run check
npm test
npm run build
npm run probe:mcp
```

`probe:mcp` 会验证 Cowart 工具、widget 资源、画布状态读写和下载能力。它会创建临时文件，并在验证后清理。

### 2. 升级版本

每次发布都应同步升级以下版本：

- `.codex-plugin/plugin.json`
- `package.json`
- `package-lock.json`

不要用相同版本覆盖已经安装的缓存。Codex 的插件安装目录包含版本号，相同版本可能继续复用旧副本。

### 3. 更新插件安装

1. 确认 personal marketplace 的 `source.path` 指向最新 Cowart 仓库。
2. 在 ChatGPT 桌面应用的 Plugins 页面更新或重新安装 Cowart。
3. 运行 `codex plugin list`，确认 Cowart 显示为目标版本且处于 enabled 状态。
4. 运行 `codex mcp list`，确认 `cowart_mcp` 已启用，并且 `cwd` 指向目标版本的插件目录。
5. 完全重启 ChatGPT/Codex 桌面应用。
6. 创建一个新的 Codex 任务，发送“打开 Cowart 画布继续创作”。

### 4. 发布验收

发布完成必须满足：

- `render_cowart_canvas_widget` 可见并能打开原生 widget。
- Cowart MCP 共 11 个工具可枚举。
- 新建画布会把数据写入用户项目的 `canvas/`，而不是插件仓库。
- 已有画布可以重新打开，页面资源和选择状态正常恢复。
- MCP 启动失败时，能够看到明确错误，而不是只提示用户重复新建任务。

## 回滚

1. 将 marketplace 源切回上一个可用版本。
2. 重新安装该版本的插件。
3. 重启 Codex 并在新任务中验证。

Cowart 画布数据保存在用户项目目录，因此回滚插件不应删除或迁移 `canvas/` 数据。不要直接修改 `~/.codex/plugins/cache/` 中的文件；缓存应由插件安装流程管理。

## 为什么不默认使用远程 Developer Mode App

OpenAI 的 Developer Mode App 更适合由远程 MCP 提供工具和服务的插件。Cowart MCP 需要直接读写当前 Codex 项目的画布、图片和 HTML 资源。如果改成纯远程 MCP，就必须重新设计文件上传、同步、权限、隐私和离线降级。

在这些能力完成之前，Cowart 保持本地 STDIO MCP 更简单，也更符合“画布数据属于当前用户项目”的产品边界。
