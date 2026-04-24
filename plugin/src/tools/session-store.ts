import fs from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_STORY_EXPERIENCE_SETTINGS,
  DEFAULT_STORY_RUNTIME_CONFIG,
  StorySessionSnapshotSchema,
  StoryWordReviewRequestSchema,
  type ConversationEntry,
  type StoryExperienceSettings,
  type Environment,
  type LearnerProfile,
  type StoryDeliveryRecord,
  type StoryRuntimeConfig,
  type StorySessionSnapshot,
  type StorySessionStatus,
  type StoryTurnResponse,
  type StoryWordCard,
  type StoryWordRating,
} from "../shared/types.js";
import { ensureRenderableScene } from "../story-scene-fallback.js";
import { Rating, State, createEmptyCard, fsrs, type Card } from "ts-fsrs";

const studyScheduler = fsrs({
  request_retention: 0.9,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ["10m", "1d"],
  relearning_steps: ["10m"],
});

type SerializedState = "New" | "Learning" | "Review" | "Relearning";
type FsrsGrade = Rating.Again | Rating.Hard | Rating.Good | Rating.Easy;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeWordKey(word: string): string {
  return word.trim().toLowerCase().replace(/\s+/g, "-");
}

function stateToSerialized(state: State): SerializedState {
  switch (state) {
    case State.Learning:
      return "Learning";
    case State.Review:
      return "Review";
    case State.Relearning:
      return "Relearning";
    case State.New:
    default:
      return "New";
  }
}

function serializedToState(state: SerializedState): State {
  switch (state) {
    case "Learning":
      return State.Learning;
    case "Review":
      return State.Review;
    case "Relearning":
      return State.Relearning;
    case "New":
    default:
      return State.New;
  }
}

function ratingToFsrs(rating: StoryWordRating): FsrsGrade {
  switch (rating) {
    case "again":
      return Rating.Again;
    case "hard":
      return Rating.Hard;
    case "easy":
      return Rating.Easy;
    case "good":
    default:
      return Rating.Good;
  }
}

function serializeCard(card: Card) {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: stateToSerialized(card.state),
    lastReview: card.last_review ? card.last_review.toISOString() : null,
  } as const;
}

