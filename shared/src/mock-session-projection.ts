import {
  DEFAULT_STORY_EXPERIENCE_SETTINGS,
  DEFAULT_STORY_RUNTIME_CONFIG,
  type ConversationEntry,
  type StoryScene,
  type StorySessionSnapshot,
  type StoryDeliveryRecord,
  type StoryTurnResponse,
  type StoryWordCard,
  type StoryWordRating,
  type StudyCardScheduler,
  type VocabularyCard,
} from "./types.js";

export type RawVocabularyCard = {
  word: string;
  pronunciation: string;
  meaningZh: string;
  partOfSpeech: string;
  example: string;
  exampleZh: string;
  tapHint: string;
};

export type RawLetterDelivery = {
  time: string;
  agentReasoning: {
    wishInfluence?: string;
    environmentInfluence?: string;
    topicChoice?: string;
  };
  letter: {
    greeting: string;
    body: string[];
    signoff: string;
    postscript: string;
  };
  vocabularyCards: RawVocabularyCard[];
  research: {
    title: string;
    summary: string;
    sourceUrl: string;
    sourceLabel: string;
  } | null;
  scene: {
    background: string;
    actors: string[];
    mood: string;
  };
};

export type RawReviewSession = {
  dueCards: string[];
  results: Array<{
    cardId: string;
    rating: StoryWordRating;
  }>;
} | null;

export type RawDay = {
  date: string;
  weekday: string;
  environment: {
    weather?: {
      condition: string;
      tempHigh: number;
      tempLow: number;
    };
    event?: string | null;
    parentNote?: string | null;
  };
  eveningWish: {
    time: string;
    childText: string;
    capybaraReply: string;
  } | null;
  chat: Array<{
    speaker: "child" | "capybara";
    text: string;
    time: string;
  }> | null;
  letterDelivery: RawLetterDelivery;
  reviewSession: RawReviewSession;
};

export type RawMockTimeline = {
  learnerProfile: {
    name: string;
    age: number;
    englishLevel: string;
    interests: string[];
    gseRange?: string;
    cefrLevel?: string;
  };
  week: RawDay[];
};

export const DEFAULT_MOCK_TIMELINE_SESSION_ID = "mock-timeline-session";

export type MockTimelineScenePhase = "idle" | "delivered" | "researching";
export type MockTimelineBuildBaseScene = (phase: MockTimelineScenePhase) => StoryScene;

function normalizeWordKey(word: string): string {
  return `word:${word.trim().toLowerCase().replace(/\s+/g, "-")}`;
}

function cloneScene(scene: StoryScene): StoryScene {
  return typeof structuredClone === "function"
    ? structuredClone(scene)
    : (JSON.parse(JSON.stringify(scene)) as StoryScene);
}

function toIsoOrFallback(value: string | undefined, fallback: string) {
  return value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toISOString()
    : new Date(fallback).toISOString();
}

function normalizeIsoUtc(value: string, fallback: string): string {
  return Number.isFinite(new Date(value).getTime())
    ? new Date(value).toISOString()
    : new Date(fallback).toISOString();
}

function buildScheduler(params: {
  firstSeenAt: string;
  lastSeenAt: string;
  lastRating: StoryWordRating | null;
}): StudyCardScheduler {
  const lastReview = params.lastRating ? params.lastSeenAt : null;
  const dueBase = new Date(params.lastSeenAt).getTime();
  const due =
    params.lastRating === "easy"
      ? new Date(dueBase + 4 * 24 * 60 * 60 * 1000).toISOString()
      : params.lastRating === "good"
        ? new Date(dueBase + 2 * 24 * 60 * 60 * 1000).toISOString()
        : params.lastRating === "hard"
          ? new Date(dueBase + 24 * 60 * 60 * 1000).toISOString()
          : params.lastRating === "again"
            ? new Date(dueBase + 10 * 60 * 1000).toISOString()
            : params.lastSeenAt;

  return {
    due,
    stability: params.lastRating ? 1 : 0,
    // Keep unseen mock cards compatible with FSRS' "new card" state.
    difficulty: params.lastRating ? (params.lastRating === "hard" ? 7 : params.lastRating === "easy" ? 3 : 5) : 0,
    elapsedDays: 0,
    scheduledDays:
      params.lastRating === "easy"
        ? 4
        : params.lastRating === "good"
          ? 2
          : params.lastRating === "hard"
            ? 1
            : 0,
    learningSteps: params.lastRating ? 1 : 0,
    reps: params.lastRating ? 1 : 0,
    lapses: params.lastRating === "again" ? 1 : 0,
    state: params.lastRating ? "Review" : "New",
    lastReview,
  };
}

