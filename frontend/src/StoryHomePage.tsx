import type {
  StorySessionSnapshot,
  StoryWordCard,
  StoryWordRating,
} from "@capybara-letter/shared";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PixelStoryStage } from "./PixelStoryStage";
import {
  AGE_OPTIONS,
  buildAdventurePreview,
  buildEnglishLevelPayload,
  DEFAULT_ENGLISH_LEVEL_ID,
  ENGLISH_LEVEL_OPTIONS,
  IDLE_LETTER,
  IDLE_SCENE,
  IDLE_TIMELINE,
  SESSION_CACHE_STORAGE_KEY,
  SESSION_ID_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  getEnglishLevelOption,
} from "./story-presets";
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

const WS_URL = import.meta.env.VITE_EDU_STORY_WS_URL ?? "ws://127.0.0.1:18820";

const DEV_BACKEND_HINT = [
  "本地开发时，请先启动 OpenClaw gateway：",
  "1. openclaw gateway run",
  "2. pnpm --filter @capybara-letter/frontend dev",
].join("\n");

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
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

function SettingsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 3l1.7 2.7 3.1.7-.8 3 2 2-2 2 .8 3-3.1.7L12 21l-1.7-2.7-3.1-.7.8-3-2-2 2-2-.8-3 3.1-.7L12 3Z" />
      <circle cx="12" cy="12" r="3" />
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
  setActiveIndex: (index: number) => void;
  onReview: (rating: StoryWordRating) => void;
  reviewing: boolean;
  totalBankCount: number;
};

function WordDock({
  cards,
  activeIndex,
  setActiveIndex,
  onReview,
  reviewing,
  totalBankCount,
}: WordDockProps) {
  const activeCard = cards[activeIndex] ?? null;

  if (!activeCard) {
    return null;
  }

  return (
    <aside className="absolute right-3 top-[5.5rem] z-20 w-[min(90vw,18rem)] sm:right-5 sm:top-28">
      <section className="rounded-[1.8rem] border-4 border-stone-900 bg-[#fff8ea]/90 p-4 shadow-[8px_8px_0_0_#2b2118] backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-stone-500">
              Word Cards
            </div>
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
          <div className="mt-3 flex gap-2">
            <button
              className="flex-1 rounded-full border-4 border-stone-900 bg-[#fffdf6] px-3 py-2 text-sm font-black shadow-[3px_3px_0_0_#2b2118]"
              onClick={() => setActiveIndex((activeIndex - 1 + cards.length) % cards.length)}
              type="button"
            >
              上一张
            </button>
            <button
              className="flex-1 rounded-full border-4 border-stone-900 bg-[#fffdf6] px-3 py-2 text-sm font-black shadow-[3px_3px_0_0_#2b2118]"
              onClick={() => setActiveIndex((activeIndex + 1) % cards.length)}
              type="button"
            >
              下一张
            </button>
          </div>
        ) : null}
      </section>
    </aside>
  );
}

