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
import { useCapybaraChannel } from "./useCapybaraChannel";

type SettingsState = {
  age: number;
  englishLevelId: string;
};

type PendingJourneyState = {
  requestId: string;
  phase: "wish-heard" | "departing" | "researching" | "returning";
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
  reviewing: boolean;
  totalBankCount: number;
};

function WordDock({
  cards,
  activeIndex,
  onReview,
  reviewing,
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
          <div className="text-2xl font-black text-stone-900">{activeCard.word}</div>
          <div className="mt-1 text-sm font-semibold text-stone-500">
            {activeCard.pronunciation}
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
  const [session, setSession] = useState<StorySessionSnapshot | null>(() =>
    readStoredJson<StorySessionSnapshot | null>(
      SESSION_CACHE_STORAGE_KEY,
      null,
      LEGACY_SESSION_CACHE_STORAGE_KEYS,
    ),
  );
  const [sessionId, setSessionId] = useState<string | null>(() =>
    mockOptions.sessionId ??
      readStoredJson<string | null>(SESSION_ID_STORAGE_KEY, null, LEGACY_SESSION_ID_STORAGE_KEYS),
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
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const phaseTimeoutsRef = useRef<number[]>([]);

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
    };
  }, []);

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

  const { connectionState, send, sendMessage, sendReviewWord } = useCapybaraChannel({
    enabled: !mockOptions.forceMock,
    url: WS_URL,
    age: settings.age,
    englishLevel: buildEnglishLevelPayload(settings.englishLevelId),
    sessionId,
    onSessionId: handleChannelSessionId,
    onSnapshot: handleChannelSnapshot,
    onDelta: handleChannelDelta,
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
            baseScene: currentStory?.scene ?? latestAvailableDelivery?.story.scene ?? null,
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

  const displayScene = activePreview?.scene ?? currentStory?.scene ?? IDLE_SCENE;
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

  const allWordCards = displaySession?.wordBank ?? [];
  const historyGroups = useMemo(
    () => groupHistoryByDate(displaySession?.history ?? []),
    [displaySession?.history],
  );
  const deliveriesByDate = useMemo(() => {
    const groups = new Map<string, StoryDeliveryRecord[]>();
    deliveryLog.forEach((entry) => {
      const key = toLocalDateKey(entry.deliveredAt);
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    });
    return groups;
  }, [deliveryLog]);

  useEffect(() => {
    setActiveWordIndex(0);
  }, [activeDelivery?.id, currentStory?.sessionId, currentStory?.title]);

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

  const submit = () => {
    if (mockOptions.forceMock) {
      setHint("当前正在查看时间线 Mock Data。切回真实模式后，就能真的把愿望交给卡皮巴拉。");
      return;
    }
    const message = form.message.trim();
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

  const openDeliveryExperience = useCallback((deliveryId: string) => {
    setSelectedDeliveryId(deliveryId);
    setActiveWordIndex(0);
    setLetterOpen(true);
    setHistoryOpen(false);
    setCurrentView("home");
    window.history.pushState(null, "", "/");
  }, []);

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
        <div className="inline-flex rounded-full border-[3px] border-stone-900 bg-[#ffefbf] px-3 py-1 text-xs font-black text-stone-700 shadow-[2px_2px_0_0_#2b2118]">
          {currentStory?.title ?? "卡皮巴拉正在准备今天的来信"}
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
                const idx = currentWordCards.findIndex(
                  (c) => c.word.toLowerCase() === word.toLowerCase(),
                );
                if (idx >= 0) setActiveWordIndex(idx);
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
          reviewing={reviewingWord}
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
                    void submit();
                  }
                }}
                placeholder="告诉卡皮巴拉：明天我想听什么主题？"
                value={form.message}
              />

              <button
                aria-label="发送愿望"
                className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-4 border-stone-900 bg-[#ffcf6e] shadow-[4px_4px_0_0_#2b2118] transition hover:bg-[#ffd881] disabled:opacity-60"
                disabled={loading || bootstrapping}
                onClick={() => void submit()}
                type="button"
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      </section>

      <Drawer onClose={() => setHistoryOpen(false)} open={historyOpen} title="历史会话">
        {historyGroups.length === 0 ? (
          <div className="rounded-[1.5rem] border-4 border-dashed border-stone-900 bg-[#fffdf6] px-4 py-5 text-sm leading-7 text-stone-600">
            这里会按日期轴保留你和卡皮巴拉的完整会话，最新记录会在最上面。
          </div>
        ) : (
          <div className="space-y-5">
            {historyGroups.map((group, index) => (
              <section key={group.key} className="grid grid-cols-[6.6rem,1fr] gap-3">
                <div className="flex flex-col items-center">
                  <div className="rounded-[1.2rem] border-4 border-stone-900 bg-[#ffefbf] px-3 py-2 text-center text-xs font-black leading-5 text-stone-700 shadow-[3px_3px_0_0_#2b2118]">
                    {group.label}
                  </div>
                  {index < historyGroups.length - 1 ? (
                    <div className="mt-2 w-[5px] flex-1 rounded-full bg-stone-900/20" />
                  ) : null}
                </div>

                <div className="space-y-3">
                  {(deliveriesByDate.get(group.key) ?? []).map((delivery) => (
                    <button
                      key={delivery.id}
                      type="button"
                      onClick={() => openDeliveryExperience(delivery.id)}
                      className="block w-full rounded-[1.5rem] border-4 border-stone-900 bg-[#fff4c7] px-4 py-3 text-left shadow-[4px_4px_0_0_#2b2118] transition hover:bg-[#fff0b3]"
                    >
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">
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
                      {entry.role === "capybara" && entry.sourceDeliveryId ? (
                        <button
                          type="button"
                          onClick={() => openDeliveryExperience(entry.sourceDeliveryId!)}
                          className="block w-full text-left"
                        >
                          <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">
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
