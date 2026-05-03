# 卡皮巴拉的来信 (Capybara's Letter)

双语教育 Channel Plugin — 孩子许愿，卡皮巴拉夜里搜集线索，第二天送信回来。

## 架构

```
capybara-letter/plugin/
├── agent/
│   SOUL.md / AGENTS.md / HEARTBEAT.md / MEMORY.md
├── src/
│   WebSocket gateway + inbound/outbound + tools
└── package.json / openclaw.plugin.json
```

## 前置条件

- Node 22+
- pnpm
- OpenClaw 已安装并可运行

## 1. 安装插件

从仓库根目录执行：

```bash
openclaw plugins install ./plugin
```

这会把 `@capybara-letter/plugin` 作为本地路径插件安装到 OpenClaw 的托管插件目录。

如果你需要直接 link 本地源码目录，也可以使用：

```bash
openclaw plugins install -l ./plugin
```

## 2. 注入 Agent 和 Channel 配置

```bash
openclaw config set agents.list '[{"id":"main"},{"id":"capybara","name":"Capybara'\''s Letter","workspace":"<REPO>/plugin/agent","agentDir":"<REPO>/plugin/agent","identity":{"name":"卡皮巴拉","theme":"storybook mail","emoji":"📨"},"heartbeat":{"every":"8h","activeHours":{"start":"07:00","end":"21:00"}}}]'
```

```bash
openclaw config set channels.capybara-letter '{"enabled":true,"port":18820,"host":"127.0.0.1","agentId":"capybara"}'
```

> 注意：`<REPO>` 需要替换为你本地 `capybara-letter` 仓库的绝对路径。

## 3. 验证配置

```bash
openclaw plugins list
openclaw agents list
openclaw channels status
```

## 4. 启动 Gateway

Gateway 加载 channel plugin 并启动 WebSocket 服务：

```bash
openclaw gateway run --bind loopback --port 18789
```

capybara-letter channel 会在端口 `18820` 启动 WebSocket 服务器。

## 5. 启动前端

```bash
cd ..
pnpm dev
```

前端默认在 `http://localhost:5173` 启动，通过 WebSocket 连接 `ws://127.0.0.1:18820`。

## 5.1 配置讯飞 TTS

TTS 实现在 `@capybara-letter/plugin` 后端，不进入 OpenClaw core，也不直接把密钥发给浏览器。

推荐方式是直接在 `capybara-letter` 根目录写 `.env`：

```bash
cd ..
cp .env.example .env
```

然后填写：

```dotenv
CAPYBARA_TTS_XFYUN_APP_ID=你的_APP_ID
CAPYBARA_TTS_XFYUN_API_KEY=你的_API_KEY
CAPYBARA_TTS_XFYUN_API_SECRET=你的_API_SECRET
```

可选调节项：

```dotenv
CAPYBARA_TTS_XFYUN_VCN=x_lele
CAPYBARA_TTS_XFYUN_SPEED=45
CAPYBARA_TTS_XFYUN_VOLUME=65
CAPYBARA_TTS_XFYUN_PITCH=50
```

插件会自动读取：

1. `capybara-letter/.env`
2. `capybara-letter/.env.local`
3. `capybara-letter/plugin/.env`
4. `capybara-letter/plugin/.env.local`

如果你更喜欢 shell 环境变量，也可以继续 `export ...`，并且 shell 里的值优先级更高。

然后重启：

```bash
openclaw gateway run --bind loopback --port 18789
```

当前前端支持：

1. 展开信件后朗读整封信
2. 词卡区域点读当前单词
3. 点击信件正文中的高亮单词直接点读

如果没有配置讯飞密钥，channel 会返回显式 `speech-error`，不会伪造音频。

## 6. 使用

1. 打开浏览器访问 `http://localhost:5173`
2. 孩子输入一个愿望/问题
3. 卡皮巴拉 Agent 调用 `wikipedia_research` tool 搜集资料
4. Agent 调用 `compose_lesson` 生成结构化教学包（信件 + 场景 + 词卡）
5. 前端渲染来信、场景状态和可点击的英文词卡

## Mock 会话导入

把根目录 `mock.json` 投影成真实 snapshot，并同步登记 OpenClaw 会话元数据：

```bash
pnpm seed:mock-session -- --session-id capybara-demo
```

可选：

- `--mock-at <ISO时间>`
- `--account-id <account-id>`

## Agent Tools

Channel plugin 为 Agent 注册了以下工具：

| Tool | 用途 |
|------|------|
| `wikipedia_research` | 搜索维基百科，返回 ResearchDigest |
| `get_weather` | 获取天气环境数据 |
| `compose_lesson` | 生成教学包并写入 session |
| `review_word_fsrs` | FSRS 间隔重复计算，处理词卡复习 |
| `get_learner_session` | 获取当前学习者的 session snapshot |

## 文件结构

```
plugin/
├── openclaw.plugin.json   # Plugin manifest
├── package.json           # 包元数据
├── index.ts               # Channel entry
├── setup-entry.ts         # Setup entry
├── api.ts                 # Public barrel (tool registration)
├── runtime-api.ts         # Runtime store barrel
├── src/
│   ├── channel.ts         # createChatChannelPlugin 定义
│   ├── gateway.ts         # WebSocket server (startAccount)
│   ├── inbound.ts         # WS message → agent dispatch
│   ├── outbound.ts        # Agent reply → WS JSON frame
│   ├── status.ts          # Channel status adapter
│   ├── types.ts           # ResolvedCapybaraLetterAccount
│   └── tools/
│       ├── index.ts       # Tool barrel
│       ├── compose-lesson.ts
│       ├── weather.ts
│       ├── wikipedia-research.ts
│       └── session-store.ts
└── agent/
    ├── SOUL.md            # 卡皮巴拉人格
    ├── AGENTS.md          # 工作流指令
    ├── HEARTBEAT.md       # 定时任务（晨间送信）
    └── MEMORY.md          # 记忆索引
```

## 开发注意

- 改 `plugin/src/**` 后，需要重启 OpenClaw Gateway，`18820` 才会重新加载最新逻辑。
- 如果插件是 `openclaw plugins install -l ./plugin` 的 link 安装，通常不需要重复安装插件，只需要重启 Gateway。
