# AFK Learning：卡皮巴拉的来信 (Capybara's Letter)
![alt text](banner.jpg)

一个面向 6+ 用户、全年龄可参与的学习陪伴产品原型。
用户今天提出想知道的问题，卡皮巴拉夜里去“收集线索”，第二天早晨寄回一封小信。信里不只是答案，还会带着英文词卡、可点击发音、简单复习和场景化呈现，把“学习”做成一种被期待的日常体验。

当前这个 MVP 的视觉和交互依然保留了低龄友好的表达方式，但产品定位已经调整为 6+、全年龄可参与，后续会逐步扩展到更广的人群与更丰富的学习主题。

这个仓库是项目的第一个可运行 MVP：核心的产品闭环已经打通，前端、OpenClaw Agent、会话存储、词卡复习、TTS 朗读都能真实跑起来。

## MVP 状态

当前阶段已经完成：

- 用户通过网页输入今天想探索的话题
- `capybara` Agent 通过 OpenClaw 处理消息
- Agent 调用研究与编排工具，生成结构化教学包
- 前端渲染像素风场景、来信、历史会话、词卡面板
- 词卡支持 FSRS 间隔复习
- 信件朗读、单词点读支持讯飞 TTS
- 会话 snapshot 与 OpenClaw 会话链路已经打通

当前阶段还没有完成：

- 更完整的用户配置端与家长端产品化能力
- 更强的长期推荐策略与主动送信排程
- 更丰富的游戏化世界与角色成长系统
- App / 桌面端打包分发

## 产品体验

产品的核心体验不是“聊天问答”，而是“延迟满足 + 第二天收到回信”：

1. 用户今天说出一个愿望或问题。
2. 卡皮巴拉接过这个话题，去研究、搜集、整理。
3. 第二天送来一封可展开的信。
4. 信里夹带少量可学、可点、可复习的英语内容。
5. 用户读完后，再决定明天想知道什么。

这让 Agent 更像一个持续陪伴的角色，而不是一次性的工具。

## 当前亮点

- 不是纯 prompt demo，而是完整的产品链路 MVP
- OpenClaw 负责 Agent 与工具编排，前端单独演进
- 角色、前端、会话、词卡、TTS 都围绕同一个产品主题收敛
- 保持“尽量不破坏 OpenClaw upstream”的插件式架构

## 技术结构

```text
capybara-letter/
├── plugin/      OpenClaw channel plugin（WebSocket gateway + agent tools）
├── frontend/    React + Tailwind Web 前端
└── shared/      共享类型、schema 与数据契约
```

`@capybara-letter/plugin` 是当前产品唯一的插件真源。

- 不再把产品源码直接并入 OpenClaw 仓库
- 不再依赖 `extensions/capybara-letter/` 一类副本作为真实源码
- OpenClaw 本体可以继续承载 Feishu 等其他 channel，但不属于本产品链路
- 本产品只关心 `capybara` Agent、`capybara-letter` channel 和独立前端

### 系统链路

```text
┌─────────────────────────────────────────────┐
│                OpenClaw Gateway             │
│                                             │
│  Capybara Agent        capybara-letter      │
│  ┌──────────────┐      Channel Plugin       │
│  │ SOUL.md      │◄────►┌─────────────────┐  │
│  │ AGENTS.md    │      │ WS gateway      │  │
│  │ HEARTBEAT.md │      │ inbound/outbound│  │
│  │ MEMORY.md    │      │ session store   │  │
│  └──────────────┘      │ tools           │  │
│                        │ - wikipedia     │  │
│                        │ - weather       │  │
│                        │ - compose       │  │
│                        │ - review        │  │
│                        └───────┬─────────┘  │
└────────────────────────────────┼────────────┘
                                 │ ws://127.0.0.1:18820
                          ┌──────┴──────┐
                          │  Frontend   │
                          │ React + Web │
                          └─────────────┘
```

## 技术栈

