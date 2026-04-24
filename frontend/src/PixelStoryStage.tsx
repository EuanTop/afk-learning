import type {
  StoryScene,
  StorySceneActor,
  StorySceneActorMotion,
  StorySceneMotion,
  StoryScenePixelSymbol,
} from "@capybara-letter/shared";
import Phaser from "phaser";
import { useEffect, useRef } from "react";
import type { AdventurePhase } from "./story-presets";

type PixelStoryStageProps = {
  scene: StoryScene;
  className?: string;
  onCapybaraAnchorChange?: (anchor: { x: number; y: number }) => void;
  presentation?: {
    phase?: AdventurePhase;
  };
};

type AnimatedNode = {
  target: Phaser.GameObjects.Container;
  baseX: number;
  baseY: number;
  baseScaleX: number;
  baseScaleY: number;
  parallax: number;
  motion?: StorySceneMotion;
};

type AnimatedActor = {
  id: string;
  target: Phaser.GameObjects.Container;
  update: (elapsed: number) => void;
};

type PixelFrame = readonly string[];
type PixelAnimationFrames = readonly PixelFrame[];

const CANVAS_WIDTH = 1440;
const CANVAS_HEIGHT = 960;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const CAPYBARA_SYMBOLS: StoryScenePixelSymbol[] = [
  { symbol: "o", fill: "#324045" },
  { symbol: "b", fill: "#D2B38B" },
  { symbol: "c", fill: "#E9CBA4" },
  { symbol: "e", fill: "#F4D7B0" },
  { symbol: "i", fill: "#2B2118" },
];

const CAPYBARA_STILL_FRAMES = [
  [
    "................................",
    "................................",
    "................................",
    "......................oo........",
    "......................oeboooo...",
    "....ooooooooo.......ooobbbbboo..",
    "..oobbbbbbbbbooooooobbbbbbbbboo.",
    ".oobbbbbbbbbbbbbbbbbbbbbbbbbbbbo",
    "oobbbbbbbbbbbbbbbbbbbbbbbbiiiboo",
    "obbbbbbbbbbbbbbbbbbbbbbbbooooo..",
    "obbbbbbbbbbbbbbbbbbbbbbooo......",
    "obbbbbbbbbbbbbbbbbbbbbooo.......",
    "oobbbbbbbbbbbbbbbbbbbboo........",
    ".obbbbbbbbbbbbbboobbbboo........",
    ".obbbbboobbbbboobbbboo..........",
    "oobbbbo..oooooo..bbboo..........",
    "obbooo..........oobboo..........",
    "oboo............oobbo...........",
    "obbo............oobbo...........",
    "ooooo............oooo...........",
    "..oo............................",
  ],
  [
    "................................",
    "................................",
    "................................",
    "......................oo........",
    "......................oeboooo...",
    "....ooooooooo.......ooobbbbboo..",
    "..oobbbbbbbbbooooooobbbbbbbbboo.",
    ".oobbbbbbbbbbbbbbbbbbbbbbbbbbbbo",
    "oobbbbbbbbbbbbbbbbbbbbbbbbiiiboo",
    "obbbbbbbbbbbbbbbbbbbbbbbbooooo..",
    "obbbbbbbbbbbbbbbbbbbbbbooo......",
    "obbbbbbbbbbbbbbbbbbbbbooo.......",
    "oobbbbbbbbbbbbbbbbbbbboo........",
    ".obbbbbbbbbbbbbboobbbboo........",
    ".obbbbboobbbbboobbbboo..........",
    "oobbbboo..oooo..bbbboo..........",
    "obboo...........oobbboo.........",
    "obbo.............obbo...........",
    "ooboo............ooboo..........",
    ".oooo............oooo...........",
    "..oo............................",
  ],
] as const satisfies PixelAnimationFrames;

