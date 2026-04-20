import fs from "node:fs/promises";
import path from "node:path";
import {
  StorySessionSnapshotSchema,
  StoryWordReviewRequestSchema,
  type ConversationEntry,
  type StorySessionSnapshot,
  type StorySessionStatus,
  type StoryTurnResponse,
  type StoryWordCard,
  type StoryWordRating,
} from "@capybara-letter/shared";
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

function deserializeCard(word: StoryWordCard): Card {
  return {
    due: new Date(word.scheduler.due),
    stability: word.scheduler.stability,
    difficulty: word.scheduler.difficulty,
    elapsed_days: word.scheduler.elapsedDays,
    scheduled_days: word.scheduler.scheduledDays,
    learning_steps: word.scheduler.learningSteps,
    reps: word.scheduler.reps,
    lapses: word.scheduler.lapses,
    state: serializedToState(word.scheduler.state),
    last_review: word.scheduler.lastReview ? new Date(word.scheduler.lastReview) : undefined,
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
      encounterCount: existing.encounterCount + 1,
      lastSeenAt: params.timestamp,
    });
  }

  return [...bank.values()].toSorted((left: StoryWordCard, right: StoryWordCard) => {
    const leftDue = new Date(left.scheduler.due).getTime();
    const rightDue = new Date(right.scheduler.due).getTime();
    if (leftDue !== rightDue) {
      return leftDue - rightDue;
    }
    return left.word.localeCompare(right.word, "en");
  });
}

export class EduStorySessionStore {
  constructor(private readonly sessionsRoot: string) {}

  private resolveSnapshotPath(sessionId: string): string {
    return path.join(this.sessionsRoot, `${sessionId}.json`);
  }

  async read(sessionId: string): Promise<StorySessionSnapshot | null> {
    try {
      const raw = await fs.readFile(this.resolveSnapshotPath(sessionId), "utf8");
      return StorySessionSnapshotSchema.parse(JSON.parse(raw));
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
      history: [],
      wordBank: [],
    };
  }

  private async write(snapshot: StorySessionSnapshot): Promise<StorySessionSnapshot> {
    const parsed = StorySessionSnapshotSchema.parse(snapshot);
    const filePath = this.resolveSnapshotPath(parsed.sessionId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(parsed, null, 2), "utf8");
    return parsed;
  }

  async setStatus(params: {
    sessionId: string;
    status: StorySessionStatus;
    userEntry?: ConversationEntry;
  }): Promise<StorySessionSnapshot> {
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
  }

  async saveDeliveredStory(params: {
    sessionId: string;
    story: StoryTurnResponse;
  }): Promise<StorySessionSnapshot> {
    const timestamp = nowIso();
    const snapshot = await this.ensure(params.sessionId);
    const agentHistory: ConversationEntry[] = params.story.messages.map((message: { id: string; speaker: string; text: string }) => ({
      id: `${params.sessionId}-${params.story.kind}-${message.id}-${timestamp}`,
      role: message.speaker as ConversationEntry["role"],
      text: message.text,
      time: timestamp,
    }));

    return this.write({
      ...snapshot,
      updatedAt: timestamp,
      status: "replying",
      currentStory: params.story,
      history: dedupeHistory([...snapshot.history, ...agentHistory]),
      wordBank: mergeWordBank({ snapshot, story: params.story, timestamp }),
    });
  }

  async applyWordReview(params: {
    sessionId: string;
    cardId: string;
    rating: StoryWordRating;
  }): Promise<StorySessionSnapshot> {
    StoryWordReviewRequestSchema.parse(params);
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
      wordBank: nextWordBank.toSorted((left: StoryWordCard, right: StoryWordCard) => {
        const leftDue = new Date(left.scheduler.due).getTime();
        const rightDue = new Date(right.scheduler.due).getTime();
        if (leftDue !== rightDue) return leftDue - rightDue;
        return left.word.localeCompare(right.word, "en");
      }),
    });
  }
}
