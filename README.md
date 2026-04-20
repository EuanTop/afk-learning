# 卡皮巴拉的来信 (Capybara's Letter)

孩子今晚许愿，卡皮巴拉夜里搜集线索，第二天送信回来——附带 pixel 动画场景和英文词卡。

面向 3-8 岁儿童的双语教育产品，运行在 [OpenClaw](https://github.com/openclaw/openclaw) 之上。

## 架构

```
capybara-letter/
├── plugin/      OpenClaw channel plugin（WebSocket gateway + agent tools）
├── frontend/    React + Phaser pixel animation UI
├── shared/      共享类型和 Zod schemas
└── globe/       edu-globe 实验（3D 地球探索）
```

运行时依赖 OpenClaw 提供 Agent 调度、记忆、HeartBeat 和消息路由。

```
┌─────────────────────────────────────────────┐
│  OpenClaw Gateway                           │
│                                             │
│  Capybara Agent          edu-story Channel  │
│  ┌──────────────┐       ┌────────────────┐  │
│  │ SOUL.md      │◄──────│ WS gateway     │  │
│  │ AGENTS.md    │       │ inbound/outbound│  │
│  │ HEARTBEAT.md │       │ tools:          │  │
│  │ MEMORY.md    │       │  wikipedia      │  │
│  └──────────────┘       │  review_word    │  │
│                         │  get_session    │  │
│                         └───────┬────────┘  │
└─────────────────────────────────┼───────────┘
                                  │ WebSocket :18820
                           ┌──────┴──────┐
                           │  Frontend   │
                           │  React +    │
                           │  Phaser     │
                           └─────────────┘
```

## 前置条件

- Node 22+
- pnpm 9+
- OpenClaw 已安装（`npm i -g openclaw` 或从源码构建）

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 注入 Agent 配置

将卡皮巴拉 Agent 注册到 OpenClaw：

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
      identity: { name: '卡皮巴拉', theme: 'pixel storybook mail', emoji: '📨' },
      heartbeat: { every: '8h', activeHours: { start: '07:00', end: '21:00' } }
    });
    process.stdout.write(JSON.stringify(existing));
  ")"
```

### 3. 注入 Channel 配置

```bash
openclaw config set channels.edu-story '{"enabled":true,"port":18820,"host":"127.0.0.1","agentId":"capybara"}'
```

### 4. 验证

```bash
openclaw agents list
# 应看到: capybara (Capybara's Letter) — Identity: 📨 卡皮巴拉

openclaw channels status
# 应看到: edu-story channel configured
```

### 5. 启动

终端 1 — Gateway：
```bash
openclaw gateway run --bind loopback --port 18789
```

终端 2 — 前端：
```bash
pnpm dev:frontend
```

打开 http://localhost:5173，输入一个愿望，等待卡皮巴拉回信。

## 产品流程

1. 孩子输入愿望（"我想知道恐龙为什么灭绝"）
2. Agent 调用 `wikipedia_research` tool 搜集资料
3. Agent 生成结构化教学包：信件 + pixel 场景 + 英文词卡
4. Channel 通过 WebSocket 推送 JSON payload 给前端
5. 前端渲染 pixel 动画、可点击词卡、互动任务
6. HeartBeat 每天早晨自动送信（如果有昨晚的愿望）

## Agent Tools

| Tool | 用途 |
|------|------|
| `wikipedia_research` | 搜索维基百科，返回 ResearchDigest |
| `review_word_fsrs` | FSRS 间隔重复，处理词卡复习评分 |
| `get_learner_session` | 获取学习者当前 session snapshot |

## 开发

```bash
# 前端
pnpm dev:frontend

# Globe 实验
pnpm dev:globe

# 类型检查
pnpm check
```

## 与 OpenClaw 的关系

本仓库是独立产品代码。`plugin/` 目录是一个标准的 OpenClaw channel plugin，通过 `openclaw/plugin-sdk/*` 与 OpenClaw 交互。

开发时，plugin 需要 OpenClaw 作为 peer dependency。生产部署时，plugin 安装到 OpenClaw 实例中运行。
