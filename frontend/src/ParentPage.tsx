import { useState } from "react";
import { AGE_OPTIONS, ENGLISH_LEVEL_OPTIONS } from "./story-presets";

type ParentPageProps = {
  learnerName: string;
  learnerAge: number;
  englishLevel: string;
  interests: string[];
  parentNote: string;
  deliveryTime: string;
  wordBankSize: number;
  streakDays: number;
  onSaveProfile: (profile: { name: string; age: number; englishLevel: string; interests: string[] }) => void;
  onSavePreferences: (preferences: { deliveryTime: string }) => void;
  onSaveNote: (note: string) => void;
  onBack: () => void;
};

const INTEREST_SUGGESTIONS = [
  "dinosaurs",
  "space",
  "animals",
  "ocean",
  "robots",
  "cooking",
  "music",
  "sports",
  "nature",
  "trains",
];

function shellCardClass() {
  return "rounded-[1.9rem] border-4 border-stone-900 bg-[#fff8ea]/96 p-5 shadow-[8px_8px_0_0_#2b2118]";
}

function smallPill(active = false) {
  return [
    "rounded-full border-4 border-stone-900 px-3 py-1.5 text-xs font-black shadow-[3px_3px_0_0_#2b2118] transition",
    active ? "bg-[#ffcf6e] text-stone-900" : "bg-[#fffdf6] text-stone-700 hover:bg-[#fff2cf]",
  ].join(" ");
}