- Agent Runtime: [OpenClaw](https://github.com/openclaw/openclaw)
- Frontend: React + Tailwind CSS + Phaser/像素场景渲染
- Plugin Runtime: TypeScript + WebSocket
- Session / Memory Layer: OpenClaw 会话链路 + 产品侧结构化 snapshot
- Spaced Repetition: `ts-fsrs`
- TTS: 讯飞在线语音合成

## 快速开始

### 1. 安装依赖

```bash
cd capybara-letter
pnpm install
```

### 2. 安装本地插件到 OpenClaw

推荐默认使用 OpenClaw 托管的本地路径安装：

```bash
openclaw plugins install ./plugin
```

等价命令：

```bash
pnpm openclaw:install
```

如果你明确需要把源码目录直接 link 进 OpenClaw，再使用：

```bash
openclaw plugins install -l ./plugin
```

`--link` 更适合高级调试；默认的托管安装更稳。

### 3. 注入 Agent 配置

```bash
# 替换 <REPO_PATH> 为本仓库的绝对路径
REPO=<REPO_PATH>

openclaw config set agents.list "$(openclaw config get agents.list | \
  node -e "
    const list = JSON.parse(require('fs').readFileSync(0,'utf8'));
    const existing = list.filter(a => a.id !== 'capybara');
    existing.push({
      id: 'capybara',
      name: \"Capybara's Letter\",
      workspace: '$REPO/plugin/agent',
      agentDir: '$REPO/plugin/agent',
      identity: { name: '卡皮巴拉', theme: 'storybook mail', emoji: '📨' },
      heartbeat: { every: '8h', activeHours: { start: '07:00', end: '21:00' } }
    });
    process.stdout.write(JSON.stringify(existing));
  ")"
```

### 4. 注入 Channel 配置

```bash
openclaw config set channels.capybara-letter '{"enabled":true,"port":18820,"host":"127.0.0.1","agentId":"capybara"}'
```

### 5. 验证安装状态

```bash
openclaw plugins list
openclaw agents list
openclaw channels status
```

你应该能看到：

- `capybara-letter` 已安装
- `capybara` Agent 已注册
- `capybara-letter` channel 已配置

### 6. 启动

终端 1，启动 OpenClaw Gateway：

```bash
openclaw gateway run --bind loopback --port 18789
```

如果你本机没有全局 `openclaw` 命令，也可以在 OpenClaw 仓库中这样启动：

```bash
cd /path/to/openclaw
node openclaw.mjs gateway run --bind loopback --port 18789
```

终端 2，启动前端：

```bash
cd capybara-letter
pnpm dev:frontend
```

打开：

```text
http://localhost:5173
```

## 配置讯飞 TTS

TTS 只接在 `@capybara-letter/plugin` 后端，不进入 OpenClaw core，也不会把密钥暴露给浏览器。

第一次配置时：

```bash
cd capybara-letter
cp .env.example .env
```

然后编辑 `.env`：

```dotenv
CAPYBARA_TTS_XFYUN_APP_ID=你的_APP_ID
CAPYBARA_TTS_XFYUN_API_KEY=你的_API_KEY
CAPYBARA_TTS_XFYUN_API_SECRET=你的_API_SECRET
```

默认音色已经设置为讯飞乐乐：

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

配置完成后，重启 Gateway 即可生效。

当前支持：

- 展开信件后的整封信朗读
- 词卡区域点读
- 点击信件正文中的高亮英文词直接点读

## 导入 Mock 会话

如果你想快速演示一条完整会话，可以导入仓库里的 mock 数据：

```bash
pnpm seed:mock-session -- --session-id capybara-demo
```

可选参数：

- `--mock-at <ISO时间>`：指定时间切片构建 snapshot
- `--account-id <id>`：指定写入哪个 channel account 的 OpenClaw route metadata

导入后，可直接通过带 `sessionId` 的地址查看：

```text
http://localhost:5173/?sessionId=capybara-demo
```

## Agent Tools

| Tool | 用途 |
|------|------|
| `wikipedia_research` | 搜索维基百科，返回 `ResearchDigest` |
| `get_weather` | 获取环境天气，辅助信件情境编排 |
| `compose_lesson` | 生成结构化教学包并写回 session |
| `review_word_fsrs` | 处理词卡复习评分与下次复习时间 |
| `get_learner_session` | 获取学习者当前 session snapshot |

## 开发说明

### 常用命令

```bash
# 启动前端
pnpm dev:frontend

# 类型检查
pnpm check

# 导入 mock 数据
pnpm seed:mock-session -- --session-id capybara-demo
```

### 热更新与重启规则

- 改 `frontend/`：Vite 会热更新，必要时手动刷新页面。
- 改 `plugin/`：需要重启 OpenClaw Gateway，`18820` 才会加载最新逻辑。
- 如果你使用的是 `openclaw plugins install -l ./plugin`，通常不需要重复安装插件，只需要重启 Gateway。

## 与 OpenClaw 的关系

本仓库是独立产品代码，不是 OpenClaw upstream 的内置功能分支。

`plugin/` 目录是一个标准的 OpenClaw channel plugin，通过 `openclaw/plugin-sdk/*` 与 OpenClaw 交互。这样做的目的，是让产品能够：

- 尽量减少对 OpenClaw 源码的破坏性修改
- 更方便持续同步 OpenClaw upstream
- 保持“产品前端 / 产品逻辑 / OpenClaw 核心”之间的边界清晰

未来如果进入更完整的分发形态，这个产品可以继续沿着两条路线演进：

- 独立开源插件 + 独立前端
- 与 OpenClaw 一起打包成完整应用

## License

本项目当前采用 `PolyForm Noncommercial 1.0.0`。

它属于 source-available / non-commercial 许可方案，不属于 OSI 定义下的 open source。

这意味着：

- 你可以阅读、学习、修改这份代码
- 你可以在非商用前提下分发原版或修改版
- 你必须保留对 `@EuanTop` 的署名
- 你不能将本项目或其修改版用于商业用途

如果你希望将它用于商业用途，必须先获得 `@EuanTop` 的单独书面授权。

请以 [LICENSE](./LICENSE) 中的正式条款为准。README 这一节只是便于理解的摘要，不替代正式许可文本。