const CAPYBARA_LISTEN_FRAMES = [
  [
    "................................",
    "................................",
    ".......................oo.......",
    "......................ooeoooo...",
    ".....................oobbbbboo..",
    "....ooooooooo......ooobbbbbbboo.",
    "..oobbbbbbbbboooooobbbbbbbbbbbbo",
    ".oobbbbbbbbbbbbbbbbbbbbbbbbbbbbo",
    "oobbbbbbbbbbbbbbbbbbbbbbbbiiiboo",
    "obbbbbbbbbbbbbbbbbbbbbbbbooooo..",
    "obbbbbbbbbbbbbbbbbbbbbbooo......",
    "obbbbbbbbbbbbbbbbbbbbbooo.......",
    "oobbbbbbbbbbbbbbbbbbbboo........",
    ".obbbbbbbbbbbbbboobbbboo........",
    ".obbbbboobbbbboobbbboo..........",
    "oobbbbo..oooooo..bbboo..........",
    "obbooo..........oobboo..........",
    "oboo............oobbo...........",
    "obbo............oobbo...........",
    "ooooo............oooo...........",
    "..oo............................",
  ],
  [
    "................................",
    "................................",
    ".......................oo.......",
    "......................ooeoooo...",
    ".....................oobbbbboo..",
    "....ooooooooo......ooobbbbbbboo.",
    "..oobbbbbbbbboooooobbbbbbbbbbbbo",
    ".oobbbbbbbbbbbbbbbbbbbbbbbbbbbbo",
    "oobbbbbbbbbbbbbbbbbbbbbbbbiiiboo",
    "obbbbbbbbbbbbbbbbbbbbbbbbooooo..",
    "obbbbbbbbbbbbbbbbbbbbbbooo......",
    "obbbbbbbbbbbbbbbbbbbbbooo.......",
    "oobbbbbbbbbbbbbbbbbbbboo........",
    ".obbbbbbbbbbbbbboobbbboo........",
    ".obbbbboobbbbboobbbboo..........",
    "oobbbboo..oooo..bbbboo..........",
    "obboo...........oobbboo.........",
    "obbo.............obbo...........",
    "ooboo............ooboo..........",
    ".oooo............oooo...........",
    "..oo............................",
  ],
] as const satisfies PixelAnimationFrames;

const CAPYBARA_WALK_FRAMES = [
  [
    "................................",
    "................................",
    "................................",
    "......................oo........",
    "......................oeboooo...",
    "....ooooooooo.......ooobbbbboo..",
    "..oobbbbbbbbbooooooobbbbbbbbboo.",
    ".oobbbbbbbbbbbbbbbbbbbbbbbbbbbbo",
    "oobbbbbbbbbbbbbbbbbbbbbbbbiiiboo",
    "obbbbbbbbbbbbbbbbbbbbbbbbooooo..",
    "obbbbbbbbbbbbbbbbbbbbbbooo......",
    "obbbbbbbbbbbbbbbbbbbbbooo.......",
    "oobbbbbbbbbbbbbbbbbbbboo........",
    ".obbbbbbbbbbbbbboobbbboo........",
    ".obbbbboobbbbboobbbboo..........",
    "oobbbbo...ooooo...bbboo.........",
    "obbo............oobbboo.........",
    "obbo..............obboo.........",
    "ooboo.............oooboo........",
    ".oooo............oooo...........",
    "..oo............................",
  ],
  [
    "................................",
    "................................",
    "................................",
    "......................oo........",
    "......................oeboooo...",
    "....ooooooooo.......ooobbbbboo..",
    "..oobbbbbbbbbooooooobbbbbbbbboo.",
    ".oobbbbbbbbbbbbbbbbbbbbbbbbbbbbo",
    "oobbbbbbbbbbbbbbbbbbbbbbbbiiiboo",
    "obbbbbbbbbbbbbbbbbbbbbbbbooooo..",
    "obbbbbbbbbbbbbbbbbbbbbbooo......",
    "obbbbbbbbbbbbbbbbbbbbbooo.......",
    "oobbbbbbbbbbbbbbbbbbbboo........",
    ".obbbbbbbbbbbbbboobbbboo........",
    ".obbbbboobbbbboobbbboo..........",
    "oobbbboo..oooo..bbbboo..........",
    "obboo...........oobbboo.........",
    "obbo..............obbo..........",
    "oooboo...........ooboo..........",
    "..oooo...........oooo...........",
    "...oo...........................",
  ],
] as const satisfies PixelAnimationFrames;

