import type {
  Environment,
  StoryExperienceSettings,
  StoryRuntimeConfig,
  LearnerProfile,
  StorySessionSnapshot,
  StoryTurnResponse,
} from "./shared/types.js";

export type CapybaraLetterAccountConfig = {
  name?: string;
  enabled?: boolean;
  port?: number;
  host?: string;
  allowFrom?: Array<string | number>;
  defaultTo?: string;
  agentId?: string;
};

export type CapybaraLetterConfig = CapybaraLetterAccountConfig & {
  accounts?: Record<string, Partial<CapybaraLetterAccountConfig>>;
  defaultAccount?: string;
};

export type CoreConfig = {
  channels?: {
    "capybara-letter"?: CapybaraLetterConfig;
  };
  session?: {
    store?: string;
  };
};

export type ResolvedCapybaraLetterAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  port: number;
  host: string;
  agentId: string;
  config: CapybaraLetterAccountConfig;
};

export type SpeechScope = "letter" | "word";

export type SpeechFramePayload = {
  requestId: string;
  scope: SpeechScope;
  text: string;
  mimeType: "audio/mpeg";
  audioBase64: string;
  provider: "xfyun";
  voice: string;
  cacheKey: string;
};

// Wire protocol: frontend ↔ channel WebSocket
export type ClientFrame =
  | { type: "message"; text: string; meta?: { age?: number; englishLevel?: string } }
  | { type: "bootstrap"; age: number; englishLevel: string; sessionId?: string }
  | { type: "request-speech"; requestId: string; scope: SpeechScope; text: string }
  | { type: "review-word"; cardId: string; rating: "again" | "hard" | "good" | "easy" }
  | { type: "update-profile"; profile: LearnerProfile }
  | { type: "update-environment"; environment: Partial<Environment> }
  | { type: "update-preferences"; preferences: Partial<StoryExperienceSettings> }
  | { type: "update-runtime"; runtime: Partial<StoryRuntimeConfig> }
  | { type: "ping" };

export type ServerFrame =
  | { type: "delivery"; payload: StoryTurnResponse }
  | { type: "snapshot"; payload: StorySessionSnapshot }
  | { type: "delta"; text: string }
  | { type: "error"; message: string }
  | { type: "speech"; payload: SpeechFramePayload }
  | { type: "speech-error"; requestId: string; message: string }
  | { type: "status"; state: "thinking" | "researching" | "composing" | "idle" }
  | { type: "connected"; sessionId: string }
  | { type: "pong" };
