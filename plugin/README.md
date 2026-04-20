# 卡皮巴拉的来信 (Capybara's Letter)

双语教育 Channel Plugin — 孩子许愿，卡皮巴拉夜里搜集线索，第二天送信回来。

## 架构

```
OpenClaw Runtime
├── Capybara Agent (extensions/edu-story/agent/)
│   SOUL.md / AGENTS.md / HEARTBEAT.md / MEMORY.md
├── edu-story Channel Plugin (extensions/edu-story/)
│   WebSocket gateway + inbound/outbound + tools
└── Frontend (packages/edu-story-frontend/)
    React + Phaser pixel animation
```

## 前置条件

- Node 22+
- pnpm (`pnpm install` 已完成)
- OpenClaw 已安装并可运行 (`pnpm openclaw --version`)

## 1. 注入 Agent 和 Channel 配置

运行注入脚本，将卡皮巴拉 Agent 和 edu-story Channel 写入 OpenClaw 配置：

```bash
pnpm openclaw config set agents.list '[{"id":"main"},{"id":"capybara","name":"Capybara'\''s Letter","workspace":"~/Downloads/Project_2603/openclaw/extensions/edu-story/agent","agentDir":"~/Downloads/Project_2603/openclaw/extensions/edu-story/agent","identity":{"name":"卡皮巴拉","theme":"pixel storybook mail","emoji":"📨"},"heartbeat":{"every":"8h","activeHours":{"start":"07:00","end":"21:00"}}}]'
```

```bash
pnpm openclaw config set channels.edu-story '{"enabled":true,"port":18820,"host":"127.0.0.1","agentId":"capybara"}'
```

> 注意：`workspace` 和 `agentDir` 路径需要替换为你本地的实际路径。

## 2. 验证配置

```bash
# 检查 Agent 是否注册
pnpm openclaw agents list

# 应该看到:
# - capybara (Capybara's Letter)
#   Identity: 📨 卡皮巴拉
#   Workspace: .../extensions/edu-story/agent

# 检查 Channel 是否配置
pnpm openclaw channels status

# 应该看到 edu-story channel 已配置
```

## 3. 启动 Gateway

Gateway 加载 channel plugin 并启动 WebSocket 服务：

```bash
pnpm openclaw gateway run --bind loopback --port 18789
```

edu-story channel 会在端口 `18820` 启动 WebSocket 服务器。

## 4. 启动前端

```bash
cd packages/edu-story-frontend
pnpm dev
```

前端默认在 `http://localhost:5173` 启动，通过 WebSocket 连接 `ws://127.0.0.1:18820`。

## 5. 使用

1. 打开浏览器访问 `http://localhost:5173`
2. 孩子输入一个愿望/问题
3. 卡皮巴拉 Agent 调用 `wikipedia_research` tool 搜集资料
4. Agent 生成结构化教学包（信件 + 场景 + 词卡）
5. 前端渲染 pixel 动画信件和可点击的英文词卡

## Agent Tools

Channel plugin 为 Agent 注册了以下工具：

| Tool | 用途 |
|------|------|
| `wikipedia_research` | 搜索维基百科，返回 ResearchDigest |
| `review_word_fsrs` | FSRS 间隔重复计算，处理词卡复习 |
| `get_learner_session` | 获取当前学习者的 session snapshot |

## 文件结构

```
extensions/edu-story/
├── openclaw.plugin.json   # Plugin manifest
├── package.json           # 包元数据
├── index.ts               # Channel entry (defineBundledChannelEntry)
├── setup-entry.ts         # Setup entry
├── api.ts                 # Public barrel (tool registration)
├── runtime-api.ts         # Runtime store barrel
├── src/
│   ├── channel.ts         # createChatChannelPlugin 定义
│   ├── gateway.ts         # WebSocket server (startAccount)
│   ├── inbound.ts         # WS message → agent dispatch
│   ├── outbound.ts        # Agent reply → WS JSON frame
│   ├── protocol.ts        # ClientFrame / ServerFrame 类型
│   ├── status.ts          # Channel status adapter
│   ├── types.ts           # ResolvedEduStoryAccount
│   └── tools/
│       ├── index.ts       # Tool barrel (wikipedia, review, session)
│       ├── wikipedia-research.ts
│       └── session-store.ts
└── agent/
    ├── SOUL.md            # 卡皮巴拉人格
    ├── AGENTS.md          # 工作流指令
    ├── HEARTBEAT.md       # 定时任务（晨间送信）
    └── MEMORY.md          # 记忆索引
```