export function StoryHomePage() {
  const [settings, setSettings] = useState<SettingsState>(() =>
    readStoredJson(SETTINGS_STORAGE_KEY, {
      age: 8,
      englishLevelId: DEFAULT_ENGLISH_LEVEL_ID,
    }),
  );
  const [session, setSession] = useState<StorySessionSnapshot | null>(() =>
    readStoredJson<StorySessionSnapshot | null>(SESSION_CACHE_STORAGE_KEY, null),
  );
  const [sessionId, setSessionId] = useState<string | null>(() =>
    readStoredJson<string | null>(SESSION_ID_STORAGE_KEY, null),
  );
  const [form, setForm] = useState({
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [reviewingWord, setReviewingWord] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [letterOpen, setLetterOpen] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [pendingJourney, setPendingJourney] = useState<PendingJourneyState | null>(null);
  const [bubbleAnchor, setBubbleAnchor] = useState({
    x: 260,
    y: 360,
  });
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const requestIdRef = useRef<string | null>(null);
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
      setLetterOpen(true);
      setLoading(false);
    });
  }, []);

  const handleChannelDelta = useCallback((_text: string) => {
    // streaming partial — could show typing indicator
  }, []);

  const handleChannelStatus = useCallback((state: "thinking" | "researching" | "composing" | "idle") => {
    if (state === "idle") {
      setLoading(false);
    }
  }, []);

  const handleChannelError = useCallback((message: string) => {
    setError(message);
    setLoading(false);
    resetJourney();
  }, []);

  const { connectionState, sendMessage, sendReviewWord } = useCapybaraChannel({
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

  const bootstrapping = connectionState === "connecting";

  const latestCapybaraMessage = useMemo(() => {
    if (loading && pendingJourney) {
      return "...";
    }
    return (
      [...(session?.history ?? [])].toReversed().find((entry) => entry.role === "capybara")?.text ??
      session?.currentStory?.messages.findLast((message) => message.speaker === "capybara")?.text ??
      IDLE_TIMELINE.tonightQuestion
    );
  }, [loading, pendingJourney, session]);

  const latestUserMessage = useMemo(
    () => [...(session?.history ?? [])].toReversed().find((entry) => entry.role === "user") ?? null,
    [session],
  );

  const selectedEnglishLevel = getEnglishLevelOption(settings.englishLevelId);
  const activePreview = useMemo(
    () =>
      pendingJourney
        ? buildAdventurePreview({
            phase: pendingJourney.phase,
            baseScene: session?.currentStory?.scene ?? null,
          })
        : null,
    [pendingJourney, session],
  );

  const currentStory = session?.currentStory ?? null;
  const displayScene = activePreview?.scene ?? currentStory?.scene ?? IDLE_SCENE;
  const displayStatus = pendingJourney
    ? "正在冒险"
    : session?.status === "adventuring"
      ? "正在冒险"
      : loading
        ? "正在回信"
        : "等你许愿";
  const displaySubtitle =
    currentStory?.subtitle ?? "每天晚上许愿，第二天早晨收到一封会继续成长的信。";

  const currentWordCards = useMemo(() => {
    if (!currentStory) {
      return [];
    }
    const wordBank = new Map(session?.wordBank.map((card) => [card.id, card]));
    return currentStory.vocabularyCards
      .map((card) => wordBank.get(normalizeWordKey(card.word)))
      .filter((card): card is StoryWordCard => Boolean(card));
  }, [currentStory, session]);

  useEffect(() => {
    setActiveWordIndex(0);
  }, [currentStory?.sessionId, currentStory?.title]);

  const stagePresentation = activePreview
    ? {
        phase: pendingJourney?.phase,
      }
    : {
        phase: currentStory ? ("delivered" as const) : ("idle" as const),
      };

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

    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    setHint(null);
    setForm({ message: "" });
    setSessionId(nextSessionId);
    setSession((current) => ({
      sessionId: nextSessionId,
      createdAt: current?.createdAt ?? optimisticEntry.time,
      updatedAt: optimisticEntry.time,
      status: "adventuring",
      currentStory: current?.currentStory ?? null,
      history: [...(current?.history ?? []), optimisticEntry],
      wordBank: current?.wordBank ?? [],
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

  const handleReviewWord = (rating: StoryWordRating) => {
    const activeCard = currentWordCards[activeWordIndex];
    if (!activeCard || !sessionId || reviewingWord) {
      return;
    }

    setReviewingWord(true);
    const sent = sendReviewWord(activeCard.id, rating);
    if (!sent) {
      setError("未连接到卡皮巴拉频道");
      setReviewingWord(false);
      return;
    }
    if (currentWordCards.length > 1) {
      setActiveWordIndex((current) => (current + 1) % currentWordCards.length);
    }
    setReviewingWord(false);
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

  const bubbleStyle = {
    left: `clamp(1rem, calc(${bubbleAnchor.x}px - 9rem), calc(100vw - min(72vw, 22rem) - 1rem))`,
    top: `max(6.5rem, calc(${bubbleAnchor.y}px - 10rem))`,
  };

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-[#ead19d] text-stone-900">
      <PixelStoryStage
        className="h-[100dvh] w-full rounded-none"
        onCapybaraAnchorChange={setBubbleAnchor}
        presentation={stagePresentation}
        scene={displayScene}
        showcase={currentStory?.pixelShowcase ?? []}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,249,229,0.3)_0%,rgba(255,249,229,0.04)_34%,transparent_58%),linear-gradient(180deg,rgba(255,244,220,0.18)_0%,rgba(255,244,220,0.02)_28%,rgba(25,19,15,0.08)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[linear-gradient(180deg,rgba(255,249,238,0.42)_0%,rgba(255,249,238,0)_100%)]" />

      <header className="absolute left-4 right-4 top-4 z-20 flex items-start justify-between gap-4 sm:left-6 sm:right-6 sm:top-6">
        <section className="max-w-[min(62vw,25rem)] rounded-[1.7rem] border-4 border-stone-900/95 bg-[#fff8e6]/82 px-4 py-3 shadow-[8px_8px_0_0_#2b2118] backdrop-blur-md sm:px-5">
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-stone-500">
            Capybara&apos;s Letter
          </div>
          <h1 className="mt-2 text-xl font-black leading-tight sm:text-[1.7rem]">卡皮巴拉的来信</h1>
          <p className="mt-2 text-sm leading-6 text-stone-700 sm:text-base">{displaySubtitle}</p>
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
            aria-label="设置"
            className={iconButtonClass(settingsOpen)}
            onClick={() => setSettingsOpen(true)}
            type="button"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      <button
        className="absolute z-20 max-w-[min(72vw,22rem)] text-left"
        onClick={() => setLetterOpen(true)}
        style={bubbleStyle}
        type="button"
      >
        <div className="relative rounded-[1.9rem] border-4 border-stone-900 bg-[#fffdf6]/94 px-4 py-4 text-sm leading-7 shadow-[8px_8px_0_0_#2b2118] backdrop-blur-md sm:px-5 sm:text-[1.02rem]">
          {latestCapybaraMessage}
          <div className="absolute -bottom-4 left-16 h-0 w-0 border-l-[16px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-stone-900" />
          <div className="absolute -bottom-3 left-[68px] h-0 w-0 border-l-[12px] border-r-[9px] border-t-[16px] border-l-transparent border-r-transparent border-t-[#fffdf6]" />
        </div>
      </button>

      <WordDock
        activeIndex={activeWordIndex}
        cards={currentWordCards}
        onReview={handleReviewWord}
        reviewing={reviewingWord}
        setActiveIndex={setActiveWordIndex}
        totalBankCount={session?.wordBank.length ?? 0}
      />

      <section className="absolute inset-x-0 bottom-5 z-20 flex justify-center px-4 sm:bottom-6">
        <div className="w-full max-w-4xl">
          {latestUserMessage ? (
            <div className="mb-3 flex justify-center sm:justify-end">
              <div className="max-w-[min(84vw,24rem)] rounded-[1.7rem] border-4 border-stone-900 bg-[#ffe6a7]/94 px-4 py-3 text-sm leading-7 shadow-[6px_6px_0_0_#2b2118] backdrop-blur-sm">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">
                  你刚刚说 · {formatTime(latestUserMessage.time)}
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
        {(session?.history.length ?? 0) === 0 ? (
          <div className="rounded-[1.5rem] border-4 border-dashed border-stone-900 bg-[#fffdf6] px-4 py-5 text-sm leading-7 text-stone-600">
            这里会按时间顺序保留你和卡皮巴拉的完整会话。
          </div>
        ) : (
          <div className="space-y-3">
            {session?.history.map((entry) => (
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
                <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">
                  {entry.role === "user" ? "你" : entry.role === "capybara" ? "卡皮巴拉" : "旁白"} ·{" "}
                  {formatTime(entry.time)}
                </div>
                <div className="mt-1">{entry.text}</div>
              </article>
            ))}
          </div>
        )}
      </Drawer>

      <Drawer onClose={() => setSettingsOpen(false)} open={settingsOpen} title="设置">
        <div className="space-y-5">
          <section className="rounded-[1.5rem] border-4 border-stone-900 bg-[#fffdf6] p-4 shadow-[4px_4px_0_0_#2b2118]">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">
              孩子信息
            </div>
            <div className="mt-4 grid gap-4">
              <label className="grid gap-2 text-sm">
                <span className="font-semibold text-stone-700">年龄</span>
                <select
                  className="rounded-[1rem] border-4 border-stone-900 bg-[#fff8e8] px-3 py-3"
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      age: Number.parseInt(event.target.value, 10),
                    }))
                  }
                  value={String(settings.age)}
                >
                  {AGE_OPTIONS.map((age) => (
                    <option key={age} value={age}>
                      {age} 岁
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm">
                <span className="font-semibold text-stone-700">英语等级</span>
                <select
                  className="rounded-[1rem] border-4 border-stone-900 bg-[#fff8e8] px-3 py-3"
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      englishLevelId: event.target.value,
                    }))
                  }
                  value={settings.englishLevelId}
                >
                  {ENGLISH_LEVEL_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-[1.5rem] border-4 border-stone-900 bg-[#fffdf6] p-4 shadow-[4px_4px_0_0_#2b2118]">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">
              产品说明
            </div>
            <div className="mt-3 space-y-3 text-sm leading-7 text-stone-700">
              <p>卡皮巴拉会在晚上接过孩子的愿望，第二天早晨寄回一封会带着真实线索的信。</p>
              <p>欢迎信和每日来信里的英文，会自动进入右侧单词卡，并按间隔复习逻辑继续安排复现。</p>
              <p>首页保持单线程体验，只保留像素场景、卡皮巴拉、最新一句话和输入框。</p>
            </div>
          </section>

          <section className="rounded-[1.5rem] border-4 border-stone-900 bg-[#fffdf6] p-4 shadow-[4px_4px_0_0_#2b2118]">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">
              等级标准
            </div>
            <div className="mt-3 space-y-3 text-sm leading-7 text-stone-700">
              <p>这版默认采用 Pearson GSE 儿童框架，并保留 CEFR 对应关系，方便后续长期连续量化。</p>
              <p>
                当前选择：{selectedEnglishLevel.label}，对应 {selectedEnglishLevel.summary}
              </p>
            </div>
          </section>

          <section className="rounded-[1.5rem] border-4 border-stone-900 bg-[#fffdf6] p-4 shadow-[4px_4px_0_0_#2b2118]">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">
              学习单词库
            </div>
            <div className="mt-3 text-sm leading-7 text-stone-700">
              已累计 {session?.wordBank.length ?? 0}{" "}
              个单词。后续可以继续扩展到儿童词库、四六级、考研、雅思、托福等不同词表层级。
            </div>
          </section>
        </div>
      </Drawer>

      <Drawer
        onClose={() => setLetterOpen(false)}
        open={letterOpen}
        title={currentStory?.kind === "welcome" ? "欢迎信" : "今日来信"}
      >
        <article className="rounded-[1.8rem] border-4 border-stone-900 bg-[#fffdf6] p-5 shadow-[4px_4px_0_0_#2b2118]">
          <div className="inline-flex rounded-full border-[3px] border-stone-900 bg-[#ffefbf] px-3 py-1 text-xs font-black text-stone-700 shadow-[2px_2px_0_0_#2b2118]">
            {currentStory?.title ?? "卡皮巴拉的来信"}
          </div>
          <div className="mt-4 text-lg font-black text-stone-900">
            {currentStory?.letter.greeting ?? IDLE_LETTER.greeting}
          </div>
          <div className="mt-4 space-y-4 text-base leading-8 text-stone-700">
            {(currentStory?.letter.body ?? IDLE_LETTER.body).map((paragraph, index) => (
              <p key={`${paragraph}-${index}`}>{paragraph}</p>
            ))}
          </div>
          <div className="mt-5 text-base font-semibold text-stone-800">
            {currentStory?.letter.signoff ?? IDLE_LETTER.signoff}
          </div>
          <div className="mt-2 text-sm leading-7 text-stone-600">
            {currentStory?.letter.postscript ?? IDLE_LETTER.postscript}
          </div>
        </article>

        <section className="mt-5 rounded-[1.6rem] border-4 border-stone-900 bg-[#fff8e8] p-4 shadow-[4px_4px_0_0_#2b2118]">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">
            来信节奏
          </div>
          <div className="mt-3 space-y-3 text-sm leading-7 text-stone-700">
            <p>{currentStory?.timeline.tonightQuestion ?? IDLE_TIMELINE.tonightQuestion}</p>
            <p>{currentStory?.timeline.capybaraPromise ?? IDLE_TIMELINE.capybaraPromise}</p>
            <p>{currentStory?.timeline.morningDelivery ?? IDLE_TIMELINE.morningDelivery}</p>
          </div>
        </section>

        {currentStory?.research ? (
          <section className="mt-5 rounded-[1.6rem] border-4 border-stone-900 bg-[#fff8e8] p-4 shadow-[4px_4px_0_0_#2b2118]">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">
              真实线索
            </div>
            <div className="mt-3 space-y-2 text-sm leading-7 text-stone-700">
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
