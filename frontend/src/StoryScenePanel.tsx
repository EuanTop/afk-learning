import type { StoryScene } from "@capybara-letter/shared";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { PixelStoryStage } from "./PixelStoryStage";

type StoryScenePanelProps = {
  scene: StoryScene;
  bubble?: ReactNode;
  bubbleMode?: "compact" | "letter";
  className?: string;
  presentation?: {
    phase?: "idle" | "wish-heard" | "departing" | "researching" | "returning" | "delivered";
  };
};

type Point = {
  x: number;
  y: number;
};

type Size = {
  width: number;
  height: number;
};

function paletteValue(scene: StoryScene, id: string, fallback: string) {
  return scene.palette.find((entry) => entry.id === id)?.value ?? fallback;
}

function measureElement(node: HTMLElement | null): Size {
  if (!node) {
    return { width: 0, height: 0 };
  }
  return {
    width: node.offsetWidth,
    height: node.offsetHeight,
  };
}

export function StoryScenePanel({
  scene,
  bubble,
  bubbleMode = "compact",
  className,
  presentation,
}: StoryScenePanelProps) {
  const debugBubble = import.meta.env.DEV;
  const sectionRef = useRef<HTMLElement | null>(null);
  const bubbleHostRef = useRef<HTMLDivElement | null>(null);
  const lastAnchorDebugAtRef = useRef(0);
  const lastLayoutDebugAtRef = useRef(0);
  const capybaraActor = scene.actors.find((actor) => actor.kind === "capybara");

  const [bubbleAnchor, setBubbleAnchor] = useState<Point>({ x: 380, y: 360 });
  const [sectionSize, setSectionSize] = useState<Size>({ width: 0, height: 0 });
  const [bubbleSize, setBubbleSize] = useState<Size>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    setBubbleAnchor({ x: 380, y: 360 });
  }, [bubbleMode, scene.title]);

  const handleAnchorChange = useCallback(
    (anchor: Point) => {
      setBubbleAnchor(anchor);

      if (debugBubble) {
        const now = performance.now();
        if (now - lastAnchorDebugAtRef.current >= 250) {
          lastAnchorDebugAtRef.current = now;
          console.debug("[StoryScenePanel] anchor-update", {
            title: scene.title,
            bubbleMode,
            facing: capybaraActor?.facing ?? "right",
            anchor,
          });
        }
      }
    },
    [bubbleMode, capybaraActor?.facing, debugBubble, scene.title],
  );

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const bubbleHost = bubbleHostRef.current;
    if (!section || !bubbleHost || typeof ResizeObserver === "undefined") {
      setSectionSize(measureElement(section));
      setBubbleSize(measureElement(bubbleHost));
      return undefined;
    }

    const updateMeasurements = () => {
      setSectionSize(measureElement(section));
      setBubbleSize(measureElement(bubbleHost));
    };

    updateMeasurements();
    const observer = new ResizeObserver(() => {
      updateMeasurements();
    });
    observer.observe(section);
    observer.observe(bubbleHost);
    return () => {
      observer.disconnect();
    };
  }, [bubble, bubbleMode, scene.title]);

  const bubbleLayout = useMemo(() => {
    const safePadding = 18;
    const topPadding = bubbleMode === "letter" ? 26 : 18;
    const pointerOffset = 20;
    const verticalGap = bubbleMode === "letter" ? 20 : 16;
    const facing = capybaraActor?.facing ?? "right";
    const sectionWidth = sectionSize.width;
    const sectionHeight = sectionSize.height;
    const bubbleWidth = bubbleSize.width;
    const bubbleHeight = bubbleSize.height;

    const desiredLeft =
      facing === "left"
        ? bubbleAnchor.x + pointerOffset
        : facing === "back" || facing === "front"
          ? bubbleAnchor.x - bubbleWidth / 2
          : bubbleAnchor.x - bubbleWidth - pointerOffset;
    const desiredTop = bubbleAnchor.y - bubbleHeight - verticalGap;

    const minLeft = safePadding;
    const maxLeft = Math.max(safePadding, sectionWidth - bubbleWidth - safePadding);
    const minTop = topPadding;
    const maxTop = Math.max(topPadding, sectionHeight - bubbleHeight - safePadding);
    const left = Math.min(Math.max(desiredLeft, minLeft), maxLeft);
    const top = Math.min(Math.max(desiredTop, minTop), maxTop);
    const pointerX = Math.min(
      Math.max(bubbleAnchor.x - left, 28),
      Math.max(28, bubbleWidth - 28),
    );

    return {
      facing,
      left,
      top,
      pointerX,
      desiredLeft,
      desiredTop,
    };
  }, [bubbleAnchor.x, bubbleAnchor.y, bubbleMode, bubbleSize.height, bubbleSize.width, capybaraActor?.facing, sectionSize.height, sectionSize.width]);

  useEffect(() => {
    if (!debugBubble) {
      return;
    }

    const now = performance.now();
    if (now - lastLayoutDebugAtRef.current < 250) {
      return;
    }
    lastLayoutDebugAtRef.current = now;
    console.debug("[StoryScenePanel] bubble-layout", {
      title: scene.title,
      bubbleMode,
      facing: bubbleLayout.facing,
      anchor: bubbleAnchor,
      sectionWidth: sectionSize.width,
      sectionHeight: sectionSize.height,
      bubbleWidth: bubbleSize.width,
      bubbleHeight: bubbleSize.height,
      desiredLeft: bubbleLayout.desiredLeft,
      desiredTop: bubbleLayout.desiredTop,
      left: bubbleLayout.left,
      top: bubbleLayout.top,
      pointerX: bubbleLayout.pointerX,
    });
  }, [
    bubbleAnchor,
    bubbleLayout,
    bubbleMode,
    bubbleSize.height,
    bubbleSize.width,
    debugBubble,
    scene.title,
    sectionSize.height,
    sectionSize.width,
  ]);

  const skyGlow = paletteValue(scene, "glow", paletteValue(scene, "mist", "#f6edd6"));
  const bubbleClassName =
    bubbleMode === "letter"
      ? "absolute z-30 w-[min(92vw,30rem)] sm:w-[min(34rem,42vw)]"
      : "absolute z-30 w-[min(86vw,22rem)] sm:w-[min(24rem,30vw)]";
  const bubbleStyle: CSSProperties & Partial<Record<"--bubble-tail-x", string>> = {
    left: `${bubbleLayout.left}px`,
    top: `${bubbleLayout.top}px`,
    transition: "left 120ms linear, top 120ms linear",
    willChange: "left, top",
    ["--bubble-tail-x"]: `${bubbleLayout.pointerX}px`,
  };

  return (
    <section ref={sectionRef} className={["relative overflow-hidden", className ?? ""].join(" ")}>
      <PixelStoryStage
        className="h-full w-full"
        onCapybaraAnchorChange={handleAnchorChange}
        presentation={presentation}
        scene={scene}
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0.04)_32%,transparent_58%)]" />
      <div
        className="pointer-events-none absolute -left-12 top-10 h-44 w-44 rounded-full blur-3xl"
        style={{ backgroundColor: `${skyGlow}55` }}
      />
      <div
        className="pointer-events-none absolute -right-16 top-8 h-56 w-56 rounded-full blur-3xl"
        style={{ backgroundColor: `${skyGlow}44` }}
      />

      {bubble ? (
        <div ref={bubbleHostRef} className={bubbleClassName} style={bubbleStyle}>
          {bubble}
        </div>
      ) : null}
    </section>
  );
}