const CAPYBARA_BACK_FRAMES = [
  [
    "................................",
    "................................",
    "............oooo................",
    ".........ooobbbboo..............",
    ".......ooobbbbbbbboo............",
    "......oobbbbbbbbbbbboo..........",
    ".....oobbbbbbbbbbbbbbbboo.......",
    ".....obbbbbbbbbbbbbbbbbbbbo.....",
    "....oobbbbbbbbbbbbbbbbbbbbbo....",
    "....oobbbbbbbbbbbbbbbbbbbbbo....",
    ".....obbbbbbbbbbbbbbbbbbbbbo....",
    ".....oobbbbbbbbbbbbbbbbbboo.....",
    "......oobbbboooooobbbbbooo......",
    "......oobbo......oobboo.........",
    "......oobbo......oobboo.........",
    "......oobbo......oobboo.........",
    "......oooo........oooo..........",
  ],
  [
    "................................",
    "................................",
    "............oooo................",
    ".........ooobbbboo..............",
    ".......ooobbbbbbbboo............",
    "......oobbbbbbbbbbbboo..........",
    ".....oobbbbbbbbbbbbbbbboo.......",
    ".....obbbbbbbbbbbbbbbbbbbbo.....",
    "....oobbbbbbbbbbbbbbbbbbbbbo....",
    "....oobbbbbbbbbbbbbbbbbbbbbo....",
    ".....obbbbbbbbbbbbbbbbbbbbbo....",
    ".....oobbbbbbbbbbbbbbbbbboo.....",
    "......oobbbboooooobbbbbooo......",
    "......oobbo......oobboo.........",
    "......oobbo......oobboo.........",
    ".......obbo......obboo..........",
    ".......oooo......oooo...........",
  ],
] as const satisfies PixelAnimationFrames;

