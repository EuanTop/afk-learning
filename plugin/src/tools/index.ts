import { Type } from "@sinclair/typebox";
import type { StoryWordCard } from "@capybara-letter/shared";
import { fetchWikipediaResearch } from "./wikipedia-research.js";
import { EduStorySessionStore } from "./session-store.js";

function jsonResult(data: unknown) {
  return { type: "text" as const, text: JSON.stringify(data, null, 2) };
}

function readStringParam(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

export function createWikipediaResearchTool() {
  return {
    name: "wikipedia_research",
    label: "Wikipedia Research",
    description:
      "Search Chinese Wikipedia for educational content about a topic. Returns a summary, title, and source URL. Use this to gather factual knowledge before composing a lesson.",
    parameters: Type.Object(
      {
        query: Type.String({
          description: "The topic to research (Chinese or English).",
        }),
      },
      { additionalProperties: false },
    ),
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const query = readStringParam(rawParams, "query");
      const result = await fetchWikipediaResearch(query);
      if (!result) {
        return jsonResult({ found: false, message: "No Wikipedia article found for this topic." });
      }
      return jsonResult({ found: true, ...result });
    },
  };
}

export function createReviewWordTool(store: EduStorySessionStore) {
  return {
    name: "review_word_fsrs",
    label: "Review Word (FSRS)",
    description:
      "Apply a spaced-repetition review rating to a vocabulary card. Returns the updated word bank with next review dates.",
    parameters: Type.Object(
      {
        sessionId: Type.String({ description: "The learner's session ID." }),
        cardId: Type.String({ description: "The word card ID (e.g. 'word:apple')." }),
        rating: Type.Unsafe<string>({
          type: "string",
          enum: ["again", "hard", "good", "easy"],
          description: "The learner's self-assessed recall rating.",
        }),
      },
      { additionalProperties: false },
    ),
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const sessionId = readStringParam(rawParams, "sessionId");
      const cardId = readStringParam(rawParams, "cardId");
      const rating = readStringParam(rawParams, "rating") as "again" | "hard" | "good" | "easy";
      const snapshot = await store.applyWordReview({ sessionId, cardId, rating });
      const card = snapshot.wordBank.find((c: StoryWordCard) => c.id === cardId);
      return jsonResult({
        success: true,
        card: card ?? null,
        totalWords: snapshot.wordBank.length,
        dueNow: snapshot.wordBank.filter(
          (c: StoryWordCard) => new Date(c.scheduler.due).getTime() <= Date.now(),
        ).length,
      });
    },
  };
}

export function createGetSessionTool(store: EduStorySessionStore) {
  return {
    name: "get_learner_session",
    label: "Get Learner Session",
    description:
      "Retrieve the current session snapshot for a learner, including word bank, history, and current story state.",
    parameters: Type.Object(
      {
        sessionId: Type.String({ description: "The learner's session ID." }),
      },
      { additionalProperties: false },
    ),
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const sessionId = readStringParam(rawParams, "sessionId");
      const snapshot = await store.ensure(sessionId);
      return jsonResult({
        sessionId: snapshot.sessionId,
        status: snapshot.status,
        historyLength: snapshot.history.length,
        wordBankSize: snapshot.wordBank.length,
        dueNow: snapshot.wordBank.filter(
          (c: StoryWordCard) => new Date(c.scheduler.due).getTime() <= Date.now(),
        ).length,
        currentStory: snapshot.currentStory
          ? { title: snapshot.currentStory.title, kind: snapshot.currentStory.kind }
          : null,
      });
    },
  };
}
