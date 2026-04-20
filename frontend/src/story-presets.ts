import type {
  PixelDemo,
  StoryLetter,
  StoryScene,
  StorySceneActorMotion,
  StoryTimeline,
} from "@capybara-letter/shared";

export type EnglishLevelOption = {
  id: string;
  label: string;
  cefr: string;
  gseRange: string;
  summary: string;
};

export type AdventurePhase =
  | "idle"
  | "wish-heard"
  | "departing"
  | "researching"
  | "returning"
  | "delivered";

export type AdventurePreview = {
  titleTag: string;
  statusLine: string;
  encounterLine: string;
  scene: StoryScene;
};

export const ENGLISH_LEVEL_OPTIONS: EnglishLevelOption[] = [
  {
    id: "gse-10-15",
    label: "GSE 10-15 · 语音启蒙",
    cefr: "<A1",
    gseRange: "10-15",
    summary: "以听辨、跟读和单词唤醒为主，需要大量图片与动作支架。",
  },
  {
    id: "gse-16-21",
    label: "GSE 16-21 · 表达起步",
    cefr: "<A1",
    gseRange: "16-21",
    summary: "能在图片和提示下用单词或极短短语回应，适合 3-5 岁持续启蒙。",
  },
  {
    id: "gse-22-29",
    label: "GSE 22-29 · A1 日常起步",
    cefr: "A1",
    gseRange: "22-29",
    summary: "能理解简单课堂语言和日常问答，适合 5-7 岁进入稳定输入输出。",
  },
  {
    id: "gse-30-35",
    label: "GSE 30-35 · A1-A2 图文表达",
    cefr: "A1-A2",
    gseRange: "30-35",
    summary: "能围绕熟悉主题做简短句子表达与图文理解，适合 6-8 岁进阶。",
  },
];

export const DEFAULT_ENGLISH_LEVEL_ID = "gse-22-29";
export const AGE_OPTIONS = [3, 4, 5, 6, 7, 8] as const;

function buildPalette(phase: AdventurePhase) {
  const shared = [
    { id: "paper", value: "#FFF4DF" },
    { id: "ink", value: "#2B2118" },
    { id: "wood", value: "#8D6741" },
    { id: "woodShadow", value: "#6A4B2F" },
    { id: "leafDark", value: "#35583B" },
    { id: "leafMid", value: "#4E7950" },
    { id: "leafLight", value: "#7AA665" },
    { id: "reed", value: "#709658" },
    { id: "water", value: "#5B83B3" },
    { id: "waterLight", value: "#89B7EA" },
    { id: "mist", value: "#EEF5FF" },
    { id: "shore", value: "#6E8053" },
    { id: "shoreLight", value: "#8EA66B" },
    { id: "mail", value: "#F1B45E" },
    { id: "lantern", value: "#FFD777" },
    { id: "blush", value: "#F6C39A" },
  ] as const;

  switch (phase) {
    case "wish-heard":
      return [
        { id: "skyTop", value: "#9BBBE6" },
        { id: "skyMid", value: "#C4D9F4" },
        { id: "skyBottom", value: "#F2E0C7" },
        { id: "glow", value: "#FFD783" },
        ...shared,
      ];
    case "departing":
      return [
        { id: "skyTop", value: "#8EAFD8" },
        { id: "skyMid", value: "#BFD2EE" },
        { id: "skyBottom", value: "#EED7B8" },
        { id: "glow", value: "#FFC468" },
        ...shared,
      ];
    case "researching":
      return [
        { id: "skyTop", value: "#4E699B" },
        { id: "skyMid", value: "#7594C3" },
        { id: "skyBottom", value: "#C4CEE0" },
        { id: "glow", value: "#FFE58F" },
        ...shared,
      ];
    case "returning":
      return [
        { id: "skyTop", value: "#8FB5E8" },
        { id: "skyMid", value: "#C8DCF7" },
        { id: "skyBottom", value: "#F7E4CA" },
        { id: "glow", value: "#FFC76F" },
        ...shared,
      ];
    case "delivered":
      return [
        { id: "skyTop", value: "#A5C9F0" },
        { id: "skyMid", value: "#D6E7FB" },
        { id: "skyBottom", value: "#FFF0D9" },
        { id: "glow", value: "#FFD176" },
        ...shared,
      ];
    case "idle":
    default:
      return [
        { id: "skyTop", value: "#6D8DBF" },
        { id: "skyMid", value: "#9EBAE1" },
        { id: "skyBottom", value: "#F0DEC8" },
        { id: "glow", value: "#FFD27A" },
        ...shared,
      ];
  }
}