function hexToNumber(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

function toStageX(percent: number): number {
  return (percent / 100) * CANVAS_WIDTH;
}

function toStageY(percent: number): number {
  return (percent / 100) * CANVAS_HEIGHT;
}

function toStageWidth(percent: number): number {
  return (percent / 100) * CANVAS_WIDTH;
}

function toStageHeight(percent: number): number {
  return (percent / 100) * CANVAS_HEIGHT;
}

function resolvePalette(scene: StoryScene): Map<string, string> {
  return new Map(scene.palette.map((entry) => [entry.id, entry.value]));
}

function resolveColor(ref: string, palette: Map<string, string>, fallback = "#000000"): number {
  const raw = HEX_COLOR_PATTERN.test(ref) ? ref : (palette.get(ref) ?? fallback);
  return hexToNumber(raw);
}

function reverseRows(rows: readonly string[]): string[] {
  return rows.map((row) => row.split("").toReversed().join(""));
}

function measureFrame(rows: readonly string[]) {
  return {
    width: Math.max(...rows.map((row) => row.length), 1),
    height: Math.max(rows.length, 1),
  };
}

function createPixelContainer(
  sceneRuntime: Phaser.Scene,
  rows: readonly string[],
  symbols: readonly StoryScenePixelSymbol[],
  width: number,
  height: number,
  palette: Map<string, string>,
): Phaser.GameObjects.Container {
  const container = sceneRuntime.add.container(0, 0);
  const symbolColors = new Map(
    symbols.map((entry) => [entry.symbol, resolveColor(entry.fill, palette, "#000000")]),
  );
  const columns = Math.max(...rows.map((row) => row.length), 1);
  const pixelSize = Math.min(width / columns, height / Math.max(rows.length, 1));
  const drawnWidth = columns * pixelSize;
  const drawnHeight = rows.length * pixelSize;
  const originX = (width - drawnWidth) / 2;
  const originY = (height - drawnHeight) / 2;

  rows.forEach((row, rowIndex) => {
    row.split("").forEach((cell, columnIndex) => {
      if (cell === "." || !symbolColors.has(cell)) {
        return;
      }

      const pixel = sceneRuntime.add
        .rectangle(
          originX + columnIndex * pixelSize,
          originY + rowIndex * pixelSize,
          pixelSize,
          pixelSize,
          symbolColors.get(cell) ?? 0x000000,
        )
        .setOrigin(0, 0);
      container.add(pixel);
    });
  });

  return container;
}

function applyMotion(node: AnimatedNode, elapsed: number) {
  const motion = node.motion;
  const driftX = Math.sin(elapsed / 46) * (node.parallax - 1) * 7;
  const driftY = Math.cos(elapsed / 64) * (node.parallax - 1) * 4;
  node.target.x = node.baseX;
  node.target.y = node.baseY;
  node.target.setScale(node.baseScaleX, node.baseScaleY);
  node.target.rotation = 0;

  if (!motion || motion.preset === "still") {
    node.target.x += driftX;
    node.target.y += driftY;
    return;
  }

  const speed = motion.speed ?? 1;
  const phase = elapsed / 18;
  const xAmplitude = toStageWidth((motion.amplitude ?? 1.2) * 0.25);
  const yAmplitude = toStageHeight((motion.amplitude ?? 1.2) * 0.35);

  switch (motion.preset) {
    case "float":
    case "bob":
      node.target.y = node.baseY + Math.sin(phase * speed) * yAmplitude;
      break;
    case "drift-x":
      node.target.x = node.baseX + Math.sin(phase * speed) * xAmplitude;
      break;
    case "drift-y":
      node.target.y = node.baseY + Math.sin(phase * speed) * yAmplitude;
      break;
    case "pulse": {
      const amount = motion.amplitude ?? 0.08;
      const scale = 1 + Math.sin(phase * speed) * amount;
      node.target.setScale(node.baseScaleX * scale, node.baseScaleY * scale);
      break;
    }
    case "sway":
      node.target.x = node.baseX + Math.sin(phase * speed) * xAmplitude;
      node.target.rotation = Math.sin(phase * speed) * 0.06;
      break;
  }

  node.target.x += driftX;
  node.target.y += driftY;
}

function drawSceneLayers(sceneRuntime: Phaser.Scene, sceneSpec: StoryScene) {
  const palette = resolvePalette(sceneSpec);
  const animatedNodes: AnimatedNode[] = [];

  for (const layer of [...sceneSpec.layers].toSorted((left, right) => left.depth - right.depth)) {
    const layerContainer = sceneRuntime.add.container(0, 0);
    layerContainer.alpha = layer.opacity ?? 1;

    for (const element of layer.elements) {
      const elementContainer = sceneRuntime.add.container(toStageX(element.x), toStageY(element.y));
      elementContainer.alpha = element.alpha ?? 1;
      layerContainer.add(elementContainer);

      if (element.kind === "rect") {
        const graphic = sceneRuntime.add.graphics();
        graphic.fillStyle(resolveColor(element.fill, palette, "#000000"), 1);
        if ((element.cornerRadius ?? 0) > 0) {
          graphic.fillRoundedRect(
            0,
            0,
            toStageWidth(element.width),
            toStageHeight(element.height),
            element.cornerRadius ?? 0,
          );
        } else {
          graphic.fillRect(0, 0, toStageWidth(element.width), toStageHeight(element.height));
        }
        elementContainer.add(graphic);
      } else if (element.kind === "ellipse") {
        const ellipse = sceneRuntime.add.ellipse(
          toStageWidth(element.width) / 2,
          toStageHeight(element.height) / 2,
          toStageWidth(element.width),
          toStageHeight(element.height),
          resolveColor(element.fill, palette, "#000000"),
          1,
        );
        elementContainer.add(ellipse);
      } else {
        elementContainer.add(
          createPixelContainer(
            sceneRuntime,
            element.sprite,
            element.symbols,
            toStageWidth(element.width),
            toStageHeight(element.height),
            palette,
          ),
        );
      }

      animatedNodes.push({
        target: elementContainer,
        baseX: elementContainer.x,
        baseY: elementContainer.y,
        baseScaleX: 1,
        baseScaleY: 1,
        parallax: layer.parallax ?? 1,
        motion: element.motion,
      });
    }
  }

  return animatedNodes;
}

function motionForPhase(phase?: AdventurePhase): StorySceneActorMotion | undefined {
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
      return undefined;
  }
}