function toMood(rawMood: string): StoryScene["mood"] {
  if (/dramatic|exciting|launch|space/i.test(rawMood)) {
    return "excited";
  }
  if (/wonder|discovery|curious/i.test(rawMood)) {
    return "curious";
  }
  if (/quiet|sleep/i.test(rawMood)) {
    return "sleepy";
  }
  return "warm";
}

function backgroundPalette(background: string) {
  if (background.includes("asteroid") || background.includes("space")) {
    return {
      skyTop: "#132447",
      skyMid: "#2b4a7f",
      skyBottom: "#485f95",
      water: "#2a4763",
      glow: "#f9dd87",
      leafMid: "#6878a2",
      leafDark: "#1d2c43",
      shore: "#4e5f7f",
      shoreLight: "#7b8aad",
      mist: "#bcc8ef",
    };
  }

  if (background.includes("museum")) {
    return {
      skyTop: "#514536",
      skyMid: "#7d6d52",
      skyBottom: "#bca27b",
      water: "#72654c",
      glow: "#ffd18b",
      leafMid: "#9c8465",
      leafDark: "#3b3125",
      shore: "#5e5240",
      shoreLight: "#857057",
      mist: "#e6d8bf",
    };
  }

  if (background.includes("rainy")) {
    return {
      skyTop: "#34486d",
      skyMid: "#5f7da5",
      skyBottom: "#9ba9bf",
      water: "#4f6885",
      glow: "#f2d18b",
      leafMid: "#71806c",
      leafDark: "#34483f",
      shore: "#556055",
      shoreLight: "#7a8878",
      mist: "#dce4ef",
    };
  }

  if (background.includes("launch")) {
    return {
      skyTop: "#5f7da5",
      skyMid: "#f1a96e",
      skyBottom: "#f7d8a1",
      water: "#7f6c58",
      glow: "#ffd17f",
      leafMid: "#8d6c55",
      leafDark: "#4f3a2f",
      shore: "#7d614d",
      shoreLight: "#ad886b",
      mist: "#f7e8cf",
    };
  }

  if (background.includes("prehistoric")) {
    return {
      skyTop: "#557f62",
      skyMid: "#7ba16d",
      skyBottom: "#c3d09f",
      water: "#5a8367",
      glow: "#f6da88",
      leafMid: "#6f975a",
      leafDark: "#35563b",
      shore: "#62724a",
      shoreLight: "#839c61",
      mist: "#e0edd7",
    };
  }

  return {
    skyTop: "#6d8dbf",
    skyMid: "#9ebae1",
    skyBottom: "#f0dec8",
    water: "#5b83b3",
    glow: "#ffd27a",
    leafMid: "#4e7950",
    leafDark: "#35583b",
    shore: "#6e8053",
    shoreLight: "#8ea66b",
    mist: "#eef5ff",
  };
}