function actorMotionForPhase(phase: AdventurePhase): StorySceneActorMotion {
  switch (phase) {
    case "wish-heard":
      return "listen";
    case "departing":
      return "depart";
    case "researching":
      return "search";
    case "returning":
      return "return";
    case "delivered":
      return "deliver";
    case "idle":
    default:
      return "still";
  }
}

function rectElement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  extras: Partial<{
    alpha: number;
    cornerRadius: number;
    motion: {
      preset: "still" | "float" | "drift-x" | "drift-y" | "pulse" | "sway" | "bob";
      amplitude?: number;
      speed?: number;
    };
  }> = {},
) {
  return {
    kind: "rect" as const,
    id,
    x,
    y,
    width,
    height,
    fill,
    ...extras,
  };
}

function ellipseElement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  extras: Partial<{
    alpha: number;
    motion: {
      preset: "still" | "float" | "drift-x" | "drift-y" | "pulse" | "sway" | "bob";
      amplitude?: number;
      speed?: number;
    };
  }> = {},
) {
  return {
    kind: "ellipse" as const,
    id,
    x,
    y,
    width,
    height,
    fill,
    ...extras,
  };
}

function pixelElement(params: {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sprite: string[];
  symbols: Array<{ symbol: string; fill: string }>;
  alpha?: number;
  motion?: {
    preset: "still" | "float" | "drift-x" | "drift-y" | "pulse" | "sway" | "bob";
    amplitude?: number;
    speed?: number;
  };
}) {
  return {
    kind: "pixel-art" as const,
    ...params,
  };
}

function mailboxElement(x = 17, y = 55) {
  return pixelElement({
    id: "mailbox",
    x,
    y,
    width: 11,
    height: 18,
    sprite: [
      "...ooooo....",
      "..oammmmo...",
      "..omapppmo..",
      "..oammmmo...",
      "...oo.oo....",
      "...oo.oo....",
      "...oo.oo....",
    ],
    symbols: [
      { symbol: "o", fill: "ink" },
      { symbol: "a", fill: "wood" },
      { symbol: "m", fill: "mail" },
      { symbol: "p", fill: "paper" },
    ],
  });
}

function lanternElement(x = 27, y = 54) {
  return pixelElement({
    id: "lantern-post",
    x,
    y,
    width: 7,
    height: 17,
    sprite: [
      "...o...",
      "..ooo..",
      "..olo..",
      "..oll..",
      "..olo..",
      "...o...",
      "...w...",
      "...w...",
      "...w...",
      "..www..",
    ],
    symbols: [
      { symbol: "o", fill: "ink" },
      { symbol: "l", fill: "lantern" },
      { symbol: "w", fill: "wood" },
    ],
    motion: {
      preset: "bob",
      amplitude: 0.35,
      speed: 0.8,
    },
  });
}

function reedElement(id: string, x: number, y: number, width: number, height: number) {
  return pixelElement({
    id,
    x,
    y,
    width,
    height,
    sprite: [
      ".r....r.",
      ".rr..rr.",
      "..rrrr..",
      "...rr...",
      "..rrrr..",
      ".rr..rr.",
      "..r..r..",
      "..i..i..",
    ],
    symbols: [
      { symbol: "r", fill: "reed" },
      { symbol: "i", fill: "ink" },
    ],
    motion: {
      preset: "sway",
      amplitude: 1.8,
      speed: 1.2,
    },
  });
}