function parseDateOrFallback(value: string | null | undefined, fallback: Date): Date {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function repairSchedulerCard(word: StoryWordCard): Card {
  const referenceDate = parseDateOrFallback(
    word.scheduler.lastReview ?? word.lastSeenAt ?? word.firstSeenAt ?? word.scheduler.due,
    new Date(),
  );
  const freshCard = createEmptyCard(referenceDate);
  if (!word.lastRating) {
    return freshCard;
  }
  try {
    return studyScheduler.next(freshCard, referenceDate, ratingToFsrs(word.lastRating)).card;
  } catch {
    return freshCard;
  }
}

function schedulerNeedsRepair(word: StoryWordCard): boolean {
  const dueTime = new Date(word.scheduler.due).getTime();
  const lastReviewTime = word.scheduler.lastReview ? new Date(word.scheduler.lastReview).getTime() : 0;
  const { stability, difficulty } = word.scheduler;

  if (!Number.isFinite(dueTime)) {
    return true;
  }
  if (word.scheduler.lastReview && !Number.isFinite(lastReviewTime)) {
    return true;
  }
  if (!isFiniteNumber(stability) || !isFiniteNumber(difficulty)) {
    return true;
  }
  if (stability < 0 || difficulty < 0) {
    return true;
  }
  if (stability === 0 && difficulty !== 0) {
    return true;
  }
  if (stability > 0 && difficulty === 0) {
    return true;
  }
  return false;
}

function normalizeWordCard(card: StoryWordCard): StoryWordCard {
  if (!schedulerNeedsRepair(card)) {
    return card;
  }
  return {
    ...card,
    scheduler: serializeCard(repairSchedulerCard(card)),
  };
}

function normalizeForStoryMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildVisibleStoryCorpus(story: StoryTurnResponse): string {
  return normalizeForStoryMatch(
    [
      story.title,
      story.subtitle,
      story.narration,
      story.wordSpotlight.focusWord,
      story.wordSpotlight.echoLine,
      story.letter.greeting,
      ...story.letter.body,
      story.letter.signoff,
      story.letter.postscript,
      ...story.messages.map((message) => message.text),
      story.task.promptZh,
      story.task.instructionZh,
      story.task.rewardText,
      ...story.task.choices.flatMap((choice) => [choice.label, choice.feedback]),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

function containsStoryText(corpus: string, value: string): boolean {
  const normalized = normalizeForStoryMatch(value);
  if (!normalized) {
    return false;
  }
  return corpus.includes(normalized);
}

function normalizeStoryRecord(entry: StoryDeliveryRecord): {
  entry: StoryDeliveryRecord;
  removedWordIds: Set<string>;
} {
  const normalizedScene = ensureRenderableScene(entry.story.scene);
  const corpus = buildVisibleStoryCorpus(entry.story);
  const anchoredCards = entry.story.vocabularyCards.filter(
    (card) =>
      containsStoryText(corpus, card.word) && containsStoryText(corpus, card.example),
  );

  if (anchoredCards.length < 2 || anchoredCards.length === entry.story.vocabularyCards.length) {
    return {
      entry:
        normalizedScene === entry.story.scene
          ? entry
          : {
              ...entry,
              story: {
                ...entry.story,
                scene: normalizedScene,
              },
            },
      removedWordIds: new Set<string>(),
    };
  }

  const anchoredWordIds = new Set(
    anchoredCards.map((card) => `word:${normalizeWordKey(card.word)}`),
  );
  const removedWordIds = new Set(
    entry.story.vocabularyCards
      .map((card) => `word:${normalizeWordKey(card.word)}`)
      .filter((wordId) => !anchoredWordIds.has(wordId)),
  );
  const normalizedTaskVocabulary = entry.story.task.vocabulary.filter((word) =>
    anchoredWordIds.has(`word:${normalizeWordKey(word)}`),
  );

  return {
    entry: {
      ...entry,
      story: {
        ...entry.story,
        scene: normalizedScene,
        vocabularyCards: anchoredCards,
        task: {
          ...entry.story.task,
          vocabulary:
            normalizedTaskVocabulary.length >= 2
              ? normalizedTaskVocabulary
              : anchoredCards.slice(0, 6).map((card) => card.word),
        },
      },
    },
    removedWordIds,
  };
}

function sortDeliveryLog(entries: StoryDeliveryRecord[]): StoryDeliveryRecord[] {
  return [...entries].sort((left, right) => {
    const timeDelta =
      new Date(left.deliveredAt).getTime() - new Date(right.deliveredAt).getTime();
    if (timeDelta !== 0) {
      return timeDelta;
    }
    return left.id.localeCompare(right.id, "en");
  });
}

function deliveryFingerprint(story: StoryTurnResponse): string {
  return [story.sessionId, story.kind, story.title, story.plan.topic].join("::");
}

function synthesizeLegacyDeliveryRecord(snapshot: StorySessionSnapshot): StoryDeliveryRecord[] {
  if (!snapshot.currentStory) {
    return [];
  }
  return [
    {
      id: `legacy-${snapshot.currentStory.kind}-${snapshot.updatedAt}`,
      deliveredAt: snapshot.updatedAt,
      story: snapshot.currentStory,
    },
  ];
}

function normalizeDeliveryLog(snapshot: StorySessionSnapshot): StoryDeliveryRecord[] {
  const baseLog =
    snapshot.deliveryLog.length > 0
      ? sortDeliveryLog(snapshot.deliveryLog)
      : synthesizeLegacyDeliveryRecord(snapshot);
  const seenFingerprints = new Set(baseLog.map((entry) => deliveryFingerprint(entry.story)));

  if (snapshot.currentStory) {
    const currentFingerprint = deliveryFingerprint(snapshot.currentStory);
    if (!seenFingerprints.has(currentFingerprint)) {
      baseLog.push({
        id: `legacy-${snapshot.currentStory.kind}-${snapshot.updatedAt}`,
        deliveredAt: snapshot.updatedAt,
        story: snapshot.currentStory,
      });
    }
  }

  return sortDeliveryLog(baseLog);
}

function normalizeHistory(snapshot: StorySessionSnapshot): ConversationEntry[] {
  const deliveries = normalizeDeliveryLog(snapshot);
  if (deliveries.length === 0) {
    return snapshot.history;
  }

  const deliveriesByTime = new Map<string, StoryDeliveryRecord[]>();
  deliveries.forEach((delivery) => {
    const list = deliveriesByTime.get(delivery.deliveredAt) ?? [];
    list.push(delivery);
    deliveriesByTime.set(delivery.deliveredAt, list);
  });

  return snapshot.history.map((entry) => {
    if (entry.sourceDeliveryId) {
      return entry;
    }
    if (entry.role === "user") {
      return entry;
    }

    const sameTimeDeliveries = deliveriesByTime.get(entry.time) ?? [];
    if (sameTimeDeliveries.length === 0) {
      return entry;
    }

    const matchedDelivery = sameTimeDeliveries.find((delivery) =>
      delivery.story.messages.some(
        (message) => message.speaker === entry.role && message.text.trim() === entry.text.trim(),
      ),
    );
    if (!matchedDelivery) {
      return entry;
    }

    return {
      ...entry,
      sourceDeliveryId: matchedDelivery.id,
    };
  });
}

function normalizeSnapshot(snapshot: StorySessionSnapshot): StorySessionSnapshot {
  const normalizedHistory = normalizeHistory(snapshot);
  const storyNormalization = normalizeDeliveryLog(snapshot).map((entry) =>
    normalizeStoryRecord(entry),
  );
  const normalizedDeliveryLog = storyNormalization.map((record) => record.entry);
  const allowedWordIdsByDelivery = new Map<string, Set<string>>();
  const allowedWordIdsByTitle = new Map<string, Set<string>>();
  normalizedDeliveryLog.forEach((entry) => {
    const allowedWordIds = new Set(
      entry.story.vocabularyCards.map((card) => `word:${normalizeWordKey(card.word)}`),
    );
    allowedWordIdsByDelivery.set(entry.id, allowedWordIds);
    allowedWordIdsByTitle.set(entry.story.title, allowedWordIds);
  });
  const normalizedWordBank = snapshot.wordBank
    .map((card: StoryWordCard) => normalizeWordCard(card))
    .filter((card) => {
      if (card.sourceDeliveryId) {
        const allowedByDelivery = allowedWordIdsByDelivery.get(card.sourceDeliveryId);
        if (!allowedByDelivery) {
          return true;
        }
        return allowedByDelivery.has(card.id);
      }
      const allowedByTitle = allowedWordIdsByTitle.get(card.sourceTitle);
      if (!allowedByTitle) {
        return true;
      }
      return allowedByTitle.has(card.id);
    });
  const normalizedCurrentStory =
    normalizedDeliveryLog[normalizedDeliveryLog.length - 1]?.story ?? snapshot.currentStory;
  const wordBankChanged =
    normalizedWordBank.length !== snapshot.wordBank.length ||
    normalizedWordBank.some(
      (card: StoryWordCard, index: number) => card !== snapshot.wordBank[index],
    );
  const deliveryChanged =
    normalizedDeliveryLog.length !== snapshot.deliveryLog.length ||
    normalizedDeliveryLog.some(
      (entry: StoryDeliveryRecord, index: number) => entry !== snapshot.deliveryLog[index],
    );
  const currentStoryChanged = normalizedCurrentStory !== snapshot.currentStory;
  const historyChanged =
    normalizedHistory.length !== snapshot.history.length ||
    normalizedHistory.some(
      (entry: ConversationEntry, index: number) => entry !== snapshot.history[index],
    );
  if (!wordBankChanged && !deliveryChanged && !currentStoryChanged && !historyChanged) {
    return snapshot;
  }
  return {
    ...snapshot,
    currentStory: normalizedCurrentStory,
    deliveryLog: normalizedDeliveryLog,
    history: normalizedHistory,
    wordBank: normalizedWordBank,
  };
}

function deserializeCard(word: StoryWordCard): Card {
  const normalized = normalizeWordCard(word);
  return {
    due: new Date(normalized.scheduler.due),
    stability: normalized.scheduler.stability,
    difficulty: normalized.scheduler.difficulty,
    elapsed_days: normalized.scheduler.elapsedDays,
    scheduled_days: normalized.scheduler.scheduledDays,
    learning_steps: normalized.scheduler.learningSteps,
    reps: normalized.scheduler.reps,
    lapses: normalized.scheduler.lapses,
    state: serializedToState(normalized.scheduler.state),
    last_review: normalized.scheduler.lastReview
      ? new Date(normalized.scheduler.lastReview)
      : undefined,
  };
}

function dedupeHistory(entries: ConversationEntry[]): ConversationEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) {
      return false;
    }
    seen.add(entry.id);
    return true;
  });
}