function createDefaultBaseScene(phase: MockTimelineScenePhase): StoryScene {
  return {
    title: "Capybara's Journey",
    mood: phase === "researching" ? "curious" : "warm",
    palette: [
      { id: "skyTop", value: "#6d8dbf" },
      { id: "skyMid", value: "#9ebae1" },
      { id: "skyBottom", value: "#f0dec8" },
      { id: "water", value: "#5b83b3" },
      { id: "glow", value: "#ffd27a" },
      { id: "leafMid", value: "#4e7950" },
      { id: "leafDark", value: "#35583b" },
      { id: "shore", value: "#6e8053" },
      { id: "shoreLight", value: "#8ea66b" },
      { id: "mist", value: "#eef5ff" },
    ],
    layers: [],
    actors: [
      {
        id: "capybara",
        kind: "capybara",
        x: 46,
        y: 74,
        size: 24,
        facing: "right",
        motion: phase === "researching" ? "search" : "deliver",
      },
    ],
    prompt: "Capybara is exploring and writing a letter.",
    motionCue:
      phase === "researching"
        ? "Capybara is searching for clues."
        : "Capybara is back with today's letter.",
  };
}

function buildMockScene(params: {
  day: RawDay;
  phase: MockTimelineScenePhase;
  buildBaseScene?: MockTimelineBuildBaseScene;
}) {
  const createBaseScene = params.buildBaseScene ?? createDefaultBaseScene;
  const base = cloneScene(createBaseScene(params.phase));
  const palette = backgroundPalette(params.day.letterDelivery.scene.background);
  const scene = {
    ...base,
    title:
      params.day.letterDelivery.agentReasoning.topicChoice ??
      params.day.letterDelivery.scene.background,
    mood: toMood(params.day.letterDelivery.scene.mood),
    prompt: `${params.day.letterDelivery.scene.background} / ${params.day.letterDelivery.scene.actors.join(", ")}`,
    motionCue:
      params.phase === "researching"
        ? "Capybara is still on the road while the scene keeps moving."
        : "Capybara has returned with clues and the scene feels alive.",
  };

  scene.palette = scene.palette.map((entry) => {
    if (entry.id in palette) {
      return {
        ...entry,
        value: palette[entry.id as keyof typeof palette],
      };
    }
    return entry;
  });

  if (!scene.palette.some((entry) => entry.id === "skyTop")) {
    scene.palette.push({ id: "skyTop", value: palette.skyTop });
  }
  if (!scene.palette.some((entry) => entry.id === "skyMid")) {
    scene.palette.push({ id: "skyMid", value: palette.skyMid });
  }
  if (!scene.palette.some((entry) => entry.id === "skyBottom")) {
    scene.palette.push({ id: "skyBottom", value: palette.skyBottom });
  }

  scene.actors = scene.actors.map((actor) =>
    actor.kind === "capybara"
      ? {
          ...actor,
          motion:
            params.phase === "researching"
              ? "search"
              : params.day.letterDelivery.scene.background.includes("launch")
                ? "listen"
                : "deliver",
        }
      : actor,
  );

  return scene;
}

function storyTitle(day: RawDay, index: number) {
  const topic = day.letterDelivery.agentReasoning.topicChoice?.split(/[\u2014-]/)[0]?.trim();
  if (topic) {
    return `\u5361\u76ae\u5df4\u62c9\u7684${topic}\u6765\u4fe1`;
  }
  return index === 0
    ? "\u5361\u76ae\u5df4\u62c9\u7684\u7b2c\u4e00\u5c01\u6b22\u8fce\u4fe1"
    : `\u5361\u76ae\u5df4\u62c9\u7684\u7b2c ${index + 1} \u5c01\u6765\u4fe1`;
}

function storySubtitle(day: RawDay) {
  const parts = [day.weekday];
  if (day.environment.weather?.condition) {
    parts.push(day.environment.weather.condition);
  }
  if (day.environment.event) {
    parts.push(day.environment.event);
  }
  return parts.join(" \u00b7 ");
}

function buildTaskChoices(cards: VocabularyCard[]) {
  const fallback = cards.slice(0, 3).map((card) => card.meaningZh);
  while (fallback.length < 3) {
    fallback.push(`\u63d0\u793a ${fallback.length + 1}`);
  }
  const focus = cards[0];
  return fallback.map((label, index) => ({
    id: `choice-${index + 1}`,
    label,
    feedback:
      index === 0 && focus
        ? `\u5bf9\u5566\uff0c${focus.word} \u7684\u610f\u601d\u662f ${focus.meaningZh}\u3002`
        : "\u8fd9\u6b21\u4e0d\u662f\u8fd9\u4e2a\uff0c\u518d\u770b\u770b\u4fe1\u91cc\u7684\u8bcd\u5361\u3002",
    correct: index === 0,
  }));
}