function shrubElement(id: string, x: number, y: number, width: number, height: number) {
  return pixelElement({
    id,
    x,
    y,
    width,
    height,
    sprite: ["...ddd...", "..ddddd..", ".dddmddd.", "dddmmmddd", "..diiid.."],
    symbols: [
      { symbol: "d", fill: "leafDark" },
      { symbol: "m", fill: "leafMid" },
      { symbol: "i", fill: "ink" },
    ],
  });
}

function lilyPadElement(id: string, x: number, y: number, size: number) {
  return pixelElement({
    id,
    x,
    y,
    width: size,
    height: size * 0.72,
    sprite: ["..lll..", ".lllll.", "lllllll", ".llill."],
    symbols: [
      { symbol: "l", fill: "leafLight" },
      { symbol: "i", fill: "ink" },
    ],
    motion: {
      preset: "float",
      amplitude: 0.7,
      speed: 0.9,
    },
  });
}

function hangingLeaves(id: string, x: number, y: number, width: number, height: number) {
  return pixelElement({
    id,
    x,
    y,
    width,
    height,
    alpha: 0.8,
    sprite: ["ddd..ddd..ddd", "dddd.ddd.dddd", ".ddd.ddd.ddd.", "..d...d...d..", "..d...d...d.."],
    symbols: [{ symbol: "d", fill: "leafDark" }],
    motion: {
      preset: "sway",
      amplitude: 1.4,
      speed: 0.8,
    },
  });
}

function sparkleElement(id: string, x: number, y: number, size: number) {
  return pixelElement({
    id,
    x,
    y,
    width: size,
    height: size,
    sprite: [".g.", "ggg", ".g."],
    symbols: [{ symbol: "g", fill: "glow" }],
    motion: {
      preset: "pulse",
      amplitude: 0.18,
      speed: 2.2,
    },
  });
}