function capybaraFramesForMotion(motion: StorySceneActorMotion): PixelAnimationFrames {
  switch (motion) {
    case "listen":
      return CAPYBARA_LISTEN_FRAMES;
    case "depart":
    case "return":
      return CAPYBARA_WALK_FRAMES;
    case "search":
      return CAPYBARA_BACK_FRAMES;
    case "deliver":
      return CAPYBARA_LISTEN_FRAMES;
    case "bob":
    case "drift":
    case "still":
    default:
      return CAPYBARA_STILL_FRAMES;
  }
}

function capybaraAccessoryRows(motion: StorySceneActorMotion) {
  if (motion === "depart" || motion === "return" || motion === "search") {
    return {
      rows: [".mmm.", "mwwwm", ".mmm."],
      symbols: [
        { symbol: "m", fill: "#E4A355" },
        { symbol: "w", fill: "#8D6741" },
      ] satisfies StoryScenePixelSymbol[],
      offsetX: -8,
      offsetY: -34,
    };
  }

  if (motion === "listen" || motion === "deliver" || motion === "still" || motion === "bob") {
    return {
      rows: [".ppp.", "pmmmp", ".ppp."],
      symbols: [
        { symbol: "p", fill: "#FFF4DF" },
        { symbol: "m", fill: "#E4A355" },
      ] satisfies StoryScenePixelSymbol[],
      offsetX: 48,
      offsetY: -32,
    };
  }

  return null;
}

function createFramedActor(params: {
  sceneRuntime: Phaser.Scene;
  actor: StorySceneActor;
  frames: PixelAnimationFrames;
  symbols: readonly StoryScenePixelSymbol[];
  palette: Map<string, string>;
  baseMotion: StorySceneActorMotion;
}): AnimatedActor {
  const wrapper = params.sceneRuntime.add.container(0, 0);
  const spriteHost = params.sceneRuntime.add.container(0, 0);
  wrapper.add(spriteHost);
  wrapper.alpha = params.actor.alpha ?? 1;

  const width = toStageWidth(params.actor.size);
  const baseX = toStageX(params.actor.x);
  const baseY = toStageY(params.actor.y);
  let frameIndex = -1;
  let lastFacing = "";

  const paintFrame = (rows: readonly string[], facing: StorySceneActor["facing"]) => {
    spriteHost.removeAll(true);
    const orientedRows = facing === "left" ? reverseRows(rows) : [...rows];
    const columns = Math.max(...orientedRows.map((row) => row.length), 1);
    const height = width * (orientedRows.length / columns);
    const sprite = createPixelContainer(
      params.sceneRuntime,
      orientedRows,
      params.symbols,
      width,
      height,
      params.palette,
    );
    sprite.x = -width / 2;
    sprite.y = -height;
    spriteHost.add(sprite);
  };

  const update = (elapsed: number) => {
    const isWalking = params.baseMotion === "depart" || params.baseMotion === "return";
    const nextFrameIndex =
      params.frames.length > 1 && isWalking ? Math.floor(elapsed / 7) % params.frames.length : 0;

    if (nextFrameIndex !== frameIndex || lastFacing !== params.actor.facing) {
      frameIndex = nextFrameIndex;
      lastFacing = params.actor.facing;
      paintFrame(params.frames[nextFrameIndex] ?? params.frames[0] ?? [], params.actor.facing);
    }

    wrapper.x = baseX;
    wrapper.y = baseY;
    wrapper.rotation = 0;
    wrapper.setScale(1, 1);

    if (
      params.baseMotion === "bob" ||
      params.baseMotion === "listen" ||
      params.baseMotion === "deliver" ||
      params.baseMotion === "still"
    ) {
      wrapper.y = baseY + Math.sin(elapsed / 16) * 6;
    }

    if (params.baseMotion === "drift") {
      wrapper.x = baseX + Math.sin(elapsed / 22) * 12;
      wrapper.y = baseY + Math.sin(elapsed / 18) * 6;
    }

    if (params.baseMotion === "search") {
      wrapper.y = baseY + Math.sin(elapsed / 20) * 4;
    }

    if (params.baseMotion === "depart" || params.baseMotion === "return") {
      wrapper.y = baseY + Math.sin(elapsed / 10) * 8;
    }
  };

  return {
    id: params.actor.id,
    target: wrapper,
    update,
  };
}