function buildStoryFromDay(params: {
  day: RawDay;
  index: number;
  totalDays: number;
  profile: RawMockTimeline["learnerProfile"];
  previousCards: VocabularyCard[];
  sessionId: string;
  buildBaseScene?: MockTimelineBuildBaseScene;
}) {
  const cardsSource =
    params.day.letterDelivery.vocabularyCards.length > 0
      ? params.day.letterDelivery.vocabularyCards
      : params.previousCards.slice(-4);
  const vocabularyCards: VocabularyCard[] = cardsSource.slice(0, 6).map((card, index) => ({
    ...card,
    id: `vocab-${params.index + 1}-${index + 1}`,
  }));
  const spotlight = vocabularyCards[0] ?? {
    id: "vocab-fallback-1",
    word: "letter",
    pronunciation: "/\u02c8let\u0259r/",
    meaningZh: "\u4fe1",
    partOfSpeech: "noun",
    tapHint: "Tap the word and read it with Capybara.",
    example: "A letter can carry a story.",
    exampleZh: "\u4e00\u5c01\u4fe1\u53ef\u4ee5\u5e26\u6765\u4e00\u4e2a\u6545\u4e8b\u3002",
  };
  const phase = params.index === params.totalDays - 1 ? "delivered" : "delivered";

  return {
    sessionId: params.sessionId,
    source: "openclaw-gateway",
    kind: params.index === 0 ? "welcome" : "lesson",
    ageBand: params.profile.age <= 5 ? "3-5" : params.profile.age <= 6 ? "5-6" : "6-8",
    title: storyTitle(params.day, params.index),
    subtitle: storySubtitle(params.day),
    deliveryMode:
      params.profile.age <= 5 || vocabularyCards.length <= 3 ? "word-focus" : "letter-story",
    plan: {
      topic:
        params.day.letterDelivery.agentReasoning.topicChoice ??
        params.day.letterDelivery.research?.title ??
        params.day.weekday,
      researchQuery:
        params.day.letterDelivery.research?.title ??
        params.day.eveningWish?.childText ??
        params.day.weekday,
      tomorrowPromise:
        params.day.eveningWish?.capybaraReply ??
        "\u4eca\u665a\u6211\u4f1a\u7ee7\u7eed\u53bb\u627e\u65b0\u7684\u7ebf\u7d22\uff0c\u660e\u5929\u518d\u628a\u5b83\u4eec\u5199\u8fdb\u4fe1\u91cc\u3002",
      storyAngle:
        params.day.letterDelivery.agentReasoning.topicChoice ??
        "\u5361\u76ae\u5df4\u62c9\u628a\u4eca\u5929\u7684\u89c1\u95fb\u5199\u8fdb\u4e00\u5c01\u4f1a\u7ee7\u7eed\u751f\u957f\u7684\u4fe1\u91cc\u3002",
      capybaraMood: buildMockScene({
        day: params.day,
        phase,
        buildBaseScene: params.buildBaseScene,
      }).mood,
      learningGoal:
        vocabularyCards.length > 0
          ? `\u8ba4\u8bc6 ${vocabularyCards.map((card) => card.word).join(" / ")} \u8fd9\u4e9b\u8bcd\uff0c\u5e76\u628a\u5b83\u4eec\u653e\u8fdb\u4eca\u5929\u7684\u6545\u4e8b\u91cc\u3002`
          : "\u56de\u987e\u8fd9\u4e00\u5468\u91cc\u5b66\u8fc7\u7684\u91cd\u70b9\u8bcd\u6c47\u548c\u6545\u4e8b\u3002",
      englishFocus:
        vocabularyCards.length > 0
          ? vocabularyCards.slice(0, 6).map((card) => card.word)
          : ["review", "remember", "letter"],
      reasoning: [
        params.day.letterDelivery.agentReasoning.wishInfluence,
        params.day.letterDelivery.agentReasoning.environmentInfluence,
        params.day.letterDelivery.agentReasoning.topicChoice,
      ]
        .filter(Boolean)
        .join(" "),
    },
    research: params.day.letterDelivery.research
      ? {
          query:
            params.day.letterDelivery.agentReasoning.topicChoice ??
            params.day.eveningWish?.childText ??
            params.day.letterDelivery.research.title,
          ...params.day.letterDelivery.research,
        }
      : null,
    timeline: {
      tonightQuestion: params.day.eveningWish?.childText
        ? `\u6628\u665a\u4f60\u8bf4\uff1a\u201c${params.day.eveningWish.childText}\u201d`
        : "\u4eca\u665a\u4f60\u60f3\u8ba9\u5361\u76ae\u5df4\u62c9\u660e\u5929\u53bb\u54ea\u91cc\u5462\uff1f",
      capybaraPromise:
        params.day.eveningWish?.capybaraReply ??
        "\u5361\u76ae\u5df4\u62c9\u4f1a\u5e26\u7740\u4f60\u7684\u95ee\u9898\uff0c\u5728\u591c\u91cc\u51fa\u53d1\u3002",
      morningDelivery: `${params.day.letterDelivery.time} \u9001\u8fbe\u4eca\u5929\u7684\u6765\u4fe1\u3002`,
    },
    scene: buildMockScene({
      day: params.day,
      phase,
      buildBaseScene: params.buildBaseScene,
    }),
    narration: params.day.letterDelivery.letter.body.slice(0, 2).join(" "),
    wordSpotlight: {
      focusWord: spotlight.word,
      pronunciation: spotlight.pronunciation,
      meaningZh: spotlight.meaningZh,
      tapHint: spotlight.tapHint,
      echoLine: spotlight.example,
    },
    vocabularyCards,
    letter: {
      ...params.day.letterDelivery.letter,
      body: params.day.letterDelivery.letter.body.slice(0, 6),
    },
    messages: [
      {
        id: `msg-${params.index + 1}-1`,
        speaker: "capybara",
        text:
          params.day.eveningWish?.capybaraReply ??
          params.day.letterDelivery.letter.body[0] ??
          "\u4eca\u5929\u7684\u4fe1\u5df2\u7ecf\u5199\u597d\u5566\u3002",
      },
      {
        id: `msg-${params.index + 1}-2`,
        speaker: "narrator",
        text:
          params.day.letterDelivery.research?.summary ??
          params.day.letterDelivery.letter.body[1] ??
          "\u5361\u76ae\u5df4\u62c9\u628a\u4eca\u5929\u7684\u53d1\u73b0\u8f7b\u8f7b\u653e\u8fdb\u4e86\u4fe1\u5c01\u3002",
      },
    ],
    task: {
      promptZh: "\u4eca\u5929\u4fe1\u91cc\u6700\u91cd\u8981\u7684\u8bcd\u662f\u54ea\u4e00\u4e2a\uff1f",
      instructionZh: "\u9009\u51fa\u6700\u5bf9\u7684\u4e00\u9879\u3002",
      vocabulary:
        vocabularyCards.length > 0
          ? vocabularyCards.slice(0, 3).map((card) => card.word)
          : ["review", "remember", "letter"],
      rewardText: "\u7b54\u5bf9\u5566\uff0c\u8fd9\u4e2a\u8bcd\u5df2\u7ecf\u88ab\u4f60\u653e\u8fdb\u4eca\u5929\u7684\u8bb0\u5fc6\u91cc\u4e86\u3002",
      choices: buildTaskChoices(vocabularyCards),
    },
    suggestedReply:
      params.index + 1 < params.totalDays
        ? "\u660e\u5929\u6211\u8fd8\u60f3\u542c\u65b0\u7684\u6545\u4e8b\u3002"
        : "\u660e\u5929\u6211\u8fd8\u60f3\u542c\u65b0\u7684\u6545\u4e8b\u3002",
  } satisfies StoryTurnResponse;
}

