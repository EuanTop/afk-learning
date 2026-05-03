import {
  DEFAULT_STORY_EXPERIENCE_SETTINGS,
  DEFAULT_STORY_RUNTIME_CONFIG,
  type ConversationEntry,
  type StoryDeliveryRecord,
  type StorySessionSnapshot,
  type StoryWordCard,
  type StoryWordRating,
  type VocabularyCard,
} from "@capybara-letter/shared";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LetterBody } from "./LetterBody";
import { buildTimelineMockSession, resolveMockTimelineOptions } from "./mockTimeline";
import { ParentPage } from "./ParentPage";
import { ReviewPage } from "./ReviewPage";
import { StoryScenePanel } from "./StoryScenePanel";
import { TestConfigPage } from "./TestConfigPage";
import {
  buildAdventurePreview,
  buildEnglishLevelPayload,
  DEFAULT_ENGLISH_LEVEL_ID,
  IDLE_LETTER,
  IDLE_SCENE,
  IDLE_TIMELINE,
  LEGACY_SESSION_CACHE_STORAGE_KEYS,
  LEGACY_SESSION_ID_STORAGE_KEYS,
  LEGACY_SETTINGS_STORAGE_KEYS,
  SESSION_CACHE_STORAGE_KEY,
  SESSION_ID_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  resolveEnglishLevelOptionId,
} from "./story-presets";
import {
  findLatestAvailableDelivery,
  formatRelativeMomentLabel,
  isSameLocalDay,
  resolveSessionNow,
  toLocalDateKey,
} from "./story-time";
import { useCapybaraChannel, type SpeechFramePayload } from "./useCapybaraChannel";
import type { StoryScene } from "@capybara-letter/shared";

type SettingsState = {
  age: number;
  englishLevelId: string;
};

type QuickWishOption = {
  id: string;
  label: string;
  text: string;
};

type PendingJourneyState = {
  requestId: string;
  phase: "wish-heard" | "departing" | "researching" | "returning";
};

type PendingSpeechRequest = {
  key: string;
  scope: "letter" | "word";
};

type BrowserSpeechRecognitionEvent = {
  results: ArrayLike<{
    0?: {
      transcript?: string;
    };
  }>;
};

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  addEventListener: (type: "error", listener: (event: { error?: string }) => void) => void;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const WS_URL =
  import.meta.env.VITE_CAPYBARA_LETTER_WS_URL ??
  import.meta.env.VITE_EDU_STORY_WS_URL ??
  "ws://127.0.0.1:18820";

const DEV_BACKEND_HINT = [
  "本地开发时，请先启动 OpenClaw gateway：",
  "1. openclaw gateway run",
  "2. pnpm --filter @capybara-letter/frontend dev",
].join("\n");

function readStoredJson<T>(key: string, fallback: T, legacyKeys: string[] = []): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw) as T;
    }

    for (const legacyKey of legacyKeys) {
      const legacyRaw = window.localStorage.getItem(legacyKey);
      if (!legacyRaw) {
        continue;
      }
      window.localStorage.setItem(key, legacyRaw);
      return JSON.parse(legacyRaw) as T;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

function clearStoredJson(key: string, legacyKeys: string[] = []) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(key);
  legacyKeys.forEach((legacyKey) => {
    window.localStorage.removeItem(legacyKey);
  });
}

function getMissingReferencedDeliveryIds(snapshot: StorySessionSnapshot): string[] {
  const deliveryIds = new Set(snapshot.deliveryLog.map((delivery) => delivery.id));
  const referencedIds = new Set(
    snapshot.history
      .map((entry) => entry.sourceDeliveryId?.trim())
      .filter((value): value is string => Boolean(value)),
  );

  return [...referencedIds].filter((deliveryId) => !deliveryIds.has(deliveryId));
}

function getMockHistoryDeliveryCount(snapshot: StorySessionSnapshot): number {
  const deliveryIndexes = new Set<number>();

  snapshot.history.forEach((entry) => {
    const historyMatch = entry.id.match(/^delivery-(\d+)-/);
    if (historyMatch) {
      deliveryIndexes.add(Number(historyMatch[1]));
    }

    const sourceMatch = entry.sourceDeliveryId?.match(/^mock-delivery-(\d+)$/);
    if (sourceMatch) {
      deliveryIndexes.add(Number(sourceMatch[1]));
    }
  });

  return deliveryIndexes.size;
}

function sanitizeStoredSessionSnapshot(
  snapshot: StorySessionSnapshot | null,
  expectedSessionId: string | null,
): StorySessionSnapshot | null {
  if (!snapshot) {
    return null;
  }

  if (expectedSessionId && snapshot.sessionId !== expectedSessionId) {
    return null;
  }

  if (getMissingReferencedDeliveryIds(snapshot).length > 0) {
    return null;
  }

  const mockHistoryDeliveryCount = getMockHistoryDeliveryCount(snapshot);
  if (mockHistoryDeliveryCount > snapshot.deliveryLog.length) {
    return null;
  }

  return snapshot;
}