function createCapybaraActor(params: {
  sceneRuntime: Phaser.Scene;
  actor: StorySceneActor;
  palette: Map<string, string>;
  baseMotion: StorySceneActorMotion;
}): AnimatedActor {
  const wrapper = params.sceneRuntime.add.container(0, 0);
  const shadow = params.sceneRuntime.add.ellipse(
    0,
    0,
    toStageWidth(params.actor.size * 0.54),
    22,
    0x172328,
    0.14,
  );
  const spriteHost = params.sceneRuntime.add.container(0, 0);
  const accessoryHost = params.sceneRuntime.add.container(0, 0);
  wrapper.add([shadow, spriteHost, accessoryHost]);
  wrapper.alpha = params.actor.alpha ?? 1;

  const frames = capybaraFramesForMotion(params.baseMotion);
  const width = toStageWidth(params.actor.size);
  const baseX = toStageX(params.actor.x);
  const baseY = toStageY(params.actor.y);
  let frameIndex = -1;
  let lastFacing = "";
  let lastMotion = "";

  const paintFrame = (rows: readonly string[], facing: StorySceneActor["facing"]) => {
    spriteHost.removeAll(true);
    const orientedRows = facing === "left" ? reverseRows(rows) : [...rows];
    const columns = Math.max(...orientedRows.map((row) => row.length), 1);
    const height = width * (orientedRows.length / columns);
    const sprite = createPixelContainer(
      params.sceneRuntime,
      orientedRows,
      CAPYBARA_SYMBOLS,
      width,
      height,
      params.palette,
    );
    sprite.x = -width / 2;
    sprite.y = -height;
    spriteHost.add(sprite);
  };

  const paintAccessory = (facing: StorySceneActor["facing"], motion: StorySceneActorMotion) => {
    accessoryHost.removeAll(true);
    const accessory = capybaraAccessoryRows(motion);
    if (!accessory) {
      return;
    }
    const orientedRows = facing === "left" ? reverseRows(accessory.rows) : accessory.rows;
    const sprite = createPixelContainer(
      params.sceneRuntime,
      orientedRows,
      accessory.symbols,
      32,
      22,
      params.palette,
    );
    const direction = facing === "left" ? -1 : 1;
    sprite.x = accessory.offsetX * direction;
    sprite.y = accessory.offsetY;
    accessoryHost.add(sprite);
  };

  const update = (elapsed: number) => {
    const isWalking = params.baseMotion === "depart" || params.baseMotion === "return";
    const nextFrameIndex =
      frames.length > 1 && isWalking
        ? Math.floor(elapsed / 7) % frames.length
        : Math.floor(elapsed / 16) % frames.length;
    const facingChanged = lastFacing !== params.actor.facing;
    const motionChanged = lastMotion !== params.baseMotion;

    if (nextFrameIndex !== frameIndex || facingChanged) {
      frameIndex = nextFrameIndex;
      lastFacing = params.actor.facing;
      paintFrame(frames[nextFrameIndex] ?? frames[0] ?? [], params.actor.facing);
    }

    if (motionChanged || facingChanged) {
      lastMotion = params.baseMotion;
      paintAccessory(params.actor.facing, params.baseMotion);
    }

    wrapper.x = baseX;
    wrapper.y = baseY;
    wrapper.rotation = 0;
    wrapper.setScale(1, 1);
    shadow.width = toStageWidth(params.actor.size * 0.54);
    shadow.x = 0;
    shadow.y = 10;
    shadow.scaleX = 1;
    shadow.scaleY = 1;

    const breathe = Math.sin(elapsed / 18) * 5;
    const sway = Math.sin(elapsed / 26) * 0.02;

    if (
      params.baseMotion === "bob" ||
      params.baseMotion === "listen" ||
      params.baseMotion === "deliver" ||
      params.baseMotion === "still"
    ) {
      wrapper.y = baseY + breathe;
      wrapper.rotation = sway;
    }

    if (params.baseMotion === "search") {
      wrapper.y = baseY + Math.sin(elapsed / 22) * 3;
      accessoryHost.y = Math.sin(elapsed / 14) * 2;
    } else if (params.baseMotion === "depart" || params.baseMotion === "return") {
      wrapper.y = baseY + Math.sin(elapsed / 9) * 7;
      shadow.scaleX = 0.92 + Math.sin(elapsed / 9) * 0.04;
      accessoryHost.y = -2 + Math.sin(elapsed / 8) * 2;
    } else {
      accessoryHost.y = Math.sin(elapsed / 18) * 1.5;
    }
  };

  return {
    id: params.actor.id,
    target: wrapper,
    update,
  };
}