function pushHistoryEntry(list: ConversationEntry[], entry: ConversationEntry) {
  if (list.some((item) => item.id === entry.id)) {
    return;
  }
  list.push(entry);
}

export function pickDefaultMockMoment(days: RawDay[]): string | null {
  for (const day of [...days].toReversed()) {
    if (day.letterDelivery.vocabularyCards.length > 0) {
      return day.letterDelivery.time;
    }
  }

  return [...days]
    .map((day) => day.letterDelivery.time)
    .filter(Boolean)
    .toReversed()[0] ?? null;
}

export function buildTimelineMockSession(params: {
  timeline: RawMockTimeline;
  nowIso?: string;
  sessionId?: string;
  buildBaseScene?: MockTimelineBuildBaseScene;
}): StorySessionSnapshot {
  const { timeline } = params;
  const sessionId = params.sessionId ?? DEFAULT_MOCK_TIMELINE_SESSION_ID;
  const days = timeline.week;
  const allMoments = days.flatMap((day) => [
    day.eveningWish?.time,
    ...(day.chat?.map((entry) => entry.time) ?? []),
    day.letterDelivery.time,
  ]);
  const firstMoment = allMoments.find(Boolean) ?? new Date().toISOString();
  const lastMoment = [...allMoments].toReversed().find(Boolean) ?? firstMoment;
  const preferredMoment = pickDefaultMockMoment(days) ?? lastMoment;
  const actualNow = new Date().toISOString();
  const effectiveNow =
    params.nowIso && Number.isFinite(new Date(params.nowIso).getTime())
      ? params.nowIso
      : actualNow >= firstMoment && actualNow <= lastMoment
        ? actualNow
        : preferredMoment;

  const history: ConversationEntry[] = [];
  const wordBank = new Map<string, StoryWordCard>();
  const deliveryLog: StoryDeliveryRecord[] = [];
  let currentStory: StoryTurnResponse | null = null;
  let updatedAt = firstMoment;
  let previousCards: VocabularyCard[] = [];
  let latestWishTime = "";
  let latestDeliveryTime = "";

  days.forEach((day, index) => {
    const deliveryTime = toIsoOrFallback(day.letterDelivery.time, updatedAt);

    if (day.eveningWish && day.eveningWish.time <= effectiveNow) {
      latestWishTime = day.eveningWish.time;
      updatedAt = day.eveningWish.time;
      pushHistoryEntry(history, {
        id: `wish-${index + 1}-child`,
        role: "user",
        text: day.eveningWish.childText,
        time: day.eveningWish.time,
      });
      pushHistoryEntry(history, {
        id: `wish-${index + 1}-capybara`,
        role: "capybara",
        text: day.eveningWish.capybaraReply,
        time: day.eveningWish.time,
      });
    }

    (day.chat ?? []).forEach((chatEntry, chatIndex) => {
      if (chatEntry.time > effectiveNow) {
        return;
      }
      updatedAt = chatEntry.time;
      pushHistoryEntry(history, {
        id: `chat-${index + 1}-${chatIndex + 1}`,
        role: chatEntry.speaker === "child" ? "user" : "capybara",
        text: chatEntry.text,
        time: chatEntry.time,
      });
    });

    if (deliveryTime > effectiveNow) {
      return;
    }

    latestDeliveryTime = deliveryTime;
    updatedAt = deliveryTime;
    const story = buildStoryFromDay({
      day,
      index,
      totalDays: days.length,
      profile: timeline.learnerProfile,
      previousCards,
      sessionId,
      buildBaseScene: params.buildBaseScene,
    });
    currentStory = story;
    deliveryLog.push({
      id: `mock-delivery-${index + 1}`,
      deliveredAt: deliveryTime,
      story,
    });
    previousCards = [...previousCards, ...story.vocabularyCards];

    story.messages.forEach((message, messageIndex) => {
      pushHistoryEntry(history, {
        id: `delivery-${index + 1}-${messageIndex + 1}`,
        role: message.speaker,
        text: message.text,
        time: deliveryTime,
        sourceDeliveryId: `mock-delivery-${index + 1}`,
      });
    });

    story.vocabularyCards.forEach((card) => {
      const wordId = normalizeWordKey(card.word);
      const existing = wordBank.get(wordId);
      wordBank.set(wordId, {
        ...card,
        id: wordId,
        sourceSessionId: sessionId,
        sourceTitle: story.title,
        sourceDeliveryId: `mock-delivery-${index + 1}`,
        encounterCount: (existing?.encounterCount ?? 0) + 1,
        firstSeenAt: existing?.firstSeenAt ?? deliveryTime,
        lastSeenAt: deliveryTime,
        lastRating: existing?.lastRating ?? null,
        scheduler: buildScheduler({
          firstSeenAt: existing?.firstSeenAt ?? deliveryTime,
          lastSeenAt: deliveryTime,
          lastRating: existing?.lastRating ?? null,
        }),
      });
    });

    if (day.reviewSession?.results?.length) {
      const reviewTime = new Date(new Date(deliveryTime).getTime() + 60 * 60 * 1000).toISOString();
      day.reviewSession.results.forEach((result) => {
        const card = wordBank.get(result.cardId);
        if (!card) {
          return;
        }
        wordBank.set(result.cardId, {
          ...card,
          lastSeenAt: reviewTime,
          lastRating: result.rating,
          scheduler: buildScheduler({
            firstSeenAt: card.firstSeenAt,
            lastSeenAt: reviewTime,
            lastRating: result.rating,
          }),
        });
      });
      updatedAt = reviewTime <= effectiveNow ? reviewTime : updatedAt;
    }
  });

  const status =
    latestWishTime && (!latestDeliveryTime || latestWishTime > latestDeliveryTime)
      ? "adventuring"
      : "replying";

  return {
    sessionId,
    createdAt: normalizeIsoUtc(firstMoment, new Date().toISOString()),
    updatedAt: normalizeIsoUtc(updatedAt, firstMoment),
    status,
    currentStory,
    deliveryLog,
    history: history
      .map((entry) => ({
        ...entry,
        time: normalizeIsoUtc(entry.time, updatedAt),
      }))
      .toSorted((left, right) => left.time.localeCompare(right.time)),
    wordBank: [...wordBank.values()]
      .map((card) => ({
        ...card,
        firstSeenAt: normalizeIsoUtc(card.firstSeenAt, updatedAt),
        lastSeenAt: normalizeIsoUtc(card.lastSeenAt, updatedAt),
        scheduler: {
          ...card.scheduler,
          due: normalizeIsoUtc(card.scheduler.due, updatedAt),
          lastReview: card.scheduler.lastReview
            ? normalizeIsoUtc(card.scheduler.lastReview, updatedAt)
            : null,
        },
      }))
      .toSorted((left, right) => left.lastSeenAt.localeCompare(right.lastSeenAt)),
    environment: {
      weather: days.findLast((day) => day.letterDelivery.time <= effectiveNow)?.environment.weather,
      event:
        days.findLast((day) => day.letterDelivery.time <= effectiveNow)?.environment.event ??
        undefined,
      parentNote:
        days.findLast((day) => day.letterDelivery.time <= effectiveNow)?.environment.parentNote ??
        undefined,
    },
    learnerProfile: {
      name: timeline.learnerProfile.name,
      age: timeline.learnerProfile.age,
      englishLevel: timeline.learnerProfile.englishLevel,
      interests: timeline.learnerProfile.interests,
    },
    preferences: DEFAULT_STORY_EXPERIENCE_SETTINGS,
    runtime: params.nowIso
      ? {
          mode: "test",
          simulatedNow: normalizeIsoUtc(params.nowIso, updatedAt),
        }
      : DEFAULT_STORY_RUNTIME_CONFIG,
  };
}