function buildScene(phase: AdventurePhase): StoryScene {
  const palette = buildPalette(phase);
  const actorX =
    phase === "researching" ? 64 : phase === "returning" ? 50 : phase === "departing" ? 34 : 25;
  const actorY = phase === "researching" ? 70 : 76;
  const actorSize = phase === "researching" ? 18 : 26;
  const glowX = phase === "researching" ? 72 : phase === "returning" ? 74 : 77;
  const glowY = phase === "researching" ? 17 : phase === "delivered" ? 15 : 18;
  const moonAlpha = phase === "researching" ? 0.72 : phase === "delivered" ? 0.36 : 0.52;

  return {
    title:
      phase === "researching"
        ? "卡皮巴拉提着灯去夜里找线索"
        : phase === "returning"
          ? "卡皮巴拉踩着晨雾往回赶"
          : phase === "delivered"
            ? "今天的小信在水边亮起来了"
            : "卡皮巴拉的月光收信台",
    mood: phase === "researching" ? "curious" : phase === "returning" ? "excited" : "warm",
    palette,
    layers: [
      {
        id: `${phase}-sky`,
        depth: 0,
        parallax: 0.18,
        elements: [
          rectElement("sky-top", 0, 0, 100, 38, "skyTop"),
          rectElement("sky-mid", 0, 35, 100, 32, "skyMid"),
          rectElement("sky-bottom", 0, 62, 100, 38, "skyBottom"),
          ellipseElement("moon-halo", glowX - 4, glowY - 2, 16, 16, "mist", {
            alpha: 0.2,
          }),
          ellipseElement("moon-core", glowX, glowY, 8, 8, "glow", {
            alpha: moonAlpha,
            motion: {
              preset: "float",
              amplitude: 1.2,
              speed: 0.9,
            },
          }),
          ellipseElement("mist-left", 12, 16, 26, 10, "mist", {
            alpha: 0.15,
            motion: {
              preset: "drift-x",
              amplitude: 1.1,
              speed: 0.4,
            },
          }),
          ellipseElement("mist-right", 56, 12, 30, 11, "mist", {
            alpha: 0.14,
            motion: {
              preset: "drift-x",
              amplitude: 1.4,
              speed: 0.33,
            },
          }),
        ],
      },
      {
        id: `${phase}-distance`,
        depth: 1,
        parallax: 0.34,
        elements: [
          ellipseElement("tree-shadow-left", -2, 47, 32, 18, "leafDark", {
            alpha: 0.32,
          }),
          ellipseElement("tree-shadow-mid", 24, 45, 26, 16, "leafDark", {
            alpha: 0.26,
          }),
          ellipseElement("tree-shadow-right", 60, 46, 34, 18, "leafDark", {
            alpha: 0.34,
          }),
          ellipseElement("far-island", 18, 60, 26, 8, "shore", {
            alpha: 0.52,
          }),
          ellipseElement("far-island-right", 60, 61, 22, 8, "shoreLight", {
            alpha: 0.48,
          }),
        ],
      },
      {
        id: `${phase}-water`,
        depth: 2,
        parallax: 0.54,
        elements: [
          ellipseElement("water-body", 6, 68, 88, 22, "water"),
          ellipseElement("water-sheen", 14, 72, 62, 10, "waterLight", {
            alpha: 0.26,
          }),
          ellipseElement("ripple-left", 16, 76, 16, 2.8, "mist", {
            alpha: 0.18,
            motion: {
              preset: "drift-x",
              amplitude: 0.8,
              speed: 0.8,
            },
          }),
          ellipseElement("ripple-right", 58, 78, 12, 2.2, "mist", {
            alpha: 0.14,
            motion: {
              preset: "drift-x",
              amplitude: 0.7,
              speed: 0.9,
            },
          }),
        ],
      },
      {
        id: `${phase}-dock`,
        depth: 3,
        parallax: 0.78,
        elements: [
          ellipseElement("shore-left", 0, 73, 34, 21, "shore"),
          ellipseElement("shore-right", 60, 71, 42, 24, "shoreLight"),
          rectElement("dock-top", 18, 68, 31, 3, "wood", {
            cornerRadius: 2,
          }),
          rectElement("dock-front", 18, 71, 31, 4, "woodShadow", {
            cornerRadius: 1,
          }),
          rectElement("dock-post-left", 20, 72, 2, 11, "woodShadow"),
          rectElement("dock-post-mid", 31, 72, 2, 12, "woodShadow"),
          rectElement("dock-post-right", 43, 72, 2, 10, "woodShadow"),
          ellipseElement("actor-shadow-bank", actorX - 7, actorY + 2, 16, 4, "ink", {
            alpha: 0.12,
          }),
        ],
      },
      {
        id: `${phase}-props`,
        depth: 4,
        parallax: 0.96,
        elements: [
          mailboxElement(15, 54),
          lanternElement(28, 53),
          reedElement("reed-left", 6, 67, 10, 15),
          reedElement("reed-right", 78, 66, 10, 16),
          shrubElement("shrub-left", 10, 63, 11, 7),
          shrubElement("shrub-right", 68, 61, 12, 8),
          lilyPadElement("lily-1", 32, 79, 6),
          lilyPadElement("lily-2", 69, 81, 5),
          pixelElement({
            id: "paper-boat",
            x: 46,
            y: 77,
            width: 7,
            height: 4,
            sprite: ["...p...", "..ppp..", ".piiip."],
            symbols: [
              { symbol: "p", fill: "paper" },
              { symbol: "i", fill: "ink" },
            ],
            motion: {
              preset: "float",
              amplitude: 0.9,
              speed: 0.95,
            },
          }),
        ],
      },
      {
        id: `${phase}-foreground`,
        depth: 5,
        parallax: 1.22,
        opacity: 0.92,
        elements: [
          hangingLeaves("canopy-left", 0, 0, 18, 18),
          hangingLeaves("canopy-right", 78, 2, 18, 17),
          reedElement("front-reed-left", 2, 73, 9, 14),
          reedElement("front-reed-right", 86, 74, 8, 14),
        ],
      },
      {
        id: `${phase}-ambient`,
        depth: 6,
        parallax: 1.38,
        elements: [
          sparkleElement("sparkle-1", 22, 24, 3),
          sparkleElement("sparkle-2", 44, 18, 2.4),
          sparkleElement("sparkle-3", 74, 30, 2.8),
          sparkleElement("sparkle-4", 63, 52, 2.2),
          sparkleElement("sparkle-5", 36, 58, 1.8),
        ],
      },
    ],
    actors: [
      {
        id: "capybara-main",
        kind: "capybara",
        x: actorX,
        y: actorY,
        size: actorSize,
        facing: phase === "returning" ? "left" : phase === "researching" ? "back" : "right",
        motion: actorMotionForPhase(phase),
      },
    ],
    prompt:
      "lush pixel-art capybara mail dock by moonlit water, layered foliage, lantern glow, reflective pond, elegant storybook composition",
    motionCue:
      phase === "researching"
        ? "卡皮巴拉提灯走远，收信台只剩水光和灯影在轻轻晃。"
        : "水面、芦苇和灯光都在轻轻动，卡皮巴拉在收信台附近等你或准备把信送回来。",
  };
}

