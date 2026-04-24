# 卡皮巴拉的来信 (Capybara's Letter)

孩子今晚许愿，卡皮巴拉夜里搜集线索，第二天送信回来——附带可展开来信、场景展示和英文词卡。

面向 3-8 岁儿童的双语教育产品，运行在 [OpenClaw](https://github.com/openclaw/openclaw) 之上。

## 架构

```
capybara-letter/
├── plugin/      OpenClaw channel plugin（WebSocket gateway + agent tools）
├── frontend/    React + Tailwind 前端入口
└── shared/      共享类型和 Zod schemas
```

`@capybara-letter/plugin` 是这个产品唯一的插件真源。

- 不再把产品源码并入 OpenClaw 仓库
- 不再依赖 `extensions/capybara-letter/` 副本作为源码真源
- OpenClaw 自己的 Feishu 或其他 channels 可以继续存在，但不属于本产品链路
- 本产品只关心 `capybara` agent + `capybara-letter` channel + 独立前端

```
┌─────────────────────────────────────────────┐
│  OpenClaw Gateway                           │
│                                             │
│  Capybara Agent          capybara-letter Channel  │
│  ┌──────────────┐       ┌────────────────┐  │
│  │ SOUL.md      │◄──────│ WS gateway     │  │
│  │ AGENTS.md    │       │ inbound/outbound│  │
│  │ HEARTBEAT.md │       │ tools:          │  │
│  │ MEMORY.md    │       │  wikipedia      │  │
│  └──────────────┘       │  compose_lesson │  │
│                         │  get_session    │  │
│                         └───────┬────────┘  │
└─────────────────────────────────┼───────────┘
                                  │ WebSocket :18820
                           ┌──────┴──────┐
                           │  Frontend   │
                           │  React +    │
                           │  Web Frontend│
                           └─────────────┘
```

## 前置条件

- Node 22+
- pnpm 9+
- 已安装可运行的 OpenClaw CLI / Gateway

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

`--link` 更适合高级开发调试；默认的托管安装更稳。

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

### 5. 验证

```bash
openclaw plugins list
# 应看到: capybara-letter 已安装/已加载

openclaw agents list
# 应看到: capybara (Capybara's Letter) — Identity: 📨 卡皮巴拉

openclaw channels status
# 应看到: capybara-letter channel configured
```

### 6. 启动

终端 1 — Gateway：
```bash
openclaw gateway run --bind loopback --port 18789
```

终端 2 — 前端（在本仓库目录下）：
```bash
cd capybara-letter
pnpm dev:frontend
```

打开 http://localhost:5173，输入一个愿望，等待卡皮巴拉回信。

### 7. 导入 Mock 会话到 OpenClaw + Snapshot

```bash
pnpm seed:mock-session -- --session-id capybara-demo
```

可选参数：

- `--mock-at <ISO时间>`: 指定时间切片构建 snapshot
- `--account-id <id>`: 指定写入哪个 channel account 的 OpenClaw route metadata

导入后，前端可通过 `sessionId` 直连同一条会话：

```text
http://localhost:5173/?sessionId=capybara-demo
```

## 产品流程

1. 孩子输入愿望（"我想知道恐龙为什么灭绝"）
2. `capybara` agent 读取长期记忆、学习词库和上下文环境
3. Agent 调用 `wikipedia_research`、`get_weather` 等工具搜集资料
4. Agent 调用 `compose_lesson` 生成结构化教学包：信件 + 场景 + 英文词卡
5. Channel 通过 WebSocket 推送 JSON payload 给前端
6. 前端渲染来信、场景状态、可点击词卡和交互流程
7. HeartBeat 每天早晨自动送信（如果有昨晚的愿望）

## Agent Tools

| Tool | 用途 |
|------|------|
| `wikipedia_research` | 搜索维基百科，返回 ResearchDigest |
| `get_weather` | 获取环境天气，辅助信件情境编排 |
| `compose_lesson` | 生成结构化教学包并回写 session |
| `review_word_fsrs` | FSRS 间隔重复，处理词卡复习评分 |
| `get_learner_session` | 获取学习者当前 session snapshot |

## 开发

```bash
# 前端
pnpm dev:frontend

# 类型检查
pnpm check
```

## 与 OpenClaw 的关系

本仓库是独立产品代码。`plugin/` 目录是一个标准的 OpenClaw channel plugin，通过 `openclaw/plugin-sdk/*` 与 OpenClaw 交互。

开发期间，推荐使用 `openclaw plugins install ./plugin` 让 OpenClaw 自己托管插件安装，而不是复制一份源码到 OpenClaw 仓库里。

生产部署时，plugin 将发布到 npm，用户通过 `openclaw plugins install @capybara-letter/plugin` 安装。
