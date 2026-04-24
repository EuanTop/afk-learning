import { Type } from "@sinclair/typebox";
import {
  StoryTurnDraftSchema,
  StoryPlanSchema,
  ResearchDigestSchema,
  type StoryTurnResponse,
  type AgeBand,
  type StoryKind,
} from "../shared/types.js";
import type { CapybaraLetterSessionStore } from "./session-store.js";
import { sendToClient } from "../gateway.js";

type ComposeLessonTool = {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (_toolCallId: string, rawParams: Record<string, unknown>) => Promise<{
    type: "text";
    text: string;
  }>;
};

function readStringParam(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonIfPossible(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function readObjectParam(params: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parseJsonIfPossible(params[key]);
  return isRecord(value) ? value : {};
}

function normalizePaletteEntry(entry: unknown, index: number): unknown {
  if (typeof entry === "string") {
    return {
      id: `color-${index + 1}`,
      value: entry,
    };
  }
  if (!isRecord(entry)) {
    return entry;
  }

  const value =
    (typeof entry.value === "string" && entry.value) ||
    (typeof entry.color === "string" && entry.color) ||
    (typeof entry.fill === "string" && entry.fill) ||
    "";

  return {
    ...entry,
    id: typeof entry.id === "string" && entry.id ? entry.id : `color-${index + 1}`,
    value,
  };
}

function normalizeMood(value: unknown, fallbackMood: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallbackMood;
  }
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "warm":
    case "温暖":
    case "温柔":
      return "warm";
    case "curious":
    case "好奇":
      return "curious";
    case "excited":
    case "兴奋":
    case "活泼":
      return "excited";
    case "sleepy":
    case "困倦":
    case "安静":
      return "sleepy";
    default:
      return normalized;
  }
}

function normalizeDraftInput(rawDraft: Record<string, unknown>, params: {
  fallbackTitle: string;
  fallbackMood: string;
}): Record<string, unknown> {
  const nextDraft = { ...rawDraft };
  const rawScene = parseJsonIfPossible(nextDraft.scene);

  if (isRecord(rawScene)) {
    const nextScene: Record<string, unknown> = { ...rawScene };
    if (Array.isArray(nextScene.palette)) {
      nextScene.palette = nextScene.palette.map(normalizePaletteEntry);
    }
    if (!Array.isArray(nextScene.layers)) {
      nextScene.layers = [];
    }
    if (!Array.isArray(nextScene.actors)) {
      nextScene.actors = [];
    }
    if (typeof nextScene.title !== "string" || nextScene.title.trim().length === 0) {
      nextScene.title = params.fallbackTitle;
    }
    nextScene.mood = normalizeMood(nextScene.mood, params.fallbackMood);
    nextDraft.scene = nextScene;
  }

  const rawTask = parseJsonIfPossible(nextDraft.task);
  if (isRecord(rawTask)) {
    const nextTask: Record<string, unknown> = { ...rawTask };
    if (Array.isArray(nextTask.choices) && nextTask.choices.length > 3) {
      nextTask.choices = nextTask.choices.slice(0, 3);
    }
    if (!Array.isArray(nextTask.vocabulary)) {
      const derivedVocabulary = Array.isArray(nextDraft.vocabularyCards)
        ? nextDraft.vocabularyCards
            .map((entry) => (isRecord(entry) && typeof entry.word === "string" ? entry.word : ""))
            .filter((word): word is string => word.length > 0)
            .slice(0, 6)
        : [];
      nextTask.vocabulary = derivedVocabulary;
    }
    nextDraft.task = nextTask;
  }

  return nextDraft;
}