function cloneScene(scene: StoryScene): StoryScene {
  return typeof structuredClone === "function"
    ? structuredClone(scene)
    : (JSON.parse(JSON.stringify(scene)) as StoryScene);
}

function buildPreviewScene(params: {
  phase: AdventurePhase;
  baseScene?: StoryScene | null;
}): StoryScene {
  if (!params.baseScene) {
    return buildScene(params.phase);
  }

  const scene = cloneScene(params.baseScene);
  scene.title =
    params.phase === "researching"
      ? `${params.baseScene.title} · 卡皮巴拉正在外面找线索`
      : params.phase === "returning"
        ? `${params.baseScene.title} · 卡皮巴拉正带着答案回来`
        : params.phase === "departing"
          ? `${params.baseScene.title} · 卡皮巴拉准备出发`
          : params.phase === "wish-heard"
            ? `${params.baseScene.title} · 卡皮巴拉认真听见了`
            : params.phase === "delivered"
              ? params.baseScene.title
              : `${params.baseScene.title} · 今晚等你许愿`;
  scene.mood =
    params.phase === "researching"
      ? "curious"
      : params.phase === "returning"
        ? "excited"
        : params.phase === "idle"
          ? "warm"
          : scene.mood;
  scene.motionCue =
    params.phase === "researching"
      ? "卡皮巴拉已经转身去找线索了，眼前的世界还留着它刚刚经过的痕迹。"
      : params.phase === "returning"
        ? "卡皮巴拉正抱着找到的答案回来，场景里的风和光都变得更有期待感。"
        : params.phase === "departing"
          ? "卡皮巴拉正背起小包准备出发，场景里的细节也像在送它上路。"
          : params.phase === "wish-heard"
            ? "卡皮巴拉先停下来认真听你说的话，然后才会决定下一步。"
            : params.phase === "delivered"
              ? scene.motionCue
              : "卡皮巴拉在安静等你说出明天想听的主题。";
  scene.actors = scene.actors.map((actor) => {
    if (actor.kind !== "capybara") {
      return actor;
    }
    return {
      ...actor,
      x:
        params.phase === "departing"
          ? Math.min(actor.x + 7, 92)
          : params.phase === "returning"
            ? Math.max(actor.x - 5, 8)
            : actor.x,
      facing:
        params.phase === "researching"
          ? "back"
          : params.phase === "returning"
            ? "left"
            : actor.facing === "back"
              ? "right"
              : actor.facing,
      motion: actorMotionForPhase(params.phase),
    };
  });
  return scene;
}

