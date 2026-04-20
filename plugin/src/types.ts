import type { StorySessionSnapshot, StoryTurnResponse } from "@capybara-letter/shared";

export type EduStoryAccountConfig = {
  name?: string;
  enabled?: boolean;
  port?: number;
  host?: string;
  allowFrom?: Array<string | number>;
  defaultTo?: string;
  agentId?: string;
};

export type EduStoryConfig = EduStoryAccountConfig & {
  accounts?: Record<string, Partial<EduStoryAccountConfig>>;
  defaultAccount?: string;
};

export type CoreConfig = {
  channels?: {
    "edu-story"?: EduStoryConfig;
  };
  session?: {
    store?: string;
  };
};

export type ResolvedEduStoryAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  port: number;
  host: string;
  agentId: string;
  config: EduStoryAccountConfig;
};

// Wire protocol: frontend ↔ channel WebSocket
export type ClientFrame =
  | { type: "message"; text: string; meta?: { age?: number; englishLevel?: string } }
  | { type: "bootstrap"; age: number; englishLevel: string; sessionId?: string }
  | { type: "review-word"; cardId: string; rating: "again" | "hard" | "good" | "easy" }
  | { type: "ping" };

export type ServerFrame =
  | { type: "delivery"; payload: StoryTurnResponse }
  | { type: "snapshot"; payload: StorySessionSnapshot }
  | { type: "delta"; text: string }
  | { type: "error"; message: string }
  | { type: "status"; state: "thinking" | "researching" | "composing" | "idle" }
  | { type: "connected"; sessionId: string }
  | { type: "pong" };