function mergeWordBank(params: {
  snapshot: StorySessionSnapshot;
  story: StoryTurnResponse;
  deliveryId: string;
  timestamp: string;
}): StoryWordCard[] {
  const bank = new Map(params.snapshot.wordBank.map((card: StoryWordCard) => [card.id, card]));

  for (const vocabularyCard of params.story.vocabularyCards) {
    const cardId = `word:${normalizeWordKey(vocabularyCard.word)}`;
    const existing = bank.get(cardId);
    if (!existing) {
      bank.set(cardId, {
        id: cardId,
        word: vocabularyCard.word,
        pronunciation: vocabularyCard.pronunciation,
        meaningZh: vocabularyCard.meaningZh,
        partOfSpeech: vocabularyCard.partOfSpeech,
        tapHint: vocabularyCard.tapHint,
        example: vocabularyCard.example,
        exampleZh: vocabularyCard.exampleZh,
        sourceSessionId: params.story.sessionId,
        sourceTitle: params.story.title,
        sourceDeliveryId: params.deliveryId,
        encounterCount: 1,
        firstSeenAt: params.timestamp,
        lastSeenAt: params.timestamp,
        lastRating: null,
        scheduler: serializeCard(createEmptyCard(new Date(params.timestamp))),
      });
      continue;
    }

    bank.set(cardId, {
      ...existing,
      pronunciation: vocabularyCard.pronunciation,
      meaningZh: vocabularyCard.meaningZh,
      partOfSpeech: vocabularyCard.partOfSpeech,
      tapHint: vocabularyCard.tapHint,
      example: vocabularyCard.example,
      exampleZh: vocabularyCard.exampleZh,
      sourceSessionId: params.story.sessionId,
      sourceTitle: params.story.title,
      sourceDeliveryId: params.deliveryId,
      encounterCount: existing.encounterCount + 1,
      lastSeenAt: params.timestamp,
    });
  }

  return [...bank.values()].sort((left: StoryWordCard, right: StoryWordCard) => {
    const leftDue = new Date(left.scheduler.due).getTime();
    const rightDue = new Date(right.scheduler.due).getTime();
    if (leftDue !== rightDue) {
      return leftDue - rightDue;
    }
    return left.word.localeCompare(right.word, "en");
  });
}