function normalizeResearchInput(rawResearch: unknown): Record<string, unknown> | null {
  const value = parseJsonIfPossible(rawResearch);
  if (!isRecord(value)) {
    return null;
  }

  const candidate = {
    query: typeof value.query === "string" ? value.query.trim() : "",
    title: typeof value.title === "string" ? value.title.trim() : "",
    summary: typeof value.summary === "string" ? value.summary.trim() : "",
    sourceUrl: typeof value.sourceUrl === "string" ? value.sourceUrl.trim() : "",
    sourceLabel: typeof value.sourceLabel === "string" ? value.sourceLabel.trim() : "",
  };

  if (
    !candidate.query ||
    !candidate.title ||
    !candidate.summary ||
    !candidate.sourceUrl ||
    !candidate.sourceLabel
  ) {
    return null;
  }

  return candidate;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildVisibleLessonCorpus(draft: import("../shared/types.js").StoryTurnDraft): string {
  return [
    draft.title,
    draft.subtitle,
    draft.narration,
    draft.wordSpotlight.focusWord,
    draft.wordSpotlight.echoLine,
    draft.letter.greeting,
    ...draft.letter.body,
    draft.letter.signoff,
    draft.letter.postscript,
    ...draft.messages.map((message) => message.text),
    draft.task.promptZh,
    draft.task.instructionZh,
    draft.task.rewardText,
    ...draft.task.choices.flatMap((choice) => [choice.label, choice.feedback]),
  ]
    .filter(Boolean)
    .join("\n");
}

function containsNormalizedText(corpus: string, candidate: string): boolean {
  const normalizedCandidate = normalizeForMatch(candidate);
  if (!normalizedCandidate) {
    return false;
  }
  return corpus.includes(normalizedCandidate);
}

function assertVocabularyAnchors(draft: import("../shared/types.js").StoryTurnDraft) {
  const normalizedCorpus = normalizeForMatch(buildVisibleLessonCorpus(draft));

  if (!containsNormalizedText(normalizedCorpus, draft.wordSpotlight.focusWord)) {
    throw new Error(
      `compose_lesson rejected: wordSpotlight.focusWord "${draft.wordSpotlight.focusWord}" must appear in visible lesson content.`,
    );
  }

  if (!containsNormalizedText(normalizedCorpus, draft.wordSpotlight.echoLine)) {
    throw new Error(
      "compose_lesson rejected: wordSpotlight.echoLine must be copied from visible lesson content.",
    );
  }

  draft.vocabularyCards.forEach((card, index) => {
    if (!containsNormalizedText(normalizedCorpus, card.word)) {
      throw new Error(
        `compose_lesson rejected: vocabularyCards[${index}].word "${card.word}" must appear in visible lesson content.`,
      );
    }

    if (!containsNormalizedText(normalizedCorpus, card.example)) {
      throw new Error(
        `compose_lesson rejected: vocabularyCards[${index}].example for "${card.word}" must be copied from visible lesson content, not invented separately.`,
      );
    }
  });
}

function assignIds<T extends Record<string, unknown>>(
  items: T[],
  prefix: string,
): Array<T & { id: string }> {
  return items.map((item, index) => ({
    ...item,
    id: `${prefix}-${index + 1}`,
  }));
}

export function createComposeLessonTool(store: CapybaraLetterSessionStore): ComposeLessonTool {
  return {
    name: "compose_lesson",
    label: "Compose Lesson",
    description:
      "Validate and persist a structured lesson delivery (letter + scene + word cards). Call this after researching a topic to finalize the day's letter for the learner.",
    parameters: Type.Object(
      {
        sessionId: Type.String({ description: "The learner's session ID." }),
        kind: Type.Unsafe<string>({
          type: "string",
          enum: ["welcome", "lesson"],
          description: "Type of delivery: welcome (first time) or lesson (daily letter).",
        }),
        ageBand: Type.Unsafe<string>({
          type: "string",
          enum: ["3-5", "5-6", "6-8"],
          description: "The learner's age band.",
        }),
        plan: Type.Object(
          {
            topic: Type.String(),
            researchQuery: Type.String(),
            tomorrowPromise: Type.String(),
            storyAngle: Type.String(),
            capybaraMood: Type.Unsafe<string>({
              type: "string",
              enum: ["warm", "curious", "excited", "sleepy"],
            }),
            learningGoal: Type.String(),
            englishFocus: Type.Array(Type.String(), { minItems: 2, maxItems: 6 }),
            reasoning: Type.String(),
          },
          { description: "The lesson plan." },
        ),
        research: Type.Optional(
          Type.Object(
            {
              query: Type.String(),
              title: Type.String(),
              summary: Type.String(),
              sourceUrl: Type.String(),
              sourceLabel: Type.String(),
            },
            {
              description:
                "Optional research digest. If no reliable source was found, omit this field instead of passing empty strings.",
            },
          ),
        ),
        draft: Type.Object(
          {
            title: Type.String(),
            subtitle: Type.String(),
            deliveryMode: Type.Unsafe<string>({
              type: "string",
              enum: ["word-focus", "letter-story"],
            }),
            timeline: Type.Object({
              tonightQuestion: Type.String(),
              capybaraPromise: Type.String(),
              morningDelivery: Type.String(),
            }),
            scene: Type.Any({
              description:
                "StoryScene object. Pass a real JSON object, not a JSON string. Required fields: title, mood, palette [{id,value}], prompt, motionCue. layers and actors may be empty arrays.",
            }),
            narration: Type.String(),
            wordSpotlight: Type.Object({
              focusWord: Type.String(),
              pronunciation: Type.String(),
              meaningZh: Type.String(),
              tapHint: Type.String(),
              echoLine: Type.String(),
            }),
            vocabularyCards: Type.Array(
              Type.Object({
                word: Type.String(),
                pronunciation: Type.String(),
                meaningZh: Type.String(),
                partOfSpeech: Type.String(),
                tapHint: Type.String(),
                example: Type.String(),
                exampleZh: Type.String(),
              }),
              { minItems: 2, maxItems: 8 },
            ),
            letter: Type.Object({
              greeting: Type.String(),
              body: Type.Array(Type.String(), { minItems: 2, maxItems: 5 }),
              signoff: Type.String(),
              postscript: Type.String(),
            }),
            messages: Type.Array(
              Type.Object({
                speaker: Type.Unsafe<string>({
                  type: "string",
                  enum: ["capybara", "narrator"],
                }),
                text: Type.String(),
              }),
              { minItems: 2, maxItems: 6 },
            ),
            task: Type.Object({
              promptZh: Type.String(),
              instructionZh: Type.String(),
              vocabulary: Type.Array(Type.String(), { minItems: 2, maxItems: 6 }),
              rewardText: Type.String(),
              choices: Type.Array(
                Type.Object({
                  label: Type.String(),
                  feedback: Type.String(),
                  correct: Type.Boolean(),
                }),
                { minItems: 3, maxItems: 3 },
              ),
            }),
            suggestedReply: Type.String(),
          },
          {
            description:
              "The full lesson draft content. Pass `draft` as a JSON object, never as a stringified blob.",
          },
        ),
      },
      { additionalProperties: false },
    ),
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const sessionId = readStringParam(rawParams, "sessionId");
      const kind = readStringParam(rawParams, "kind") as StoryKind;
      const ageBand = readStringParam(rawParams, "ageBand") as AgeBand;
      const planRaw = readObjectParam(rawParams, "plan");
      const researchRaw = rawParams.research ?? null;
      const draftRaw = readObjectParam(rawParams, "draft");

      const plan = StoryPlanSchema.parse(planRaw);
      const researchCandidate = normalizeResearchInput(researchRaw);
      const research = researchCandidate ? ResearchDigestSchema.parse(researchCandidate) : null;
      const draft = StoryTurnDraftSchema.parse(
        normalizeDraftInput(draftRaw, {
          fallbackTitle: readStringParam(draftRaw, "title") || plan.topic,
          fallbackMood: plan.capybaraMood,
        }),
      );
      assertVocabularyAnchors(draft);

      const response: StoryTurnResponse = {
        sessionId,
        source: "openclaw-gateway",
        kind,
        ageBand,
        plan,
        research,
        title: draft.title,
        subtitle: draft.subtitle,
        deliveryMode: draft.deliveryMode,
        timeline: draft.timeline,
        scene: draft.scene,
        narration: draft.narration,
        wordSpotlight: draft.wordSpotlight,
        vocabularyCards: assignIds(draft.vocabularyCards, "vocab"),
        letter: draft.letter,
        messages: assignIds(draft.messages, "msg"),
        task: {
          ...draft.task,
          choices: assignIds(draft.task.choices, "choice"),
        },
        suggestedReply: draft.suggestedReply,
      };

      const snapshot = await store.saveDeliveredStory({ sessionId, story: response });
      sendToClient(sessionId, { type: "delivery", payload: response });
      sendToClient(sessionId, { type: "snapshot", payload: snapshot });

      return {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          title: response.title,
          wordCount: response.vocabularyCards.length,
          delivered: true,
        }),
      };
    },
  };
}