function createActor(
  sceneRuntime: Phaser.Scene,
  sceneSpec: StoryScene,
  actor: StorySceneActor,
  phase?: AdventurePhase,
) {
  const palette = resolvePalette(sceneSpec);
  const effectiveMotion = motionForPhase(phase) ?? actor.motion;

  if (actor.kind === "pixel-art") {
    return createFramedActor({
      sceneRuntime,
      actor,
      frames: [actor.sprite ?? []] as PixelAnimationFrames,
      symbols: actor.symbols ?? [],
      palette,
      baseMotion: effectiveMotion,
    });
  }

  return createCapybaraActor({
    sceneRuntime,
    actor,
    palette,
    baseMotion: effectiveMotion,
  });
}

export function PixelStoryStage({
  scene,
  className = "h-full w-full",
  onCapybaraAnchorChange,
  presentation,
}: PixelStoryStageProps) {
  const debugBubble = import.meta.env.DEV;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const anchorCallbackRef = useRef(onCapybaraAnchorChange);
  const presentationPhase = presentation?.phase;
  const sceneKey = JSON.stringify(scene);

  useEffect(() => {
    anchorCallbackRef.current = onCapybaraAnchorChange;
  }, [onCapybaraAnchorChange]);

  useEffect(() => {
    if (!hostRef.current) {
      return undefined;
    }

    hostRef.current.replaceChildren();
    let lastAnchorDebugAt = 0;

    class StoryStageScene extends Phaser.Scene {
      private animatedNodes: AnimatedNode[] = [];
      private animatedActors: AnimatedActor[] = [];
      private lastAnchorEmitAt = 0;
      private lastAnchor: { x: number; y: number } | null = null;

      constructor() {
        super("capybara-story-stage");
      }

      create() {
        const palette = resolvePalette(scene);
        this.cameras.main.setBackgroundColor(
          resolveColor(scene.palette[0]?.value ?? "#E8F0FF", palette, "#E8F0FF"),
        );
        this.cameras.main.setZoom(1.03);
        this.cameras.main.centerOn(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        this.animatedNodes = drawSceneLayers(this, scene);
        this.animatedActors = scene.actors.map((actor) =>
          createActor(this, scene, actor, presentationPhase),
        );
      }

      update(time: number) {
        const elapsed = time / 16.6667;
        this.animatedNodes.forEach((node) => applyMotion(node, elapsed));
        this.animatedActors.forEach((actor) => actor.update(elapsed));
        this.cameras.main.scrollX = Math.sin(elapsed / 84) * 10;
        this.cameras.main.scrollY = Math.cos(elapsed / 110) * 6;

        const reportAnchor = anchorCallbackRef.current;
        if (!reportAnchor) {
          return;
        }

        const capybara = this.animatedActors.find((actor) => actor.id === "capybara-main");
        const capybaraSpec = scene.actors.find((actor) => actor.id === "capybara-main");
        if (!capybara || !capybaraSpec || !hostRef.current) {
          return;
        }

        const now = performance.now();
        if (now - this.lastAnchorEmitAt < 32) {
          return;
        }

        const camera = this.cameras.main;
        const view = camera.worldView;
        const hostWidth = hostRef.current.clientWidth;
        const hostHeight = hostRef.current.clientHeight;
        const effectiveMotion = motionForPhase(presentationPhase) ?? capybaraSpec.motion;
        const anchorFrame = capybaraFramesForMotion(effectiveMotion)[0] ?? CAPYBARA_STILL_FRAMES[0];
        const frameBounds = measureFrame(anchorFrame);
        const actorWidth = toStageWidth(capybaraSpec.size);
        const actorHeight = actorWidth * (frameBounds.height / frameBounds.width);
        const facingOffset =
          capybaraSpec.facing === "left"
            ? -actorWidth * 0.12
            : capybaraSpec.facing === "right"
              ? actorWidth * 0.12
              : 0;
        const anchor = {
          x: ((capybara.target.x + facingOffset - view.x) / view.width) * hostWidth,
          y: ((capybara.target.y - actorHeight - 24 - view.y) / view.height) * hostHeight,
        };

        const movedEnough =
          !this.lastAnchor ||
          Math.abs(anchor.x - this.lastAnchor.x) > 0.75 ||
          Math.abs(anchor.y - this.lastAnchor.y) > 0.75;
        if (!movedEnough) {
          return;
        }

        this.lastAnchor = anchor;
        this.lastAnchorEmitAt = now;
        if (debugBubble && now - lastAnchorDebugAt >= 250) {
          lastAnchorDebugAt = now;
          console.debug("[PixelStoryStage] anchor-report", {
            title: scene.title,
            phase: presentationPhase ?? "idle",
            anchor,
            targetX: capybara.target.x,
            targetY: capybara.target.y,
            hostWidth,
            hostHeight,
            actorWidth,
            actorHeight,
            viewX: view.x,
            viewY: view.y,
            viewWidth: view.width,
            viewHeight: view.height,
            facing: capybaraSpec.facing,
            facingOffset,
          });
        }
        reportAnchor(anchor);
      }
    }

    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: hostRef.current,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: scene.palette[0]?.value ?? "#E8F0FF",
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      scene: [StoryStageScene],
      scale: {
        mode: Phaser.Scale.NONE,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
      },
      fps: {
        target: 60,
        smoothStep: false,
      },
      render: {
        pixelArt: true,
        antialias: false,
        roundPixels: true,
      },
      audio: {
        noAudio: true,
      },
    });

    const canvas = hostRef.current.querySelector("canvas");
    if (canvas instanceof HTMLCanvasElement) {
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.imageRendering = "pixelated";
      canvas.style.display = "block";
    }

    return () => {
      game.destroy(true);
    };
  }, [debugBubble, presentationPhase, sceneKey]);

  return <div ref={hostRef} className={`overflow-hidden rounded-[2rem] ${className}`} />;
}