export function ParentPage({
  learnerName,
  learnerAge,
  englishLevel,
  interests,
  parentNote,
  deliveryTime,
  wordBankSize,
  streakDays,
  onSaveProfile,
  onSavePreferences,
  onSaveNote,
  onBack,
}: ParentPageProps) {
  const [name, setName] = useState(learnerName);
  const [age, setAge] = useState(learnerAge);
  const [level, setLevel] = useState(englishLevel);
  const [tags, setTags] = useState<string[]>(interests);
  const [note, setNote] = useState(parentNote);
  const [nextDeliveryTime, setNextDeliveryTime] = useState(deliveryTime);

  function toggleInterest(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
  }

  function handleSaveProfile() {
    onSaveProfile({
      name: name.trim() || "小朋友",
      age,
      englishLevel: level,
      interests: tags,
    });
  }

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
        <section className="max-w-[min(72vw,24rem)] rounded-[1.7rem] border-4 border-stone-900/95 bg-[#fff8e6]/86 px-4 py-3 text-right shadow-[8px_8px_0_0_#2b2118] backdrop-blur-md sm:px-5">
          <h1 className="text-xl font-black leading-tight sm:text-[1.7rem]">家长设置</h1>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            这里不是另一套后台，而是和孩子入口同风格的陪伴设置页。
          </p>
        </section>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <section className={shellCardClass()}>
          <div className="flex flex-wrap items-center gap-3">
            <span className={smallPill(true)}>学习概览</span>
            <span className={smallPill()}>{wordBankSize} 个单词</span>
            <span className={smallPill()}>{streakDays} 条记录</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.4rem] border-4 border-stone-900 bg-[#fffdf6] p-4 shadow-[4px_4px_0_0_#2b2118]">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">已学单词</div>
              <div className="mt-2 text-3xl font-black">{wordBankSize}</div>
            </div>
            <div className="rounded-[1.4rem] border-4 border-stone-900 bg-[#fffdf6] p-4 shadow-[4px_4px_0_0_#2b2118]">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">会话记录</div>
              <div className="mt-2 text-3xl font-black">{streakDays}</div>
            </div>
            <div className="rounded-[1.4rem] border-4 border-stone-900 bg-[#fffdf6] p-4 shadow-[4px_4px_0_0_#2b2118]">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">当前目标</div>
              <div className="mt-2 text-sm font-semibold leading-7 text-stone-700">
                帮卡皮巴拉更懂孩子，再决定明晚该去找什么。
              </div>
            </div>
          </div>
        </section>

        <section className={shellCardClass()}>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">孩子信息</div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="rounded-[1.4rem] border-4 border-stone-900 bg-[#fffdf6] p-4 shadow-[4px_4px_0_0_#2b2118]">
              <label className="grid gap-2 text-sm">
                <span className="font-semibold text-stone-700">名字</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="rounded-[1rem] border-4 border-stone-900 bg-[#fff8e8] px-4 py-3 text-base outline-none"
                  placeholder="小朋友的名字"
                />
              </label>

              <div className="mt-4">
                <div className="text-sm font-semibold text-stone-700">年龄</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {AGE_OPTIONS.map((candidateAge) => (
                    <button
                      key={candidateAge}
                      type="button"
                      onClick={() => setAge(candidateAge)}
                      className={smallPill(age === candidateAge)}
                    >
                      {candidateAge} 岁
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label className="grid gap-2 text-sm">
                  <span className="font-semibold text-stone-700">英语等级</span>
                  <select
                    value={level}
                    onChange={(event) => setLevel(event.target.value)}
                    className="rounded-[1rem] border-4 border-stone-900 bg-[#fff8e8] px-4 py-3 text-base outline-none"
                  >
                    {ENGLISH_LEVEL_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="rounded-[1.4rem] border-4 border-stone-900 bg-[#fffdf6] p-4 shadow-[4px_4px_0_0_#2b2118]">
              <div className="text-sm font-semibold text-stone-700">兴趣标签</div>
              <p className="mt-2 text-sm leading-7 text-stone-600">
                这些兴趣会影响卡皮巴拉之后的主动推荐和桥接主题。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {INTEREST_SUGGESTIONS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleInterest(tag)}
                    className={smallPill(tags.includes(tag))}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveProfile}
            className="mt-4 inline-flex rounded-full border-4 border-stone-900 bg-[#ffcf6e] px-5 py-3 text-sm font-black shadow-[4px_4px_0_0_#2b2118] transition hover:bg-[#ffd881]"
          >
            保存孩子信息
          </button>
        </section>

        <section className={shellCardClass()}>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">今日备注</div>
          <p className="mt-3 text-sm leading-7 text-stone-700">
            告诉卡皮巴拉今天孩子经历了什么。它会把这些生活上下文带进明天的信里，而不是只做机械问答。
          </p>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            className="mt-4 w-full rounded-[1.4rem] border-4 border-stone-900 bg-[#fffdf6] px-4 py-4 text-base outline-none shadow-[4px_4px_0_0_#2b2118]"
            placeholder="例如：今天去了动物园，看到了很多水边动物。"
          />
          <button
            type="button"
            onClick={() => onSaveNote(note)}
            className="mt-4 inline-flex rounded-full border-4 border-stone-900 bg-[#fff8e8] px-5 py-3 text-sm font-black shadow-[4px_4px_0_0_#2b2118] transition hover:bg-[#fff2cf]"
          >
            发送给卡皮巴拉
          </button>
        </section>

        <section className={shellCardClass()}>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">送信节奏</div>
          <p className="mt-3 text-sm leading-7 text-stone-700">
            默认每天晚上 20:30 送信。这里可以改成更适合家庭作息的固定时间。
          </p>
          <div className="mt-4 max-w-sm rounded-[1.4rem] border-4 border-stone-900 bg-[#fffdf6] p-4 shadow-[4px_4px_0_0_#2b2118]">
            <label className="grid gap-2 text-sm">
              <span className="font-semibold text-stone-700">每日送信时间</span>
              <input
                type="time"
                value={nextDeliveryTime}
                onChange={(event) => setNextDeliveryTime(event.target.value)}
                className="rounded-[1rem] border-4 border-stone-900 bg-[#fff8e8] px-4 py-3 text-base outline-none"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => onSavePreferences({ deliveryTime: nextDeliveryTime })}
            className="mt-4 inline-flex rounded-full border-4 border-stone-900 bg-[#ffcf6e] px-5 py-3 text-sm font-black shadow-[4px_4px_0_0_#2b2118] transition hover:bg-[#ffd881]"
          >
            保存送信时间
          </button>
        </section>
      </div>
    </main>
  );
}
