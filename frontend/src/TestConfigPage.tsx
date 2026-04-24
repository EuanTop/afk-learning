import type { StoryRuntimeConfig } from "@capybara-letter/shared";
import { useMemo, useState } from "react";
import {
  fromDateTimeLocalInputValue,
  getScheduledMoment,
  resolveSessionNow,
  toDateTimeLocalInputValue,
} from "./story-time";

type TestConfigPageProps = {
  runtime: StoryRuntimeConfig;
  deliveryTime: string;
  onSaveRuntime: (runtime: StoryRuntimeConfig) => void;
  onBack: () => void;
};

function shellCardClass() {
  return "rounded-[1.9rem] border-4 border-stone-900 bg-[#fff8ea]/96 p-5 shadow-[8px_8px_0_0_#2b2118]";
}

function pillClass(active = false) {
  return [
    "rounded-full border-4 border-stone-900 px-4 py-2 text-sm font-black shadow-[4px_4px_0_0_#2b2118] transition",
    active ? "bg-[#ffcf6e] text-stone-900" : "bg-[#fffdf6] text-stone-700 hover:bg-[#fff2cf]",
  ].join(" ");
}

function buildPresetValue(
  reference: Date,
  deliveryTime: string,
  offsetMinutes: number,
): string {
  const scheduled = getScheduledMoment(reference, deliveryTime);
  scheduled.setMinutes(scheduled.getMinutes() + offsetMinutes);
  return toDateTimeLocalInputValue(scheduled.toISOString());
}

export function TestConfigPage({
  runtime,
  deliveryTime,
  onSaveRuntime,
  onBack,
}: TestConfigPageProps) {
  const [mode, setMode] = useState<StoryRuntimeConfig["mode"]>(runtime.mode);
  const [simulatedValue, setSimulatedValue] = useState(
    toDateTimeLocalInputValue(runtime.simulatedNow),
  );
  const referenceNow = useMemo(() => resolveSessionNow(runtime), [runtime]);
  const effectivePreview =
    mode === "test"
      ? fromDateTimeLocalInputValue(simulatedValue) ?? runtime.simulatedNow ?? new Date().toISOString()
      : new Date().toISOString();

  return (
    <main className="min-h-dvh overflow-hidden bg-[linear-gradient(180deg,#bfd7f5_0%,#d7e6fa_42%,#f4e4cf_100%)] text-stone-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.42)_0%,rgba(255,255,255,0.08)_34%,transparent_62%)]" />

      <header className="relative z-10 flex items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border-4 border-stone-900 bg-[#fff8e8] px-4 py-2 text-sm font-black shadow-[4px_4px_0_0_#2b2118]"
        >
          ← 返回
        </button>
        <section className="max-w-[min(72vw,25rem)] rounded-[1.7rem] border-4 border-stone-900/95 bg-[#fff8e6]/86 px-4 py-3 text-right shadow-[8px_8px_0_0_#2b2118] backdrop-blur-md sm:px-5">
          <h1 className="text-xl font-black leading-tight sm:text-[1.7rem]">测试模式</h1>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            这里专门模拟“现在是什么时候”，不会把调试控件暴露在儿童主界面里。
          </p>
        </section>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <section className={shellCardClass()}>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">运行模式</div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className={pillClass(mode === "live")}
              onClick={() => setMode("live")}
            >
              正常产品模式
            </button>
            <button
              type="button"
              className={pillClass(mode === "test")}
              onClick={() => setMode("test")}
            >
              测试模式
            </button>
          </div>
          <p className="mt-4 text-sm leading-7 text-stone-700">
            正常模式使用真实系统时间。测试模式会把首页、历史和送信节奏都切到你指定的模拟时间。
          </p>
        </section>

        <section className={shellCardClass()}>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">模拟时刻</div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="rounded-[1.4rem] border-4 border-stone-900 bg-[#fffdf6] p-4 shadow-[4px_4px_0_0_#2b2118]">
              <label className="grid gap-2 text-sm">
                <span className="font-semibold text-stone-700">模拟现在</span>
                <input
                  type="datetime-local"
                  disabled={mode !== "test"}
                  value={simulatedValue}
                  onChange={(event) => setSimulatedValue(event.target.value)}
                  className="rounded-[1rem] border-4 border-stone-900 bg-[#fff8e8] px-4 py-3 text-base outline-none disabled:opacity-50"
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  { label: "送信前 30 分钟", offset: -30 },
                  { label: "正好送信", offset: 0 },
                  { label: "送信后 15 分钟", offset: 15 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={mode !== "test"}
                    onClick={() =>
                      setSimulatedValue(
                        buildPresetValue(referenceNow, deliveryTime, preset.offset),
                      )
                    }
                    className="rounded-full border-4 border-stone-900 bg-[#fff8e8] px-3 py-2 text-xs font-black shadow-[3px_3px_0_0_#2b2118] disabled:opacity-50"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[1.4rem] border-4 border-stone-900 bg-[#fffdf6] p-4 shadow-[4px_4px_0_0_#2b2118]">
              <div className="text-sm font-semibold text-stone-700">当前预览</div>
              <div className="mt-3 text-sm leading-7 text-stone-700">
                每日送信时间：<span className="font-black">{deliveryTime}</span>
              </div>
              <div className="mt-2 text-sm leading-7 text-stone-700">
                生效模式：
                <span className="font-black">{mode === "test" ? "测试模式" : "正常模式"}</span>
              </div>
              <div className="mt-2 text-sm leading-7 text-stone-700 break-all">
                当前生效时间：
                <span className="font-black">{effectivePreview}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              onSaveRuntime({
                mode,
                simulatedNow:
                  mode === "test"
                    ? fromDateTimeLocalInputValue(simulatedValue) ?? new Date().toISOString()
                    : null,
              })
            }
            className="mt-5 inline-flex rounded-full border-4 border-stone-900 bg-[#ffcf6e] px-5 py-3 text-sm font-black shadow-[4px_4px_0_0_#2b2118] transition hover:bg-[#ffd881]"
          >
            保存测试配置
          </button>
        </section>
      </div>
    </main>
  );
}
