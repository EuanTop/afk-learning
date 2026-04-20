import { useMemo, useState } from "react";
import type { GlobeLessonResponse, RegionData, SceneNode } from "../shared/types";
import { GlobeView } from "./GlobeView";

function LeafGlyph() {
  return (
    <svg viewBox="0 0 160 160" className="h-36 w-36 drop-shadow-[0_24px_40px_rgba(34,197,94,0.35)]">
      <defs>
        <linearGradient id="leaf-fill" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#86efac" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
      </defs>
      <path
        d="M76 20C42 26 18 58 22 92c4 32 30 48 52 48 40 0 62-38 62-76 0-23-10-36-22-44-10 12-22 18-38 24Z"
        fill="url(#leaf-fill)"
      />
      <path d="M48 112c18-24 34-44 60-72" stroke="#14532d" strokeLinecap="round" strokeWidth="6" />
      <path d="M72 78c-10-5-18-8-28-10" stroke="#166534" strokeLinecap="round" strokeWidth="4" />
      <path d="M88 60c10-4 18-8 28-14" stroke="#166534" strokeLinecap="round" strokeWidth="4" />
    </svg>
  );
}

function FeedbackBanner({
  tone,
  message
}: {
  tone: "success" | "hint";
  message: string;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm shadow-lg ${
        tone === "success"
          ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-50"
          : "border-amber-300/30 bg-amber-300/10 text-amber-50"
      }`}
    >
      {message}
    </div>
  );
}

function RegionCard({ region }: { region: RegionData }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-slate-100 shadow-xl">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: region.color }} />
        <h4 className="font-semibold">{region.name}</h4>
      </div>
      <div className="space-y-2 text-sm text-slate-300">
        <div>气候线索：{region.climateCue}</div>
        <div>生态类型：{region.biome}</div>
        <div>
          植物记录：
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-400"
              style={{ width: `${Math.round(region.densityScore * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function GlobeExperience({ lesson }: { lesson: GlobeLessonResponse }) {
  const sceneMap = useMemo(
    () => new Map(lesson.sceneGraph.scenes.map((scene) => [scene.id, scene])),
    [lesson.sceneGraph.scenes]
  );
  const regionsById = useMemo(
    () => new Map(lesson.research.regions.map((region) => [region.id, region])),
    [lesson.research.regions]
  );

  const [sceneId, setSceneId] = useState("intro");
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "hint"; message: string } | null>(null);

  const currentScene = sceneMap.get(sceneId) ?? lesson.sceneGraph.scenes[0];
  const richestRegion = [...lesson.research.regions].toSorted((a, b) => b.densityScore - a.densityScore)[0];
  const driestRegion = [...lesson.research.regions].toSorted((a, b) => a.densityScore - b.densityScore)[0];

  const advance = () => {
    if (currentScene.nextSceneId) {
      setSceneId(currentScene.nextSceneId);
      setFeedback(null);
      return;
    }

    if (sceneId !== "complete") {
      setSceneId("complete");
      setFeedback(null);
    }
  };

  const handleRegionSelect = (regionId: string) => {
    setSelectedRegionId(regionId);
    if (currentScene.kind !== "globe_select") {
      return;
    }

    if (regionId === currentScene.expectedRegionId) {
      setFeedback({
        tone: "success",
        message: currentScene.successZh ?? "对啦，你找到了植物更多的区域。"
      });
      return;
    }

    setFeedback({
      tone: "hint",
      message: currentScene.hintZh ?? "再看看哪一块更绿一点。"
    });
  };

  const handleOptionSelect = (optionId: string) => {
    const option = currentScene.options?.find((item) => item.id === optionId);
    if (!option) {
      return;
    }

    setFeedback({
      tone: option.correct ? "success" : "hint",
      message: option.correct
        ? currentScene.successZh ?? "答对了。"
        : currentScene.hintZh ?? "再试一次，先看看更绿、雨更多的地方。"
    });
  };

  const renderSceneActions = (scene: SceneNode) => {
    switch (scene.kind) {
      case "intro":
        return (
          <button
            className="inline-flex items-center rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
            onClick={advance}
          >
            开始看地球
          </button>
        );
      case "globe_select":
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">点一下地球上的高亮区域，猜猜哪里植物更多。</p>
            {feedback?.tone === "success" ? (
              <button
                className="inline-flex items-center rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
                onClick={advance}
              >
                继续比较
              </button>
            ) : null}
          </div>
        );
      case "compare_cards":
        return (
          <div className="grid gap-3 md:grid-cols-2">
            {[richestRegion, driestRegion].map((region) => (
              <button
                key={region.id}
                className="text-left transition hover:-translate-y-0.5"
                onClick={() => handleOptionSelect(region.id)}
              >
                <RegionCard region={region} />
              </button>
            ))}
            {feedback?.tone === "success" ? (
              <div className="md:col-span-2">
                <button
                  className="inline-flex items-center rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
                  onClick={advance}
                >
                  看看 leaf
                </button>
              </div>
            ) : null}
          </div>
        );
      case "micro_evidence":
        return (
          <div className="space-y-4">
            <button
              className="group flex w-full flex-col items-center rounded-[2rem] border border-emerald-300/20 bg-emerald-300/10 px-4 py-6 transition hover:border-emerald-300/50 hover:bg-emerald-300/15"
              onClick={() => handleOptionSelect("leaf")}
            >
              <LeafGlyph />
              <span className="mt-2 text-base font-semibold text-emerald-50">点一下这片 leaf</span>
            </button>
            {feedback?.tone === "success" ? (
              <button
                className="inline-flex items-center rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
                onClick={advance}
              >
                做个总结
              </button>
            ) : null}
          </div>
        );
      case "recap":
        return (
          <div className="space-y-3">
            <div className="grid gap-3">
              {scene.options?.map((option) => (
                <button
                  key={option.id}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-slate-100 transition hover:border-emerald-300/40 hover:bg-white/10"
                  onClick={() => handleOptionSelect(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {feedback?.tone === "success" ? (
              <button
                className="inline-flex items-center rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
                onClick={advance}
              >
                完成学习
              </button>
            ) : null}
          </div>
        );
      case "complete":
        return (
          <div className="rounded-[2rem] border border-emerald-300/20 bg-emerald-300/10 p-5 text-emerald-50">
            <div className="mb-2 text-sm uppercase tracking-[0.2em] text-emerald-200">Badge unlocked</div>
            <div className="text-lg font-semibold">地球小观察家</div>
          </div>
        );
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
      <div className="space-y-4">
        <GlobeView
          regions={lesson.research.regions}
          activeRegionIds={lesson.sceneGraph.activeRegionIds}
          selectedRegionId={selectedRegionId}
          onSelectRegion={handleRegionSelect}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {lesson.research.regions.map((region) => (
            <button
              key={region.id}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                selectedRegionId === region.id
                  ? "border-emerald-300/60 bg-emerald-300/12"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
              onClick={() => handleRegionSelect(region.id)}
            >
              <div className="text-sm font-semibold text-white">{region.name}</div>
              <div className="mt-1 text-xs text-slate-300">{region.biome}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">OpenClaw MVP</div>
              <h2 className="mt-1 text-2xl font-semibold text-white">{lesson.title}</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {lesson.learnerProfile.ageYears} 岁 / {lesson.learnerProfile.englishLevel}
            </div>
          </div>
          <p className="mb-4 text-sm leading-6 text-slate-300">{lesson.subtitle}</p>
          <div className="mb-5 flex items-center gap-2 text-xs text-slate-400">
            <span>
              场景 {lesson.sceneGraph.scenes.findIndex((scene) => scene.id === sceneId) + 1} /{" "}
              {lesson.sceneGraph.scenes.length}
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-600" />
            <span>{lesson.intent.domain}</span>
          </div>
          <div className="mb-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
            <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-400">当前问题</div>
            <p className="text-base leading-7 text-white">{currentScene.promptZh}</p>
          </div>
          {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
          <div className="mt-4">{renderSceneActions(currentScene)}</div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5 text-sm text-slate-300 shadow-xl">
          <div className="mb-3 text-sm font-semibold text-white">Agent 动态上下文</div>
          <div className="space-y-2">
            <div>天气：{lesson.contextSummary.weather}</div>
            <div>季节：{lesson.contextSummary.season}</div>
            <div>词汇：{lesson.intent.targetVocabulary.join(", ")}</div>
            <div>研究来源：{lesson.research.sources.length}</div>
          </div>
        </div>

        <details className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 text-sm text-slate-200 shadow-xl">
          <summary className="cursor-pointer font-semibold text-white">查看生成的网页代码</summary>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-slate-950 p-4 text-xs text-emerald-100">
            {lesson.generatedPageSource}
          </pre>
        </details>
      </div>
    </div>
  );
}