export function getEnglishLevelOption(id: string): EnglishLevelOption {
  return (
    ENGLISH_LEVEL_OPTIONS.find((option) => option.id === id) ??
    ENGLISH_LEVEL_OPTIONS.find((option) => option.id === DEFAULT_ENGLISH_LEVEL_ID) ??
    ENGLISH_LEVEL_OPTIONS[0]
  );
}

export function buildEnglishLevelPayload(id: string): string {
  const option = getEnglishLevelOption(id);
  return `${option.label}（CEFR ${option.cefr}，${option.summary}）`;
}

export function buildAdventurePreview(params: {
  phase: AdventurePhase;
  baseScene?: StoryScene | null;
}): AdventurePreview {
  const scene = buildPreviewScene(params);

  switch (params.phase) {
    case "wish-heard":
      return {
        titleTag: "已听见愿望",
        statusLine: "卡皮巴拉已经认真听见你的愿望。",
        encounterLine: "现在它会先记下来，再准备出发。",
        scene,
      };
    case "departing":
      return {
        titleTag: "准备出发",
        statusLine: "卡皮巴拉正在背上小包。",
        encounterLine: "接下来它会去查真实资料。",
        scene,
      };
    case "researching":
      return {
        titleTag: "正在查找",
        statusLine: "卡皮巴拉已经出门查找真实线索。",
        encounterLine: "这一段等待态不再假装知道它会遇见什么主题世界。",
        scene,
      };
    case "returning":
      return {
        titleTag: "正在回来",
        statusLine: "卡皮巴拉已经带着结果在回来的路上。",
        encounterLine: "再等一下，我们就显示真实生成的内容。",
        scene,
      };
    case "delivered":
      return {
        titleTag: "已送达",
        statusLine: "今天的小信已经送到。",
        encounterLine: "",
        scene,
      };
    case "idle":
    default:
      return {
        titleTag: "夜间收信台",
        statusLine: "卡皮巴拉正在等你说出明天想听的主题。",
        encounterLine: "说完以后，它才会真正去查。",
        scene,
      };
  }
}

export function filterHomeShowcase(showcase: PixelDemo[]): PixelDemo[] {
  return showcase.filter((item) => item.id === "capybara");
}

export const IDLE_SCENE = buildAdventurePreview({
  phase: "idle",
}).scene;

export const IDLE_TIMELINE: StoryTimeline = {
  tonightQuestion: "明天你想让卡皮巴拉寄回什么主题的信？",
  capybaraPromise: "今晚它会带着你的愿望出发，把真实线索收进小信封里。",
  morningDelivery: "明天清晨，如果查找和生成都成功，它会把结果带回来。",
};

export const IDLE_LETTER: StoryLetter = {
  greeting: "亲爱的小探险家：",
  body: [
    "今晚先把你明天想听的主题交给卡皮巴拉。",
    "它会带着你的愿望出发，去寻找真实的线索和故事。",
  ],
  signoff: "在信箱边等你的卡皮巴拉",
  postscript: "P.S. 试试在下面的输入框里告诉我，你最想知道什么？",
};

export const IDLE_SHOWCASE: PixelDemo[] = [
  {
    id: "capybara",
    label: "卡皮巴拉",
    motion: "bob",
    caption: "主角像素形象，负责送信、讲故事和陪伴学习。",
    spritePrompt: "round capybara courier holding an envelope",
  },
  {
    id: "running-human",
    label: "跑步的人类",
    motion: "run",
    caption: "像素动作测试位，用于验证动态角色循环。",
    spritePrompt: "tiny playful human running in a side-view loop",
  },
];

export const SETTINGS_STORAGE_KEY = "edu-story-settings-v2";
export const SESSION_ID_STORAGE_KEY = "edu-story-session-id-v3";
export const SESSION_CACHE_STORAGE_KEY = "edu-story-session-cache-v3";