function readStoredSessionSnapshot(expectedSessionId: string | null): StorySessionSnapshot | null {
  const stored = readStoredJson<StorySessionSnapshot | null>(
    SESSION_CACHE_STORAGE_KEY,
    null,
    LEGACY_SESSION_CACHE_STORAGE_KEYS,
  );
  const sanitized = sanitizeStoredSessionSnapshot(stored, expectedSessionId);
  if (stored && !sanitized) {
    clearStoredJson(SESSION_CACHE_STORAGE_KEY, LEGACY_SESSION_CACHE_STORAGE_KEYS);
    if (import.meta.env.DEV) {
      console.info("[StoryHomePage] dropped stale cached session snapshot", {
        cachedSessionId: stored.sessionId,
        expectedSessionId,
        missingReferencedDeliveryIds: getMissingReferencedDeliveryIds(stored),
        mockHistoryDeliveryCount: getMockHistoryDeliveryCount(stored),
        deliveryLogCount: stored.deliveryLog.length,
      });
    }
  }
  return sanitized;
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatHistoryDateLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function historyDateKey(iso: string): string {
  try {
    const date = new Date(iso);
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return iso;
  }
}

function groupHistoryByDate(entries: ConversationEntry[]) {
  const grouped: Array<{
    key: string;
    label: string;
    entries: ConversationEntry[];
  }> = [];

  const sortedEntries = [...entries].toSorted(
    (left, right) => new Date(right.time).getTime() - new Date(left.time).getTime(),
  );

  for (const entry of sortedEntries) {
    const key = historyDateKey(entry.time);
    const lastGroup = grouped[grouped.length - 1];
    if (lastGroup && lastGroup.key === key) {
      lastGroup.entries.push(entry);
      continue;
    }
    grouped.push({
      key,
      label: formatHistoryDateLabel(entry.time),
      entries: [entry],
    });
  }

  return grouped;
}

function buildHistorySections(
  entries: ConversationEntry[],
  deliveryLog: StoryDeliveryRecord[],
) {
  const sections = new Map<
    string,
    {
      key: string;
      label: string;
      anchorTime: number;
      entries: ConversationEntry[];
      deliveries: StoryDeliveryRecord[];
    }
  >();

  const ensureSection = (key: string, label: string, timestamp: number) => {
    const existing = sections.get(key);
    if (existing) {
      existing.anchorTime = Math.max(existing.anchorTime, timestamp);
      return existing;
    }
    const created = {
      key,
      label,
      anchorTime: timestamp,
      entries: [] as ConversationEntry[],
      deliveries: [] as StoryDeliveryRecord[],
    };
    sections.set(key, created);
    return created;
  };

  entries.forEach((entry) => {
    const timestamp = new Date(entry.time).getTime();
    const key = historyDateKey(entry.time);
    ensureSection(key, formatHistoryDateLabel(entry.time), timestamp).entries.push(entry);
  });

  deliveryLog.forEach((delivery) => {
    const timestamp = new Date(delivery.deliveredAt).getTime();
    const key = toLocalDateKey(delivery.deliveredAt);
    ensureSection(key, formatHistoryDateLabel(delivery.deliveredAt), timestamp).deliveries.push(
      delivery,
    );
  });

  return [...sections.values()]
    .map((section) => ({
      ...section,
      entries: [...section.entries].sort(
        (left, right) => new Date(right.time).getTime() - new Date(left.time).getTime(),
      ),
      deliveries: [...section.deliveries].sort(
        (left, right) =>
          new Date(right.deliveredAt).getTime() - new Date(left.deliveredAt).getTime(),
      ),
    }))
    .sort((left, right) => right.anchorTime - left.anchorTime);
}

function formatDueText(iso: string): string {
  const dueAt = new Date(iso).getTime();
  const delta = dueAt - Date.now();
  if (!Number.isFinite(dueAt)) {
    return "等待复习";
  }
  if (delta <= 0) {
    return "现在可以复习";
  }
  const minutes = Math.round(delta / 60_000);
  if (minutes < 60) {
    return `${minutes} 分钟后复习`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时后复习`;
  }
  const days = Math.round(hours / 24);
  return `${days} 天后复习`;
}

function normalizeWordKey(word: string): string {
  return `word:${word.trim().toLowerCase().replace(/\s+/g, "-")}`;
}

function buildDisplayedWordCards(params: {
  story: StorySessionSnapshot["currentStory"];
  wordBank: StoryWordCard[];
  deliveryId: string | null;
}): StoryWordCard[] {
  if (!params.story) {
    return [];
  }

  const bank = new Map(params.wordBank.map((card) => [card.id, card]));

  return params.story.vocabularyCards.map((card) => {
    const cardId = normalizeWordKey(card.word);
    const existing = bank.get(cardId);
    return {
      id: cardId,
      word: card.word,
      pronunciation: card.pronunciation,
      meaningZh: card.meaningZh,
      partOfSpeech: card.partOfSpeech,
      tapHint: card.tapHint,
      example: card.example,
      exampleZh: card.exampleZh,
      sourceSessionId: params.story?.sessionId ?? existing?.sourceSessionId ?? "capybara-letter",
      sourceTitle: params.story?.title ?? existing?.sourceTitle ?? "卡皮巴拉的来信",
      sourceDeliveryId:
        params.deliveryId ?? existing?.sourceDeliveryId ?? undefined,
      encounterCount: existing?.encounterCount ?? 1,
      firstSeenAt: existing?.firstSeenAt ?? new Date().toISOString(),
      lastSeenAt: existing?.lastSeenAt ?? new Date().toISOString(),
      lastRating: existing?.lastRating ?? null,
      scheduler: existing?.scheduler ?? {
        due: new Date().toISOString(),
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        learningSteps: 0,
        reps: 0,
        lapses: 0,
        state: "New",
        lastReview: null,
      },
    };
  });
}

function sceneHasRenderableContent(scene: StoryScene | null | undefined): scene is StoryScene {
  return Boolean(scene && scene.layers.length > 0);
}

function ensureRenderableScene(scene: StoryScene | null | undefined): StoryScene {
  if (sceneHasRenderableContent(scene)) {
    return scene;
  }
  return IDLE_SCENE;
}

function normalizeWishText(value: string): string {
  const trimmed = value.trim().replace(/[。！？!?.\s]+$/g, "");
  if (!trimmed) {
    return "明天我想听一个新故事。";
  }
  if (/^明天|^我想|^我还想|^请给我/i.test(trimmed)) {
    return `${trimmed}。`;
  }
  return `明天我想听${trimmed}。`;
}

function buildLetterSpeechText(story: NonNullable<StorySessionSnapshot["currentStory"]>): string {
  return [
    story.letter.greeting,
    ...story.letter.body,
    story.letter.signoff,
    story.letter.postscript,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildWordSpeechText(card: StoryWordCard): string {
  return card.word.trim();
}

function createAudioSourceUrl(mimeType: string, audioBase64: string): string {
  const binary = window.atob(audioBase64.replace(/\s+/gu, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

function revokeAudioSourceUrl(src: string | null | undefined) {
  if (!src?.startsWith("blob:")) {
    return;
  }
  URL.revokeObjectURL(src);
}

function buildTomorrowWishOptions(params: {
  story: StorySessionSnapshot["currentStory"];
  environment: StorySessionSnapshot["environment"] | undefined;
  learner: StorySessionSnapshot["learnerProfile"] | undefined;
}): QuickWishOption[] {
  const options: QuickWishOption[] = [];
  const seen = new Set<string>();

  const push = (label: string, text: string) => {
    const normalized = normalizeWishText(text);
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    options.push({
      id: `${label}-${options.length + 1}`,
      label,
      text: normalized,
    });
  };

  if (params.story?.suggestedReply) {
    push("卡皮巴拉推荐", params.story.suggestedReply);
  }

  if (params.story?.plan?.topic) {
    push("继续探索", `${params.story.plan.topic}里还有什么我不知道的秘密`);
  }

  const weather = params.environment?.weather?.condition ?? "";
  if (/雨|rain/i.test(weather)) {
    push("天气灵感", "雨为什么会从云里落下来");
  } else if (/晴|sun/i.test(weather)) {
    push("天气灵感", "太阳为什么会发光发热");
  } else if (/风|wind/i.test(weather)) {
    push("天气灵感", "风为什么看不见却能吹动树叶");
  }

  const event = params.environment?.event ?? "";
  if (/科技馆|museum|火箭|rocket/i.test(event)) {
    push("今天继续", "火箭为什么能飞到天上");
  } else if (/动物园|zoo/i.test(event)) {
    push("今天继续", "长颈鹿的脖子为什么那么长");
  }

  const interests = params.learner?.interests ?? [];
  interests.forEach((interest) => {
    if (/动物|animal/i.test(interest)) {
      push("兴趣推荐", "海豚为什么喜欢跳出水面");
      return;
    }
    if (/森林|nature|植物|plant/i.test(interest)) {
      push("兴趣推荐", "森林里的叶子为什么颜色不一样");
      return;
    }
    if (/太空|space|星/i.test(interest)) {
      push("兴趣推荐", "月亮为什么有时候圆有时候弯");
    }
  });

  if (params.environment?.parentNote) {
    push("家长线索", "想听一个和今天生活有关、能学新英文单词的故事");
  }

  return options.slice(0, 4);
}

function resolveHistoryEntryDeliveryId(
  entry: ConversationEntry,
  deliveryLog: StoryDeliveryRecord[],
): string | null {
  if (entry.sourceDeliveryId && deliveryLog.some((delivery) => delivery.id === entry.sourceDeliveryId)) {
    return entry.sourceDeliveryId;
  }

  if (entry.role === "user") {
    return null;
  }

  const exactMatch = deliveryLog.find((delivery) =>
    delivery.story.messages.some(
      (message) => message.speaker === entry.role && message.text.trim() === entry.text.trim(),
    ),
  );
  if (exactMatch) {
    return exactMatch.id;
  }

  const sameDay = deliveryLog.filter((delivery) => toLocalDateKey(delivery.deliveredAt) === toLocalDateKey(entry.time));
  if (sameDay.length === 1) {
    return sameDay[0]?.id ?? null;
  }

  return null;
}

function iconButtonClass(active = false): string {
  return [
    "grid h-12 w-12 place-items-center rounded-full border-4 border-stone-900 shadow-[4px_4px_0_0_#2b2118] transition",
    active ? "bg-[#ffe08a]" : "bg-[#fff8e8] hover:bg-[#fff1c9]",
  ].join(" ");
}

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function HistoryIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function LetterIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 6h18v12H3z" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v5" />
      <path d="M8 22h8" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 20 21 12 3 4l2 7 9 1-9 1-2 7Z" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 6a9 9 0 0 1 0 12" />
    </svg>
  );
}

type DrawerProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

function Drawer({ open, title, onClose, children }: DrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-40 bg-black/35 backdrop-blur-[2px]">
      <button aria-label="关闭弹层" className="absolute inset-0" onClick={onClose} type="button" />
      <section className="absolute right-4 top-4 bottom-4 z-50 flex w-[min(92vw,28rem)] flex-col rounded-[2rem] border-4 border-stone-900 bg-[#fff8e8] p-5 shadow-[10px_10px_0_0_#2b2118]">
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-black text-stone-900">{title}</h2>
          <button
            aria-label="关闭"
            className="grid h-10 w-10 place-items-center rounded-full border-4 border-stone-900 bg-[#fffdf6] font-black shadow-[3px_3px_0_0_#2b2118]"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
      </section>
    </div>
  );
}

type WordDockProps = {
  cards: StoryWordCard[];
  activeIndex: number;
  onReview: (rating: StoryWordRating) => void;
  onSpeakWord: () => void;
  reviewing: boolean;
  speechState: "idle" | "loading" | "playing";
  totalBankCount: number;
};

function WordDock({
  cards,
  activeIndex,
  onReview,
  onSpeakWord,
  reviewing,
  speechState,
  totalBankCount,
}: WordDockProps) {
  const activeCard = cards[activeIndex] ?? null;

  if (!activeCard) {
    return null;
  }

  return (
    <aside className="absolute right-3 bottom-28 z-20 w-[min(88vw,18rem)] sm:right-5 sm:bottom-32">
      <section className="rounded-[1.8rem] border-4 border-stone-900 bg-[#fff8ea]/90 p-4 shadow-[8px_8px_0_0_#2b2118] backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-stone-500">Word Cards</div>
            <div className="mt-1 text-sm font-semibold text-stone-700">
              本次来信 {cards.length} 张卡，已累计 {totalBankCount} 个单词
            </div>
          </div>
          <div className="rounded-full border-[3px] border-stone-900 bg-[#ffefbf] px-3 py-1 text-xs font-black text-stone-700 shadow-[2px_2px_0_0_#2b2118]">
            {activeIndex + 1}/{cards.length}
          </div>
        </div>

        <article className="mt-4 rounded-[1.5rem] border-4 border-stone-900 bg-[#fffdf6] px-4 py-4 shadow-[4px_4px_0_0_#2b2118]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-2xl font-black text-stone-900">{activeCard.word}</div>
              <div className="mt-1 text-sm font-semibold text-stone-500">
                {activeCard.pronunciation}
              </div>
            </div>
            <button
              type="button"
              onClick={onSpeakWord}
              className="inline-flex items-center gap-2 rounded-full border-4 border-stone-900 bg-[#fff8e8] px-3 py-2 text-xs font-black text-stone-800 shadow-[3px_3px_0_0_#2b2118]"
            >
              <SpeakerIcon />
              {speechState === "loading"
                ? "朗读中..."
                : speechState === "playing"
                  ? "停止朗读"
                  : "点读"}
            </button>
          </div>
          <div className="mt-3 text-base font-semibold text-stone-800">{activeCard.meaningZh}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-500">
            {activeCard.partOfSpeech}
          </div>
          <div className="mt-3 rounded-[1rem] bg-[#fff4d1] px-3 py-2 text-sm leading-6 text-stone-700">
            {activeCard.example}
          </div>
          <div className="mt-2 text-sm leading-6 text-stone-600">{activeCard.exampleZh}</div>
          <div className="mt-3 text-xs font-semibold text-stone-500">
            {activeCard.tapHint} · {formatDueText(activeCard.scheduler.due)}
          </div>
        </article>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="rounded-[1rem] border-4 border-stone-900 bg-[#ffdacc] px-3 py-2 text-sm font-black shadow-[3px_3px_0_0_#2b2118] transition hover:bg-[#ffe4da] disabled:opacity-60"
            disabled={reviewing}
            onClick={() => onReview("again")}
            type="button"
          >
            再看看
          </button>
          <button
            className="rounded-[1rem] border-4 border-stone-900 bg-[#ffe8b3] px-3 py-2 text-sm font-black shadow-[3px_3px_0_0_#2b2118] transition hover:bg-[#fff0c6] disabled:opacity-60"
            disabled={reviewing}
            onClick={() => onReview("hard")}
            type="button"
          >
            有点难
          </button>
          <button
            className="rounded-[1rem] border-4 border-stone-900 bg-[#d7f1c5] px-3 py-2 text-sm font-black shadow-[3px_3px_0_0_#2b2118] transition hover:bg-[#e1f7d0] disabled:opacity-60"
            disabled={reviewing}
            onClick={() => onReview("good")}
            type="button"
          >
            记住啦
          </button>
          <button
            className="rounded-[1rem] border-4 border-stone-900 bg-[#cfe7ff] px-3 py-2 text-sm font-black shadow-[3px_3px_0_0_#2b2118] transition hover:bg-[#daeeff] disabled:opacity-60"
            disabled={reviewing}
            onClick={() => onReview("easy")}
            type="button"
          >
            太会了
          </button>
        </div>

        {cards.length > 1 ? (
          <div className="mt-3 text-xs font-semibold leading-6 text-stone-500">
            选一个记忆程度后，会自动切到下一张词卡。
          </div>
        ) : null}
      </section>
    </aside>
  );
}

type StoryHomePageProps = {
  initialView?: "home" | "review" | "parent" | "test";
};

export function StoryHomePage({ initialView = "home" }: StoryHomePageProps) {
  const mockOptions = useMemo(() => resolveMockTimelineOptions(), []);
  const [currentView, setCurrentView] = useState<"home" | "review" | "parent" | "test">(initialView);
  const [settings, setSettings] = useState<SettingsState>(() =>
    readStoredJson(SETTINGS_STORAGE_KEY, {
      age: 8,
      englishLevelId: DEFAULT_ENGLISH_LEVEL_ID,
    }, LEGACY_SETTINGS_STORAGE_KEYS),
  );
  const [sessionId, setSessionId] = useState<string | null>(() =>
    mockOptions.sessionId ??
      readStoredJson<string | null>(SESSION_ID_STORAGE_KEY, null, LEGACY_SESSION_ID_STORAGE_KEYS),
  );
  const [session, setSession] = useState<StorySessionSnapshot | null>(() =>
    readStoredSessionSnapshot(
      mockOptions.sessionId ??
        readStoredJson<string | null>(SESSION_ID_STORAGE_KEY, null, LEGACY_SESSION_ID_STORAGE_KEYS),
    ),
  );
  const [form, setForm] = useState({
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [reviewingWord, setReviewingWord] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [letterOpen, setLetterOpen] = useState(false);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [pendingJourney, setPendingJourney] = useState<PendingJourneyState | null>(null);
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [streamPreview, setStreamPreview] = useState("");
  const [speechLoadingKey, setSpeechLoadingKey] = useState<string | null>(null);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const phaseTimeoutsRef = useRef<number[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechRequestsRef = useRef<Map<string, PendingSpeechRequest>>(new Map());
  const speechSrcCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(SESSION_CACHE_STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (sessionId) {
      window.localStorage.setItem(SESSION_ID_STORAGE_KEY, JSON.stringify(sessionId));
      return;
    }
    window.localStorage.removeItem(SESSION_ID_STORAGE_KEY);
  }, [sessionId]);

  const clearJourneyTimers = () => {
    phaseTimeoutsRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    phaseTimeoutsRef.current = [];
  };

  const resetJourney = () => {
    clearJourneyTimers();
    setPendingJourney(null);
  };

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      clearJourneyTimers();
      speechRequestsRef.current.clear();
      speechSrcCacheRef.current.forEach((src) => {
        revokeAudioSourceUrl(src);
      });
      speechSrcCacheRef.current.clear();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  const stopSpeechPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setSpeakingKey(null);
  }, []);

  const playSpeechDataUrl = useCallback(
    async (key: string, src: string) => {
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.preload = "auto";
        audioRef.current.setAttribute("playsinline", "true");
      }

      const audio = audioRef.current;
      audio.pause();
      audio.currentTime = 0;
      audio.src = src;
      audio.onended = () => {
        setSpeakingKey((current) => (current === key ? null : current));
      };
      audio.onerror = () => {
        setSpeakingKey((current) => (current === key ? null : current));
        setHint("这次朗读没有成功播放，我们可以再点一次试试。");
      };

      setSpeakingKey(key);
      try {
        await audio.play();
      } catch (error) {
        setSpeakingKey(null);
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setHint("浏览器拦住了自动播放，请再点一次朗读按钮。");
          return;
        }
        setHint("这段朗读音频没有成功播放。刚刚我已经把长音频播放方式改稳了，你刷新后再试一次。");
      }
    },
    [],
  );

  const handleChannelSessionId = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  const handleChannelSnapshot = useCallback((snapshot: StorySessionSnapshot) => {
    startTransition(() => {
      setSession(snapshot);
      setSessionId(snapshot.sessionId);
      setLetterOpen(
        (current) =>
          current &&
          (Boolean(snapshot.currentStory) || (snapshot.deliveryLog?.length ?? 0) > 0),
      );
      setLoading(false);
      setReviewingWord(false);
      setStreamPreview("");
      setError(null);
      resetJourney();
    });
  }, []);

  const handleChannelDelta = useCallback((text: string) => {
    setStreamPreview((current) => `${current}${text}`);
  }, []);

  const handleChannelStatus = useCallback((state: "thinking" | "researching" | "composing" | "idle") => {
    if (state === "idle") {
      setLoading(false);
    }
  }, []);

  const handleChannelError = useCallback((message: string) => {
    setError(message);
    setLoading(false);
    setReviewingWord(false);
    resetJourney();
  }, []);

  const handleChannelSpeech = useCallback(
    (payload: SpeechFramePayload) => {
      const request = speechRequestsRef.current.get(payload.requestId);
      speechRequestsRef.current.delete(payload.requestId);
      const key = request?.key ?? payload.cacheKey;

      try {
        const previousSrc = speechSrcCacheRef.current.get(key);
        revokeAudioSourceUrl(previousSrc);
        const src = createAudioSourceUrl(payload.mimeType, payload.audioBase64);
        speechSrcCacheRef.current.set(key, src);
        setSpeechLoadingKey((current) => (current === key ? null : current));
        setHint(null);
        void playSpeechDataUrl(key, src);
      } catch (error) {
        setSpeechLoadingKey((current) => (current === key ? null : current));
        setSpeakingKey((current) => (current === key ? null : current));
        setHint(
          error instanceof Error
            ? `朗读音频解码失败：${error.message}`
            : "朗读音频解码失败，请重试。",
        );
      }
    },
    [playSpeechDataUrl],
  );

  const handleChannelSpeechError = useCallback((requestId: string, message: string) => {
    const request = speechRequestsRef.current.get(requestId);
    speechRequestsRef.current.delete(requestId);
    if (request) {
      setSpeechLoadingKey((current) => (current === request.key ? null : current));
    }
    setHint(`朗读暂时不可用：${message}`);
  }, []);

  const { connectionState, send, sendMessage, sendReviewWord, requestSpeech } = useCapybaraChannel({
    enabled: !mockOptions.forceMock,
    url: WS_URL,
    age: settings.age,
    englishLevel: buildEnglishLevelPayload(settings.englishLevelId),
    sessionId,
    onSessionId: handleChannelSessionId,
    onSnapshot: handleChannelSnapshot,
    onDelta: handleChannelDelta,
    onSpeech: handleChannelSpeech,
    onSpeechError: handleChannelSpeechError,
    onStatus: handleChannelStatus,
    onError: handleChannelError,
  });

  const bootstrapping = !mockOptions.forceMock && connectionState === "connecting";
  const timelineMockSession = useMemo(
    () => buildTimelineMockSession(mockOptions.mockAt ?? undefined, mockOptions.sessionId ?? undefined),
    [mockOptions.mockAt, mockOptions.sessionId],
  );
  const usingMockFallback = mockOptions.forceMock;
  const displaySession = usingMockFallback ? timelineMockSession : session;
  const sessionPreferences =
    displaySession?.preferences ?? DEFAULT_STORY_EXPERIENCE_SETTINGS;
  const sessionRuntime = displaySession?.runtime ?? DEFAULT_STORY_RUNTIME_CONFIG;
  const effectiveNow = useMemo(() => resolveSessionNow(sessionRuntime), [sessionRuntime]);
  const deliveryLog = useMemo(
    () =>
      [...(displaySession?.deliveryLog ?? [])].sort(
        (left, right) =>
          new Date(right.deliveredAt).getTime() - new Date(left.deliveredAt).getTime(),
      ),
    [displaySession?.deliveryLog],
  );

  useEffect(() => {
    if (!selectedDeliveryId) {
      return;
    }
    if (!deliveryLog.some((entry) => entry.id === selectedDeliveryId)) {
      setSelectedDeliveryId(null);
    }
  }, [deliveryLog, selectedDeliveryId]);

  const selectedDelivery = useMemo(
    () => deliveryLog.find((entry) => entry.id === selectedDeliveryId) ?? null,
    [deliveryLog, selectedDeliveryId],
  );
  const latestAvailableDelivery = useMemo(
    () => findLatestAvailableDelivery(displaySession?.deliveryLog ?? [], effectiveNow),
    [displaySession?.deliveryLog, effectiveNow],
  );
  const waitingForTodayLetter = useMemo(() => {
    if (selectedDelivery) {
      return false;
    }
    if (!latestAvailableDelivery) {
      return false;
    }
    if (latestAvailableDelivery.story.kind === "welcome") {
      return false;
    }
    return !isSameLocalDay(latestAvailableDelivery.deliveredAt, effectiveNow);
  }, [effectiveNow, latestAvailableDelivery, selectedDelivery]);

  const activeDelivery = selectedDelivery ?? (waitingForTodayLetter ? null : latestAvailableDelivery);
  const currentStory = activeDelivery?.story ?? null;
  const latestUserMessage = useMemo(
    () =>
      [...(displaySession?.history ?? [])].toReversed().find((entry) => entry.role === "user") ??
      null,
    [displaySession],
  );
  const activePreview = useMemo(
    () =>
      pendingJourney
        ? buildAdventurePreview({
            phase: pendingJourney.phase,
            baseScene:
              (sceneHasRenderableContent(currentStory?.scene) ? currentStory?.scene : null) ??
              (sceneHasRenderableContent(latestAvailableDelivery?.story.scene)
                ? latestAvailableDelivery?.story.scene
                : null),
          })
        : null,
    [currentStory?.scene, latestAvailableDelivery?.story.scene, pendingJourney],
  );

  const latestCapybaraMessage = useMemo(() => {
    if (loading && pendingJourney) {
      return "...";
    }
    if (streamPreview.trim()) {
      return streamPreview;
    }
    if (currentStory) {
      return (
        currentStory.messages.findLast((message) => message.speaker === "capybara")?.text ??
        IDLE_TIMELINE.tonightQuestion
      );
    }
    return `今天的信会在 ${sessionPreferences.deliveryTime} 送到。现在可以先去历史会话看看以前的来信。`;
  }, [
    currentStory,
    displaySession,
    loading,
    pendingJourney,
    sessionPreferences.deliveryTime,
    streamPreview,
  ]);

  const displayScene = ensureRenderableScene(activePreview?.scene ?? currentStory?.scene);
  const displayStatus = pendingJourney
    ? "正在冒险"
    : displaySession?.status === "adventuring"
      ? "正在冒险"
      : "正在回信";
  const displaySubtitle = currentStory
    ? currentStory.subtitle
    : `今天的信会在 ${sessionPreferences.deliveryTime} 送到。还没到点时，可以去历史会话翻看以前的来信。`;

  const currentWordCards = useMemo(
    () =>
      buildDisplayedWordCards({
        story: currentStory,
        wordBank: displaySession?.wordBank ?? [],
        deliveryId: activeDelivery?.id ?? null,
      }),
    [activeDelivery?.id, currentStory, displaySession?.wordBank],
  );
  const activeWordCard = currentWordCards[activeWordIndex] ?? null;
  const activeWordSpeechKey = activeWordCard ? `word:${activeWordCard.id}` : null;
  const activeLetterSpeechKey = currentStory
    ? `letter:${activeDelivery?.id ?? currentStory.sessionId}:${currentStory.title}`
    : null;
  const activeWordSpeechState: "idle" | "loading" | "playing" =
    activeWordSpeechKey && speakingKey === activeWordSpeechKey
      ? "playing"
      : activeWordSpeechKey && speechLoadingKey === activeWordSpeechKey
        ? "loading"
        : "idle";
  const activeLetterSpeechState: "idle" | "loading" | "playing" =
    activeLetterSpeechKey && speakingKey === activeLetterSpeechKey
      ? "playing"
      : activeLetterSpeechKey && speechLoadingKey === activeLetterSpeechKey
        ? "loading"
        : "idle";

  const allWordCards = displaySession?.wordBank ?? [];
  const historySections = useMemo(
    () => buildHistorySections(displaySession?.history ?? [], deliveryLog),
    [deliveryLog, displaySession?.history],
  );
  const deliveryIdsByHistoryEntryId = useMemo(() => {
    const result = new Map<string, string>();
    (displaySession?.history ?? []).forEach((entry) => {
      const deliveryId = resolveHistoryEntryDeliveryId(entry, deliveryLog);
      if (deliveryId) {
        result.set(entry.id, deliveryId);
      }
    });
    return result;
  }, [deliveryLog, displaySession?.history]);

  useEffect(() => {
    setActiveWordIndex(0);
  }, [activeDelivery?.id, currentStory?.sessionId, currentStory?.title]);

  useEffect(() => {
    stopSpeechPlayback();
    setSpeechLoadingKey(null);
  }, [activeDelivery?.id, currentStory?.sessionId, currentStory?.title, stopSpeechPlayback]);

  const startSpeechRequest = useCallback(
    (params: PendingSpeechRequest & { text: string }) => {
      const text = params.text.trim();
      if (!text) {
        return;
      }

      if (mockOptions.forceMock) {
        setHint("当前是 Mock 时间线模式。切回真实模式并连接卡皮巴拉频道后，才可以真正朗读。");
        return;
      }

      if (speakingKey === params.key) {
        stopSpeechPlayback();
        return;
      }

      if (speakingKey && speakingKey !== params.key) {
        stopSpeechPlayback();
      }

      const cachedSrc = speechSrcCacheRef.current.get(params.key);
      if (cachedSrc) {
        setSpeechLoadingKey(null);
        setHint(null);
        void playSpeechDataUrl(params.key, cachedSrc);
        return;
      }

      const requestId = requestSpeech(params.scope, text);
      if (!requestId) {
        setHint("还没有连上卡皮巴拉频道，暂时不能朗读。");
        return;
      }

      speechRequestsRef.current.set(requestId, {
        key: params.key,
        scope: params.scope,
      });
      setSpeechLoadingKey(params.key);
      setHint("卡皮巴拉正在准备朗读...");
    },
    [mockOptions.forceMock, playSpeechDataUrl, requestSpeech, speakingKey, stopSpeechPlayback],
  );

  const handleSpeakLetter = useCallback(() => {
    if (!currentStory || !activeLetterSpeechKey) {
      return;
    }
    startSpeechRequest({
      key: activeLetterSpeechKey,
      scope: "letter",
      text: buildLetterSpeechText(currentStory),
    });
  }, [activeLetterSpeechKey, currentStory, startSpeechRequest]);

  const handleSpeakWord = useCallback(
    (card: StoryWordCard | null) => {
      if (!card) {
        return;
      }
      startSpeechRequest({
        key: `word:${card.id}`,
        scope: "word",
        text: buildWordSpeechText(card),
      });
    },
    [startSpeechRequest],
  );

  const updateJourney = (
    requestId: string,
    updater: (current: PendingJourneyState) => PendingJourneyState | null,
  ) => {
    setPendingJourney((current) => {
      if (!current || current.requestId !== requestId) {
        return current;
      }
      return updater(current);
    });
  };

  const startJourney = (requestId: string) => {
    clearJourneyTimers();
    setPendingJourney({
      requestId,
      phase: "wish-heard",
    });

    phaseTimeoutsRef.current = [
      window.setTimeout(() => {
        updateJourney(requestId, (current) => ({
          ...current,
          phase: "departing",
        }));
      }, 500),
      window.setTimeout(() => {
        updateJourney(requestId, (current) => ({
          ...current,
          phase: "researching",
        }));
      }, 1_300),
    ];
  };

  const submitWordReview = useCallback(
    (cardId: string, rating: StoryWordRating) => {
      if (!sessionId || reviewingWord) {
        return false;
      }

      setReviewingWord(true);
      const sent = sendReviewWord(cardId, rating);
      if (!sent) {
        setError("未连接到卡皮巴拉频道");
        setReviewingWord(false);
        return false;
      }
      return true;
    },
    [reviewingWord, sendReviewWord, sessionId],
  );

  const handleReviewWord = (rating: StoryWordRating) => {
    const activeCard = currentWordCards[activeWordIndex];
    if (!activeCard) {
      return;
    }

    const sent = submitWordReview(activeCard.id, rating);
    if (!sent) {
      return;
    }
    if (currentWordCards.length > 1) {
      setActiveWordIndex((current) => (current + 1) % currentWordCards.length);
    }
  };

  const handleVoiceButton = () => {
    if (voiceListening) {
      recognitionRef.current?.stop();
      return;
    }

    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setHint("当前浏览器暂不支持语音输入，这一版先用文字告诉卡皮巴拉。");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript?.trim() ?? "")
        .filter(Boolean)
        .join("");

      if (transcript) {
        setForm({ message: transcript });
      }
    };
    recognition.addEventListener("error", () => {
      setHint("这次语音没有听清，我们先继续用文字吧。");
      setVoiceListening(false);
    });
    recognition.onend = () => {
      setVoiceListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setHint("正在听你说话...");
    setVoiceListening(true);
    recognition.start();
  };

  const tomorrowWishOptions = useMemo(
    () =>
      buildTomorrowWishOptions({
        story: currentStory,
        environment: displaySession?.environment,
        learner: displaySession?.learnerProfile,
      }),
    [currentStory, displaySession?.environment, displaySession?.learnerProfile],
  );

  const openDeliveryExperience = useCallback((deliveryId: string) => {
    setHistoryOpen(false);
    setCurrentView("home");
    window.history.pushState(null, "", "/");
    setSelectedDeliveryId(deliveryId);
    setActiveWordIndex(0);
    setLetterOpen(false);
    window.requestAnimationFrame(() => {
      setLetterOpen(true);
    });
  }, []);

  const submitMessage = useCallback(
    (rawMessage?: string) => {
      if (mockOptions.forceMock) {
        if (rawMessage?.trim()) {
          setForm({ message: rawMessage.trim() });
        }
        setHint("当前正在查看时间线 Mock Data。切回真实模式后，就能真的把愿望交给卡皮巴拉。");
        return;
      }

      const message = (rawMessage ?? form.message).trim();
      if (!message || loading || bootstrapping) {
        return;
      }

      const requestId = crypto.randomUUID();
      const nextSessionId = sessionId ?? crypto.randomUUID();
      const optimisticEntry = {
        id: `user-${requestId}`,
        role: "user" as const,
        text: message,
        time: new Date().toISOString(),
      };

      setLoading(true);
      setError(null);
      setHint(null);
      setStreamPreview("");
      setForm({ message: "" });
      setSelectedDeliveryId(null);
      setSessionId(nextSessionId);
      setSession((current) => ({
        sessionId: nextSessionId,
        createdAt: current?.createdAt ?? optimisticEntry.time,
        updatedAt: optimisticEntry.time,
        status: "adventuring",
        currentStory: current?.currentStory ?? null,
        deliveryLog: current?.deliveryLog ?? [],
        history: [...(current?.history ?? []), optimisticEntry],
        wordBank: current?.wordBank ?? [],
        preferences: current?.preferences ?? DEFAULT_STORY_EXPERIENCE_SETTINGS,
        runtime: current?.runtime ?? DEFAULT_STORY_RUNTIME_CONFIG,
      }));
      startJourney(requestId);

      const sent = sendMessage(message);
      if (!sent) {
        resetJourney();
        setLoading(false);
        setError("未连接到卡皮巴拉频道，请稍后再试");
        if (import.meta.env.DEV) {
          setHint(DEV_BACKEND_HINT);
        }
      }
    },
    [
      bootstrapping,
      form.message,
      loading,
      mockOptions.forceMock,
      sendMessage,
      sessionId,
    ],
  );

  if (currentView === "review") {
    return (
      <ReviewPage
        wordBank={allWordCards}
        onRate={(cardId, rating) => {
          submitWordReview(cardId, rating);
        }}
        onBack={() => {
          setCurrentView("home");
          window.history.pushState(null, "", "/");
        }}
        onViewLetter={openDeliveryExperience}
      />
    );
  }

  if (currentView === "parent") {
    return (
      <ParentPage
        learnerName={displaySession?.learnerProfile?.name ?? "小朋友"}
        learnerAge={displaySession?.learnerProfile?.age ?? settings.age}
        englishLevel={resolveEnglishLevelOptionId(
          displaySession?.learnerProfile?.englishLevel ?? settings.englishLevelId,
        )}
        interests={displaySession?.learnerProfile?.interests ?? []}
        parentNote={displaySession?.environment?.parentNote ?? ""}
        deliveryTime={sessionPreferences.deliveryTime}
        wordBankSize={allWordCards.length}
        streakDays={displaySession?.history?.length ?? 0}
        onSaveProfile={(profile) => {
          setSettings({
            age: profile.age,
            englishLevelId: profile.englishLevel,
          });
          send({
            type: "update-profile",
            profile: {
              ...profile,
              englishLevel: buildEnglishLevelPayload(profile.englishLevel),
            },
          });
        }}
        onSavePreferences={(preferences) => {
          send({ type: "update-preferences", preferences });
        }}
        onSaveNote={(note) => {
          send({ type: "update-environment", environment: { parentNote: note } });
        }}
        onBack={() => {
          setCurrentView("home");
          window.history.pushState(null, "", "/");
        }}
      />
    );
  }

  if (currentView === "test") {
    return (
      <TestConfigPage
        deliveryTime={sessionPreferences.deliveryTime}
        runtime={sessionRuntime}
        onSaveRuntime={(runtime) => {
          send({ type: "update-runtime", runtime });
        }}
        onBack={() => {
          setCurrentView("home");
          window.history.pushState(null, "", "/");
        }}
      />
    );
  }

  const capybaraBubble = letterOpen ? (
    <div className="flex max-h-[min(60vh,33rem)] flex-col rounded-[1.9rem] border-4 border-stone-900 bg-[#fffdf6]/96 p-4 shadow-[8px_8px_0_0_#2b2118] backdrop-blur-md sm:p-5">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border-[3px] border-stone-900 bg-[#ffefbf] px-3 py-1 text-xs font-black text-stone-700 shadow-[2px_2px_0_0_#2b2118]">
            {currentStory?.title ?? "卡皮巴拉正在准备今天的来信"}
          </div>
          {currentStory ? (
            <button
              type="button"
              onClick={handleSpeakLetter}
              className="inline-flex items-center gap-2 rounded-full border-4 border-stone-900 bg-[#fff8e8] px-3 py-2 text-xs font-black text-stone-800 shadow-[3px_3px_0_0_#2b2118]"
            >
              <SpeakerIcon />
              {activeLetterSpeechState === "loading"
                ? "朗读中..."
                : activeLetterSpeechState === "playing"
                  ? "停止朗读"
                  : "朗读信件"}
            </button>
          ) : null}
        </div>
        <button
          aria-label="收起信件"
          className="grid h-9 w-9 place-items-center rounded-full border-4 border-stone-900 bg-[#fffdf6] font-black shadow-[3px_3px_0_0_#2b2118]"
          onClick={() => setLetterOpen(false)}
          type="button"
        >
          ×
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {currentStory ? (
          <>
            <div className="text-lg font-black text-stone-900">
              {currentStory.letter.greeting}
            </div>
            <LetterBody
              paragraphs={currentStory.letter.body}
              vocabularyCards={currentStory.vocabularyCards as VocabularyCard[] | undefined}
              onWordTap={(word) => {
                const idx = currentWordCards.findIndex((c) => c.word.toLowerCase() === word.toLowerCase());
                if (idx >= 0) {
                  setActiveWordIndex(idx);
                  handleSpeakWord(currentWordCards[idx] ?? null);
                }
              }}
            />
            <div className="mt-4 text-base font-semibold text-stone-800">
              {currentStory.letter.signoff}
            </div>
            <div className="mt-2 text-sm leading-7 text-stone-600">
              {currentStory.letter.postscript}
            </div>
          </>
        ) : (
          <section className="rounded-[1.4rem] border-4 border-stone-900 bg-[#fff8e8] p-4 shadow-[4px_4px_0_0_#2b2118]">
            <div className="text-base font-black text-stone-900">
              今天的信还没到
            </div>
            <div className="mt-3 space-y-3 text-sm leading-7 text-stone-700">
              <p>卡皮巴拉会在每天 {sessionPreferences.deliveryTime} 左右把新信送到。</p>
              <p>现在还没到今天的送信时间，所以首页先保持等待状态。</p>
              <p>如果你想回看以前的信，可以去右上角的历史会话里点开对应日期。</p>
            </div>
          </section>
        )}

        {currentStory?.research ? (
          <section className="mt-4 rounded-[1.4rem] border-4 border-stone-900 bg-[#fff8e8] p-4 shadow-[4px_4px_0_0_#2b2118]">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">真实线索</div>
            <div className="mt-2 space-y-2 text-sm leading-7 text-stone-700">
              <div className="font-semibold text-stone-800">{currentStory.research.title}</div>
              <p>{currentStory.research.summary}</p>
              <a
                className="inline-flex rounded-full border-4 border-stone-900 bg-[#fffdf6] px-4 py-2 font-black text-stone-800 shadow-[3px_3px_0_0_#2b2118]"
                href={currentStory.research.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                查看来源 · {currentStory.research.sourceLabel}
              </a>
            </div>
          </section>
        ) : null}

        {currentStory ? (
          <section className="mt-4 rounded-[1.4rem] border-4 border-stone-900 bg-[#fff4c7] p-4 shadow-[4px_4px_0_0_#2b2118]">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">
              明晚继续
            </div>
            <div className="mt-2 text-sm leading-7 text-stone-800">
              卡皮巴拉：明天你还想让我去找什么？如果你暂时没有想法，我先给你几个主意。
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {tomorrowWishOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={loading || bootstrapping}
                  onClick={() => submitMessage(option.text)}
                  className="inline-flex items-center gap-2 rounded-full border-4 border-stone-900 bg-[#fffdf6] px-3 py-2 text-xs font-black shadow-[3px_3px_0_0_#2b2118] disabled:opacity-60"
                >
                  <LetterIcon />
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  ) : (
    <button
      className="block w-full text-left"
      onClick={() => setLetterOpen(true)}
      type="button"
    >
      <div className="relative rounded-[1.9rem] border-4 border-stone-900 bg-[#fffdf6]/94 px-4 py-4 text-sm leading-7 shadow-[8px_8px_0_0_#2b2118] backdrop-blur-md sm:px-5 sm:text-[1.02rem]">
        {latestCapybaraMessage}
        <div
          className="absolute -bottom-4 h-0 w-0 -translate-x-1/2 border-l-[16px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-stone-900"
          style={{ left: "var(--bubble-tail-x, 50%)" }}
        />
        <div
          className="absolute -bottom-3 h-0 w-0 -translate-x-1/2 border-l-[12px] border-r-[9px] border-t-[16px] border-l-transparent border-r-transparent border-t-[#fffdf6]"
          style={{ left: "var(--bubble-tail-x, 50%)" }}
        />
      </div>
    </button>
  );

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-[#ead19d] text-stone-900">
      <StoryScenePanel
        bubble={capybaraBubble}
        bubbleMode={letterOpen ? "letter" : "compact"}
        className="h-[100dvh] w-full"
        presentation={pendingJourney ? { phase: pendingJourney.phase } : undefined}
        scene={displayScene}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,249,229,0.3)_0%,rgba(255,249,229,0.04)_34%,transparent_58%),linear-gradient(180deg,rgba(255,244,220,0.18)_0%,rgba(255,244,220,0.02)_28%,rgba(25,19,15,0.08)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[linear-gradient(180deg,rgba(255,249,238,0.42)_0%,rgba(255,249,238,0)_100%)]" />

      <header className="absolute left-4 right-4 top-4 z-20 flex items-start justify-between gap-4 sm:left-6 sm:right-6 sm:top-6">
        <section className="max-w-[min(56vw,20rem)] rounded-[1.55rem] border-4 border-stone-900/95 bg-[#fff8e6]/84 px-4 py-3 shadow-[8px_8px_0_0_#2b2118] backdrop-blur-md sm:px-5">
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-stone-500">
            Today's Letter
          </div>
          <h1 className="mt-1 text-xl font-black leading-tight sm:text-[1.65rem]">
            卡皮巴拉的来信
          </h1>
          <p className="mt-1 text-sm leading-6 text-stone-700">{displaySubtitle}</p>
        </section>

        <div className="flex items-start gap-3">
          <div className="rounded-full border-4 border-stone-900 bg-[#ffefbf] px-4 py-2 text-sm font-black text-stone-700 shadow-[4px_4px_0_0_#2b2118]">
            {displayStatus}
          </div>
          <button
            aria-label="历史会话"
            className={iconButtonClass(historyOpen)}
            onClick={() => setHistoryOpen(true)}
            type="button"
          >
            <HistoryIcon />
          </button>
          <button
            aria-label="词卡复习"
            className={iconButtonClass(false)}
            onClick={() => {
              setCurrentView("review");
              window.history.pushState(null, "", "/review");
            }}
            type="button"
          >
            <span className="text-base">📝</span>
          </button>
          <button
            aria-label="测试模式"
            className={iconButtonClass(false)}
            onClick={() => {
              setCurrentView("test");
              window.history.pushState(null, "", "/test");
            }}
            type="button"
          >
            <span className="text-base">🧪</span>
          </button>
        </div>
      </header>

      {letterOpen ? (
        <WordDock
          activeIndex={activeWordIndex}
          cards={currentWordCards}
          onReview={handleReviewWord}
          onSpeakWord={() => handleSpeakWord(activeWordCard)}
          reviewing={reviewingWord}
          speechState={activeWordSpeechState}
          totalBankCount={displaySession?.wordBank.length ?? 0}
        />
      ) : null}

      <section className="absolute inset-x-0 bottom-5 z-20 flex justify-center px-4 sm:bottom-6">
        <div className="w-full max-w-4xl">
          {latestUserMessage ? (
            <div className="mb-3 flex justify-center sm:justify-end">
              <div className="max-w-[min(84vw,24rem)] rounded-[1.7rem] border-4 border-stone-900 bg-[#ffe6a7]/94 px-4 py-3 text-sm leading-7 shadow-[6px_6px_0_0_#2b2118] backdrop-blur-sm">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">
                  {formatRelativeMomentLabel(latestUserMessage.time, effectiveNow)}
                </div>
                <div className="mt-1">{latestUserMessage.text}</div>
              </div>
            </div>
          ) : null}

          {hint ? (
            <div className="mb-3 rounded-[1.2rem] border-4 border-stone-900 bg-[#fff8e8]/95 px-4 py-2 text-sm font-semibold shadow-[4px_4px_0_0_#2b2118]">
              {hint}
            </div>
          ) : null}

          {error ? (
            <div className="mb-3 rounded-[1.2rem] border-4 border-stone-900 bg-[#ffd5c8]/95 px-4 py-2 text-sm font-semibold shadow-[4px_4px_0_0_#2b2118]">
              {error}
            </div>
          ) : null}

          <div className="mx-auto w-full max-w-3xl rounded-[2.2rem] border-4 border-stone-900 bg-[#fff8e8]/84 p-3 shadow-[10px_10px_0_0_#2b2118] backdrop-blur-md">
            <div className="flex items-center gap-3">
              <button
                aria-label="语音输入"
                className={[
                  "grid h-14 w-14 shrink-0 place-items-center rounded-full border-4 border-stone-900 shadow-[4px_4px_0_0_#2b2118] transition",
                  voiceListening ? "bg-[#ffe08a]" : "bg-[#fffdf6] hover:bg-[#fff7dc]",
                ].join(" ")}
                onClick={handleVoiceButton}
                type="button"
              >
                <MicIcon />
              </button>

              <input
                className="h-14 w-full rounded-full border-4 border-stone-900 bg-[#fffdf6] px-5 text-base outline-none shadow-[inset_0_-4px_0_rgba(43,33,24,0.12)]"
                onChange={(event) => setForm({ message: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitMessage();
                  }
                }}
                placeholder="告诉卡皮巴拉：明天我想听什么主题？"
                value={form.message}
              />

              <button
                aria-label="发送愿望"
                className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-4 border-stone-900 bg-[#ffcf6e] shadow-[4px_4px_0_0_#2b2118] transition hover:bg-[#ffd881] disabled:opacity-60"
                disabled={loading || bootstrapping}
                onClick={() => submitMessage()}
                type="button"
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      </section>

      <Drawer onClose={() => setHistoryOpen(false)} open={historyOpen} title="历史会话">
        {historySections.length === 0 ? (
          <div className="rounded-[1.5rem] border-4 border-dashed border-stone-900 bg-[#fffdf6] px-4 py-5 text-sm leading-7 text-stone-600">
            这里会按日期轴保留你和卡皮巴拉的完整会话，最新记录会在最上面。
          </div>
        ) : (
          <div className="space-y-5">
            {historySections.map((group, index) => (
              <section key={group.key} className="grid grid-cols-[6.6rem,1fr] gap-3">
                <div className="flex flex-col items-center">
                  <div className="rounded-[1.2rem] border-4 border-stone-900 bg-[#ffefbf] px-3 py-2 text-center text-xs font-black leading-5 text-stone-700 shadow-[3px_3px_0_0_#2b2118]">
                    {group.label}
                  </div>
                  {index < historySections.length - 1 ? (
                    <div className="mt-2 w-[5px] flex-1 rounded-full bg-stone-900/20" />
                  ) : null}
                </div>

                <div className="space-y-3">
                  {group.deliveries.map((delivery) => (
                    <button
                      key={delivery.id}
                      type="button"
                      onClick={() => openDeliveryExperience(delivery.id)}
                      className="block w-full rounded-[1.5rem] border-4 border-stone-900 bg-[#fff4c7] px-4 py-3 text-left shadow-[4px_4px_0_0_#2b2118] transition hover:bg-[#fff0b3]"
                    >
                      <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-stone-500">
                        <LetterIcon />
                        来信 · {formatTime(delivery.deliveredAt)}
                      </div>
                      <div className="mt-1 text-base font-black text-stone-900">
                        {delivery.story.title}
                      </div>
                      <div className="mt-1 text-sm leading-7 text-stone-700">
                        点开这封信，回看当时卡皮巴拉真正寄回来的内容。
                      </div>
                    </button>
                  ))}
                  {group.entries.map((entry) => (
                    <article
                      key={entry.id}
                      className={`rounded-[1.5rem] border-4 border-stone-900 px-4 py-3 text-sm leading-7 shadow-[4px_4px_0_0_#2b2118] ${
                        entry.role === "user"
                          ? "bg-[#ffe8ad]"
                          : entry.role === "capybara"
                            ? "bg-[#fffdf6]"
                            : "bg-[#f2ead8]"
                      }`}
                    >
                      {entry.role === "capybara" && deliveryIdsByHistoryEntryId.get(entry.id) ? (
                        <button
                          type="button"
                          onClick={() =>
                            openDeliveryExperience(deliveryIdsByHistoryEntryId.get(entry.id)!)
                          }
                          className="block w-full text-left"
                        >
                          <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-stone-500">
                            <LetterIcon />
                            卡皮巴拉 · {formatTime(entry.time)}
                          </div>
                          <div className="mt-1">{entry.text}</div>
                          <div className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-stone-500">
                            点开重现这封信
                          </div>
                        </button>
                      ) : (
                        <>
                          <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">
                            {entry.role === "user"
                              ? "你"
                              : entry.role === "capybara"
                                ? "卡皮巴拉"
                                : "旁白"}{" "}
                            · {formatTime(entry.time)}
                          </div>
                          <div className="mt-1">{entry.text}</div>
                        </>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Drawer>

      {(bootstrapping || loading) && !error ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-10 flex justify-center px-4 sm:bottom-32">
          <div className="rounded-full border-4 border-stone-900 bg-[#fff8e8]/92 px-4 py-2 text-sm font-black text-stone-700 shadow-[5px_5px_0_0_#2b2118] backdrop-blur-sm">
            {bootstrapping
              ? "卡皮巴拉正在写第一封欢迎信..."
              : "卡皮巴拉已经出发去找明天的线索了..."}
          </div>
        </div>
      ) : null}
    </main>
  );
}
