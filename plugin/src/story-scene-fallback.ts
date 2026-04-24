import type {
  StoryMood,
  StoryScene,
  StorySceneActorFacing,
  StorySceneActorMotion,
} from "./shared/types.js";

function actorMotionForMood(mood: StoryMood): StorySceneActorMotion {
  switch (mood) {
    case "curious":
      return "listen";
    case "excited":
      return "bob";
    case "sleepy":
      return "drift";
    case "warm":
    default:
      return "still";
  }
}

function actorFacingForMood(mood: StoryMood): StorySceneActorFacing {
  switch (mood) {
    case "curious":
      return "left";
    case "excited":
      return "front";
    case "sleepy":
      return "right";
    case "warm":
    default:
      return "right";
  }
}

export function buildFallbackCapybaraScene(params: {
  title: string;
  mood: StoryMood;
  prompt: string;
  motionCue: string;
}): StoryScene {
  return {
    title: params.title,
    mood: params.mood,
    palette: [
      { id: "skyTop", value: "#b7d7f6" },
      { id: "skyMid", value: "#d9ebfb" },
      { id: "skyGlow", value: "#fff1a8" },
      { id: "hillFar", value: "#b6cea2" },
      { id: "hillNear", value: "#8fb076" },
      { id: "ground", value: "#88a765" },
      { id: "grassDark", value: "#5f7d43" },
      { id: "grassLight", value: "#a7ca73" },
      { id: "flower", value: "#f48b9b" },
      { id: "flowerLight", value: "#ffd9a6" },
      { id: "mailbox", value: "#8a633f" },
      { id: "mailFlag", value: "#d85e5e" },
    ],
    layers: [
      {
        id: "sky",
        depth: 0,
        parallax: 0.18,
        elements: [
          {
            id: "sky-top",
            kind: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 56,
            fill: "skyTop",
          },
          {
            id: "sky-bottom",
            kind: "rect",
            x: 0,
            y: 45,
            width: 100,
            height: 55,
            fill: "skyMid",
          },
          {
            id: "sun-glow",
            kind: "ellipse",
            x: 73,
            y: 16,
            width: 16,
            height: 16,
            fill: "skyGlow",
            alpha: 0.9,
            motion: { preset: "float", amplitude: 1.2, speed: 0.7 },
          },
        ],
      },
      {
        id: "hills",
        depth: 1,
        parallax: 0.34,
        elements: [
          {
            id: "hill-far-left",
            kind: "ellipse",
            x: 6,
            y: 54,
            width: 36,
            height: 18,
            fill: "hillFar",
          },
          {
            id: "hill-far-right",
            kind: "ellipse",
            x: 48,
            y: 52,
            width: 40,
            height: 20,
            fill: "hillFar",
          },
          {
            id: "hill-near",
            kind: "ellipse",
            x: 18,
            y: 60,
            width: 52,
            height: 22,
            fill: "hillNear",
          },
        ],
      },
      {
        id: "ground",
        depth: 2,
        parallax: 0.72,
        elements: [
          {
            id: "ground-strip",
            kind: "rect",
            x: 0,
            y: 72,
            width: 100,
            height: 28,
            fill: "ground",
          },
          {
            id: "mailbox-post",
            kind: "rect",
            x: 17,
            y: 60,
            width: 2.2,
            height: 16,
            fill: "mailbox",
          },
          {
            id: "mailbox-box",
            kind: "rect",
            x: 14,
            y: 56,
            width: 9,
            height: 7,
            fill: "mailbox",
            cornerRadius: 3,
          },
          {
            id: "mailbox-flag",
            kind: "rect",
            x: 22,
            y: 54,
            width: 1.5,
            height: 6,
            fill: "mailFlag",
            cornerRadius: 1,
          },
        ],
      },
      {
        id: "plants",
        depth: 3,
        parallax: 1.08,
        elements: [
          {
            id: "grass-clump-left",
            kind: "pixel-art",
            x: 5,
            y: 69,
            width: 12,
            height: 16,
            sprite: ["..g..g..", ".gggggg.", ".g.gggg.", "..g..g..", "..g..g.."],
            symbols: [{ symbol: "g", fill: "grassDark" }],
          },
          {
            id: "grass-clump-right",
            kind: "pixel-art",
            x: 82,
            y: 70,
            width: 11,
            height: 15,
            sprite: ["..g.g...", ".ggggg..", ".g.ggg..", "..g.g...", "..g.g..."],
            symbols: [{ symbol: "g", fill: "grassDark" }],
          },
          {
            id: "flowers-left",
            kind: "pixel-art",
            x: 24,
            y: 73,
            width: 10,
            height: 10,
            sprite: [".f...f.", "..f.f..", "...s...", "..s.s.."],
            symbols: [
              { symbol: "f", fill: "flower" },
              { symbol: "s", fill: "grassLight" },
            ],
            motion: { preset: "sway", amplitude: 0.9, speed: 0.9 },
          },
          {
            id: "flowers-right",
            kind: "pixel-art",
            x: 66,
            y: 74,
            width: 9,
            height: 9,
            sprite: [".f.f...", "..f....", "..s.s..", "...s..."],
            symbols: [
              { symbol: "f", fill: "flowerLight" },
              { symbol: "s", fill: "grassLight" },
            ],
            motion: { preset: "sway", amplitude: 0.8, speed: 1 },
          },
        ],
      },
    ],
    actors: [
      {
        id: "capybara-main",
        kind: "capybara",
        x: 50,
        y: 79,
        size: 28,
        facing: actorFacingForMood(params.mood),
        motion: actorMotionForMood(params.mood),
      },
    ],
    prompt: params.prompt,
    motionCue: params.motionCue,
  };
}

export function ensureRenderableScene(
  scene: StoryScene,
  overrides?: Partial<Pick<StoryScene, "title" | "mood" | "prompt" | "motionCue">>,
): StoryScene {
  if (scene.layers.length > 0) {
    return scene;
  }

  return buildFallbackCapybaraScene({
    title: overrides?.title ?? scene.title,
    mood: overrides?.mood ?? scene.mood,
    prompt: overrides?.prompt ?? scene.prompt,
    motionCue: overrides?.motionCue ?? scene.motionCue,
  });
}