function snapshotBootstrapWeight(snapshot: StorySessionSnapshot): number {
  let weight = 0;
  if (snapshot.deliveryLog.length > 0) {
    weight += 2;
  }
  if (snapshot.history.length > 0) {
    weight += 1;
  }
  if (snapshot.history.length > 2) {
    weight += 2;
  }
  if (snapshot.currentStory?.kind === "lesson") {
    weight += 2;
  }
  if (snapshot.wordBank.length > 3) {
    weight += 1;
  }
  return weight;
}

export class CapybaraLetterSessionStore {
  private readonly queuedWrites = new Map<string, Promise<unknown>>();

  constructor(private readonly sessionsRoot: string) {}

  private resolveSnapshotPath(sessionId: string): string {
    return path.join(this.sessionsRoot, `${sessionId}.json`);
  }

  async read(sessionId: string): Promise<StorySessionSnapshot | null> {
    try {
      const raw = await fs.readFile(this.resolveSnapshotPath(sessionId), "utf8");
      const parsed = StorySessionSnapshotSchema.parse(JSON.parse(raw));
      const normalized = normalizeSnapshot(parsed);
      if (normalized !== parsed) {
        await this.write(normalized);
      }
      return normalized;
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async findLatestSnapshot(): Promise<StorySessionSnapshot | null> {
    try {
      const entries = await fs.readdir(this.sessionsRoot, { withFileTypes: true });
      const candidates = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => entry.name.slice(0, -".json".length))
        .filter(Boolean);

      const snapshots = await Promise.all(
        candidates.map(async (sessionId) => {
          try {
            return await this.read(sessionId);
          } catch {
            return null;
          }
        }),
      );

      return [...snapshots.filter((snapshot): snapshot is StorySessionSnapshot => Boolean(snapshot))]
        .sort((left: StorySessionSnapshot, right: StorySessionSnapshot) => {
          const weightDelta = snapshotBootstrapWeight(right) - snapshotBootstrapWeight(left);
          if (weightDelta !== 0) {
            return weightDelta;
          }
          const updatedDelta =
            new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
          if (updatedDelta !== 0) {
            return updatedDelta;
          }
          return right.sessionId.localeCompare(left.sessionId, "en");
        })[0] ?? null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async ensure(sessionId: string): Promise<StorySessionSnapshot> {
    const existing = await this.read(sessionId);
    if (existing) return existing;
    const timestamp = nowIso();
    return {
      sessionId,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "replying",
      currentStory: null,
      deliveryLog: [],
      history: [],
      wordBank: [],
      preferences: DEFAULT_STORY_EXPERIENCE_SETTINGS,
      runtime: DEFAULT_STORY_RUNTIME_CONFIG,
    };
  }

  async replaceSnapshot(snapshot: StorySessionSnapshot): Promise<StorySessionSnapshot> {
    return this.serializeSession(snapshot.sessionId, async () => {
      return this.write(snapshot);
    });
  }

  private async write(snapshot: StorySessionSnapshot): Promise<StorySessionSnapshot> {
    const parsed = normalizeSnapshot(StorySessionSnapshotSchema.parse(snapshot));
    const filePath = this.resolveSnapshotPath(parsed.sessionId);
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(tempPath, JSON.stringify(parsed, null, 2), "utf8");
    await fs.rename(tempPath, filePath);
    return parsed;
  }

  private async serializeSession<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queuedWrites.get(sessionId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    this.queuedWrites.set(sessionId, current);
    try {
      return await current;
    } finally {
      if (this.queuedWrites.get(sessionId) === current) {
        this.queuedWrites.delete(sessionId);
      }
    }
  }

  async setStatus(params: {
    sessionId: string;
    status: StorySessionStatus;
    userEntry?: ConversationEntry;
  }): Promise<StorySessionSnapshot> {
    return this.serializeSession(params.sessionId, async () => {
      const timestamp = params.userEntry?.time ?? nowIso();
      const snapshot = await this.ensure(params.sessionId);
      return this.write({
        ...snapshot,
        updatedAt: timestamp,
        status: params.status,
        history: params.userEntry
          ? dedupeHistory([...snapshot.history, params.userEntry])
          : snapshot.history,
      });
    });
  }

  async appendHistoryEntry(params: {
    sessionId: string;
    entry: ConversationEntry;
  }): Promise<StorySessionSnapshot> {
    return this.serializeSession(params.sessionId, async () => {
      const snapshot = await this.ensure(params.sessionId);
      return this.write({
        ...snapshot,
        updatedAt: params.entry.time,
        history: dedupeHistory([...snapshot.history, params.entry]),
      });
    });
  }

  async saveDeliveredStory(params: {
    sessionId: string;
    story: StoryTurnResponse;
  }): Promise<StorySessionSnapshot> {
    return this.serializeSession(params.sessionId, async () => {
      const timestamp = nowIso();
      const snapshot = await this.ensure(params.sessionId);
      const deliveryId = crypto.randomUUID();
      const agentHistory: ConversationEntry[] = params.story.messages.map((message: { id: string; speaker: string; text: string }) => ({
        id: `${params.sessionId}-${params.story.kind}-${message.id}-${timestamp}`,
        role: message.speaker as ConversationEntry["role"],
        text: message.text,
        time: timestamp,
        sourceDeliveryId: deliveryId,
      }));

      return this.write({
        ...snapshot,
        updatedAt: timestamp,
        status: "replying",
        currentStory: params.story,
        deliveryLog: sortDeliveryLog([
          ...snapshot.deliveryLog,
          {
            id: deliveryId,
            deliveredAt: timestamp,
            story: params.story,
          },
        ]),
        history: dedupeHistory([...snapshot.history, ...agentHistory]),
        wordBank: mergeWordBank({ snapshot, story: params.story, deliveryId, timestamp }),
      });
    });
  }

  async applyWordReview(params: {
    sessionId: string;
    cardId: string;
    rating: StoryWordRating;
  }): Promise<StorySessionSnapshot> {
    StoryWordReviewRequestSchema.parse(params);
    return this.serializeSession(params.sessionId, async () => {
      const timestamp = nowIso();
      const snapshot = await this.ensure(params.sessionId);
      const nextWordBank = snapshot.wordBank.map((card: StoryWordCard) => {
        if (card.id !== params.cardId) return card;
        const scheduled = studyScheduler.next(
          deserializeCard(card),
          new Date(timestamp),
          ratingToFsrs(params.rating),
        );
        return {
          ...card,
          lastSeenAt: timestamp,
          lastRating: params.rating,
          scheduler: serializeCard(scheduled.card),
        };
      });

      return this.write({
        ...snapshot,
        updatedAt: timestamp,
        wordBank: [...nextWordBank].sort((left: StoryWordCard, right: StoryWordCard) => {
          const leftDue = new Date(left.scheduler.due).getTime();
          const rightDue = new Date(right.scheduler.due).getTime();
          if (leftDue !== rightDue) return leftDue - rightDue;
          return left.word.localeCompare(right.word, "en");
        }),
      });
    });
  }

  async updateEnvironment(params: {
    sessionId: string;
    environment: Environment;
  }): Promise<StorySessionSnapshot> {
    return this.serializeSession(params.sessionId, async () => {
      const snapshot = await this.ensure(params.sessionId);
      return this.write({
        ...snapshot,
        updatedAt: nowIso(),
        environment: { ...snapshot.environment, ...params.environment },
      });
    });
  }

  async updateLearnerProfile(params: {
    sessionId: string;
    profile: LearnerProfile;
  }): Promise<StorySessionSnapshot> {
    return this.serializeSession(params.sessionId, async () => {
      const snapshot = await this.ensure(params.sessionId);
      return this.write({
        ...snapshot,
        updatedAt: nowIso(),
        learnerProfile: params.profile,
      });
    });
  }

  async updatePreferences(params: {
    sessionId: string;
    preferences: Partial<StoryExperienceSettings>;
  }): Promise<StorySessionSnapshot> {
    return this.serializeSession(params.sessionId, async () => {
      const snapshot = await this.ensure(params.sessionId);
      return this.write({
        ...snapshot,
        updatedAt: nowIso(),
        preferences: {
          ...snapshot.preferences,
          ...params.preferences,
        },
      });
    });
  }

  async updateRuntime(params: {
    sessionId: string;
    runtime: Partial<StoryRuntimeConfig>;
  }): Promise<StorySessionSnapshot> {
    return this.serializeSession(params.sessionId, async () => {
      const snapshot = await this.ensure(params.sessionId);
      return this.write({
        ...snapshot,
        updatedAt: nowIso(),
        runtime: {
          ...snapshot.runtime,
          ...params.runtime,
        },
      });
    });
  }
}
