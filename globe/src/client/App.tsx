import { useState } from "react";
import type { GlobeLessonResponse } from "../shared/types";
import { GlobeExperience } from "./GlobeExperience";

type FormState = {
  message: string;
  age: string;
  englishLevel: string;
};

export function App() {
  const [form, setForm] = useState({
    message: "我想学习森林植物",
    age: "8岁",
    englishLevel: "新概念一级"
  });
  const [lesson, setLesson] = useState<GlobeLessonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      const payload = (await response.json()) as GlobeLessonResponse | { error?: string };
      if (!response.ok || "error" in payload) {
        throw new Error(payload.error ?? "Failed to create lesson");
      }

      setLesson(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),_transparent_26%),linear-gradient(180deg,#03111f_0%,#071527_30%,#08101d_100%)] px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <div className="mb-3 inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs uppercase tracking-[0.24em] text-emerald-100">
              React + Tailwind + Three.js MVP
            </div>
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              用户发出学习意图，Agent 理解主题，检索全球植物数据，再生成可点击的地球学习网页。
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
              这是一个最小可跑通的 Web-first MVP。它不再依赖飞书消息入口，而是直接把
              OpenClaw 风格的动态 Agent 编排接进网页体验。
            </p>
          </div>

          <section className="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-2xl backdrop-blur">
            <div className="mb-4 text-sm font-semibold text-white">启动一次学习会话</div>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm">
                <span className="text-slate-300">用户消息</span>
                <textarea
                  className="min-h-24 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-300/50"
                  value={form.message}
                  onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  <span className="text-slate-300">年龄</span>
                  <input
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-300/50"
                    value={form.age}
                    onChange={(event) => setForm((current) => ({ ...current, age: event.target.value }))}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="text-slate-300">英语程度</span>
                  <input
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-300/50"
                    value={form.englishLevel}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, englishLevel: event.target.value }))
                    }
                  />
                </label>
              </div>
              <button
                className="inline-flex items-center justify-center rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-500"
                disabled={loading}
                onClick={submit}
              >
                {loading ? "Agent 正在理解与编排..." : "生成地球学习网页"}
              </button>
              {error ? <div className="text-sm text-rose-300">{error}</div> : null}
            </div>
          </section>
        </header>

        {lesson ? (
          <GlobeExperience lesson={lesson} />
        ) : (
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-10 text-center shadow-2xl">
            <div className="mx-auto max-w-2xl">
              <div className="mb-3 text-sm uppercase tracking-[0.28em] text-emerald-200/80">MVP Path</div>
              <p className="text-lg leading-8 text-slate-200">
                点击上方按钮后，MVP 会跑通：
                <span className="font-semibold text-white">
                  用户消息 → Agent 意图理解 → 网络植物数据检索 → SceneGraph 生成 → 可点击地球页面
                </span>
                。
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
