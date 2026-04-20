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
- OpenClaw 源码 checkout（用于开发期间加载 plugin）

## 快速开始

### 1. 安装依赖

```bash
cd capybara-letter
pnpm install
```

### 2. 部署 Plugin 到 OpenClaw

Plugin 需要放在 OpenClaw 的 `extensions/` 目录下才能被 Gateway 加载：

```bash
# 替换为你的 OpenClaw 源码路径
OPENCLAW_DIR=~/Downloads/Project_2603/openclaw

# 复制 plugin 到 OpenClaw extensions（已 gitignore）
cp -R plugin "$OPENCLAW_DIR/extensions/edu-story"

# 安装 OpenClaw 依赖（让 pnpm 发现新 plugin）
cd "$OPENCLAW_DIR" && pnpm install

# 构建（生成 plugin 运行时模块）
pnpm build
```

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
      identity: { name: '卡皮巴拉', theme: 'pixel storybook mail', emoji: '📨' },
      heartbeat: { every: '8h', activeHours: { start: '07:00', end: '21:00' } }
    });
    process.stdout.write(JSON.stringify(existing));
  ")"
```

### 4. 注入 Channel 配置

```bash
openclaw config set channels.edu-story '{"enabled":true,"port":18820,"host":"127.0.0.1","agentId":"capybara"}'
```

### 5. 验证

```bash
openclaw agents list
# 应看到: capybara (Capybara's Letter) — Identity: 📨 卡皮巴拉

openclaw channels status
# 应看到: edu-story channel configured
```

### 6. 启动

终端 1 — Gateway（在 OpenClaw 目录下）：
```bash
cd $OPENCLAW_DIR
pnpm openclaw gateway run --bind loopback --port 18789
```

终端 2 — 前端（在本仓库目录下）：
```bash
cd capybara-letter
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

开发期间，plugin 以副本形式放在 OpenClaw 的 `extensions/edu-story/` 目录下（已加入 `.gitignore`），这样 pnpm workspace 能发现它、Gateway 能加载它。修改 plugin 代码后需要重新复制并 rebuild。

生产部署时，plugin 将发布到 npm，用户通过 `openclaw plugins install @capybara-letter/plugin` 安装。
