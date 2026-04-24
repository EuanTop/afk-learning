import { z } from "zod";

// Standalone copy of the product contract types so @capybara-letter/plugin
// remains installable as a single OpenClaw plugin package.
export const StoryTurnRequestSchema = z.object({
  message: z.string().trim().min(1),
  age: z.union([z.number().int().min(3).max(12), z.string().trim().min(1)]),
  englishLevel: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
});

export type StoryTurnRequest = z.infer<typeof StoryTurnRequestSchema>;

export type AgeBand = "3-5" | "5-6" | "6-8";
export type StoryMood = "warm" | "curious" | "excited" | "sleepy";
export type StorySpeaker = "capybara" | "narrator";
export type StoryDeliveryMode = "word-focus" | "letter-story";
export type StoryKind = "welcome" | "lesson";
export type StorySceneActorKind = "capybara" | "pixel-art";
export type StorySceneActorFacing = "left" | "right" | "front" | "back";
export type StorySceneActorMotion =
  | "still"
  | "bob"
  | "listen"
  | "depart"
  | "search"
  | "return"
  | "deliver"
  | "drift";

export type NormalizedStoryTurnRequest = {
  message: string;
  ageYears: number;
  ageBand: AgeBand;
  englishLevel: string;
  sessionId?: string;
};

export const StoryPlanSchema = z.object({
  topic: z.string().min(1),
  researchQuery: z.string().min(1),
  tomorrowPromise: z.string().min(1),
  storyAngle: z.string().min(1),
  capybaraMood: z.enum(["warm", "curious", "excited", "sleepy"]),
  learningGoal: z.string().min(1),
  englishFocus: z.array(z.string().min(1)).min(2).max(6),
  reasoning: z.string().min(1),
});

export type StoryPlan = z.infer<typeof StoryPlanSchema>;

export const ResearchDigestSchema = z.object({
  query: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceLabel: z.string().min(1),
});

export type ResearchDigest = z.infer<typeof ResearchDigestSchema>;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const ScenePercentSchema = z.number().min(0).max(100);
const SceneOpacitySchema = z.number().min(0).max(1);
const SceneFillSchema = z.string().trim().min(1);

export const StorySceneColorSchema = z.object({
  id: z.string().trim().min(1),
  value: HexColorSchema,
});

export type StorySceneColor = z.infer<typeof StorySceneColorSchema>;

export const StorySceneMotionSchema = z.object({
  preset: z.enum(["still", "float", "drift-x", "drift-y", "pulse", "sway", "bob"]),
  amplitude: z.number().min(0).max(12).optional(),
  speed: z.number().min(0.1).max(12).optional(),
});

export type StorySceneMotion = z.infer<typeof StorySceneMotionSchema>;

const StorySceneShapeElementBaseSchema = z.object({
  id: z.string().trim().min(1),
  x: ScenePercentSchema,
  y: ScenePercentSchema,
  width: z.number().positive().max(100),
  height: z.number().positive().max(100),
  alpha: SceneOpacitySchema.optional(),
  motion: StorySceneMotionSchema.optional(),
});

export const StoryScenePixelSymbolSchema = z.object({
  symbol: z.string().length(1),
  fill: SceneFillSchema,
});

export type StoryScenePixelSymbol = z.infer<typeof StoryScenePixelSymbolSchema>;

export const StorySceneRectElementSchema = StorySceneShapeElementBaseSchema.extend({
  kind: z.literal("rect"),
  fill: SceneFillSchema,
  cornerRadius: z.number().min(0).max(24).optional(),
});

export type StorySceneRectElement = z.infer<typeof StorySceneRectElementSchema>;

export const StorySceneEllipseElementSchema = StorySceneShapeElementBaseSchema.extend({
  kind: z.literal("ellipse"),
  fill: SceneFillSchema,
});

export type StorySceneEllipseElement = z.infer<typeof StorySceneEllipseElementSchema>;

export const StoryScenePixelArtElementSchema = StorySceneShapeElementBaseSchema.extend({
  kind: z.literal("pixel-art"),
  sprite: z.array(z.string().min(1)).min(1).max(48),
  symbols: z.array(StoryScenePixelSymbolSchema).min(1).max(16),
});

export type StoryScenePixelArtElement = z.infer<typeof StoryScenePixelArtElementSchema>;

export const StorySceneElementSchema = z.discriminatedUnion("kind", [
  StorySceneRectElementSchema,
  StorySceneEllipseElementSchema,
  StoryScenePixelArtElementSchema,
]);

export type StorySceneElement = z.infer<typeof StorySceneElementSchema>;

export const StorySceneLayerSchema = z.object({
  id: z.string().trim().min(1),
  depth: z.number(),
  opacity: SceneOpacitySchema.optional(),
  parallax: z.number().min(0).max(4).optional(),
  elements: z.array(StorySceneElementSchema).min(1).max(32),
});

export type StorySceneLayer = z.infer<typeof StorySceneLayerSchema>;

export const StorySceneActorSchema = z
  .object({
    id: z.string().trim().min(1),
    kind: z.enum(["capybara", "pixel-art"]),
    x: ScenePercentSchema,
    y: ScenePercentSchema,
    size: z.number().positive().max(60),
    facing: z.enum(["left", "right", "front", "back"]),
    motion: z.enum(["still", "bob", "listen", "depart", "search", "return", "deliver", "drift"]),
    alpha: SceneOpacitySchema.optional(),
    sprite: z.array(z.string().min(1)).min(1).max(48).optional(),
    symbols: z.array(StoryScenePixelSymbolSchema).min(1).max(16).optional(),
  })
  .superRefine((actor, context) => {
    if (actor.kind !== "pixel-art") {
      return;
    }

    if (!actor.sprite || actor.sprite.length === 0) {
      context.addIssue({
        code: "custom",
        message: "pixel-art actors require sprite rows",
        path: ["sprite"],
      });
    }

    if (!actor.symbols || actor.symbols.length === 0) {
      context.addIssue({
        code: "custom",
        message: "pixel-art actors require a symbol palette",
        path: ["symbols"],
      });
    }
  });

export type StorySceneActor = z.infer<typeof StorySceneActorSchema>;

export const StorySceneSchema = z.object({
  title: z.string().min(1),
  mood: z.enum(["warm", "curious", "excited", "sleepy"]),
  palette: z.array(StorySceneColorSchema).min(1).max(24),
  layers: z.array(StorySceneLayerSchema).max(16).default([]),
  actors: z.array(StorySceneActorSchema).max(4).default([]),
  prompt: z.string().min(1),
  motionCue: z.string().min(1),
});

export type StoryScene = z.infer<typeof StorySceneSchema>;

export const StoryTimelineSchema = z.object({
  tonightQuestion: z.string().min(1),
  capybaraPromise: z.string().min(1),
  morningDelivery: z.string().min(1),
});

export type StoryTimeline = z.infer<typeof StoryTimelineSchema>;

export const StoryMessageDraftSchema = z.object({
  speaker: z.enum(["capybara", "narrator"]),
  text: z.string().min(1),
});

export type StoryMessageDraft = z.infer<typeof StoryMessageDraftSchema>;

export const StoryMessageSchema = StoryMessageDraftSchema.extend({
  id: z.string().min(1),
});

export type StoryMessage = z.infer<typeof StoryMessageSchema>;

export const StoryChoiceDraftSchema = z.object({
  label: z.string().min(1),
  feedback: z.string().min(1),
  correct: z.boolean(),
});

export type StoryChoiceDraft = z.infer<typeof StoryChoiceDraftSchema>;

export const StoryChoiceSchema = StoryChoiceDraftSchema.extend({
  id: z.string().min(1),
});

export type StoryChoice = z.infer<typeof StoryChoiceSchema>;

export const StoryTaskDraftSchema = z.object({
  promptZh: z.string().min(1),
  instructionZh: z.string().min(1),
  vocabulary: z.array(z.string().min(1)).min(2).max(6),
  rewardText: z.string().min(1),
  choices: z.array(StoryChoiceDraftSchema).length(3),
});

export type StoryTaskDraft = z.infer<typeof StoryTaskDraftSchema>;

export const StoryTaskSchema = StoryTaskDraftSchema.extend({
  choices: z.array(StoryChoiceSchema).length(3),
});

export type StoryTask = z.infer<typeof StoryTaskSchema>;

export const WordSpotlightSchema = z.object({
  focusWord: z.string().min(1),
  pronunciation: z.string(),
  meaningZh: z.string(),
  tapHint: z.string().min(1),
  echoLine: z.string().min(1),
});

export type WordSpotlight = z.infer<typeof WordSpotlightSchema>;

export const VocabularyCardDraftSchema = z.object({
  word: z.string().min(1),
  pronunciation: z.string().min(1),
  meaningZh: z.string().min(1),
  partOfSpeech: z.string().min(1),
  tapHint: z.string().min(1),
  example: z.string().min(1),
  exampleZh: z.string().min(1),
});

export type VocabularyCardDraft = z.infer<typeof VocabularyCardDraftSchema>;

export const VocabularyCardSchema = VocabularyCardDraftSchema.extend({
  id: z.string().min(1),
});

export type VocabularyCard = z.infer<typeof VocabularyCardSchema>;

export const StoryLetterSchema = z.object({
  greeting: z.string().min(1),
  body: z.array(z.string().min(1)).min(1).max(6),
  signoff: z.string().min(1),
  postscript: z.string().min(1),
});

export type StoryLetter = z.infer<typeof StoryLetterSchema>;

export const StoryTurnDraftSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().min(1),
  deliveryMode: z.enum(["word-focus", "letter-story"]),
  timeline: StoryTimelineSchema,
  scene: StorySceneSchema,
  narration: z.string().min(1),
  wordSpotlight: WordSpotlightSchema,
  vocabularyCards: z.array(VocabularyCardDraftSchema).min(2).max(8),
  letter: StoryLetterSchema,
  messages: z.array(StoryMessageDraftSchema).min(1).max(6),
  task: StoryTaskDraftSchema,
  suggestedReply: z.string().min(1),
});

export type StoryTurnDraft = z.infer<typeof StoryTurnDraftSchema>;

export const StoryTurnResponseSchema = z.object({
  sessionId: z.string().min(1),
  source: z.literal("openclaw-gateway"),
  kind: z.enum(["welcome", "lesson"]),
  ageBand: z.enum(["3-5", "5-6", "6-8"]),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  deliveryMode: z.enum(["word-focus", "letter-story"]),
  plan: StoryPlanSchema,
  research: ResearchDigestSchema.nullable(),
  timeline: StoryTimelineSchema,
  scene: StorySceneSchema,
  narration: z.string().min(1),
  wordSpotlight: WordSpotlightSchema,
  vocabularyCards: z.array(VocabularyCardSchema).min(2).max(8),
  letter: StoryLetterSchema,
  messages: z.array(StoryMessageSchema).min(1).max(6),
  task: StoryTaskSchema,
  suggestedReply: z.string().min(1),
});

export type StoryTurnResponse = z.infer<typeof StoryTurnResponseSchema>;

export const ConversationEntrySchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "capybara", "narrator"]),
  text: z.string().min(1),
  time: z.string().datetime(),
  sourceDeliveryId: z.string().min(1).optional(),
});

export type ConversationEntry = z.infer<typeof ConversationEntrySchema>;

export const StorySessionStatusSchema = z.enum(["replying", "adventuring"]);

export type StorySessionStatus = z.infer<typeof StorySessionStatusSchema>;

export const DEFAULT_DELIVERY_TIME = "20:30" as const;
const DeliveryTimeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/);

export const WeatherDataSchema = z.object({
  condition: z.string().min(1),
  tempHigh: z.number(),
  tempLow: z.number(),
  humidity: z.number().optional(),
});

export type WeatherData = z.infer<typeof WeatherDataSchema>;

export const EnvironmentSchema = z.object({
  weather: WeatherDataSchema.optional(),
  event: z.string().optional(),
  parentNote: z.string().optional(),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export const LearnerProfileSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().min(3).max(12),
  englishLevel: z.string().min(1),
  interests: z.array(z.string().min(1)),
});

export type LearnerProfile = z.infer<typeof LearnerProfileSchema>;

export const StoryExperienceSettingsSchema = z.object({
  deliveryTime: DeliveryTimeSchema.default(DEFAULT_DELIVERY_TIME),
});

export type StoryExperienceSettings = z.infer<typeof StoryExperienceSettingsSchema>;

export const DEFAULT_STORY_EXPERIENCE_SETTINGS: StoryExperienceSettings = {
  deliveryTime: DEFAULT_DELIVERY_TIME,
};

export const StoryRuntimeModeSchema = z.enum(["live", "test"]);

export type StoryRuntimeMode = z.infer<typeof StoryRuntimeModeSchema>;

export const StoryRuntimeConfigSchema = z.object({
  mode: StoryRuntimeModeSchema.default("live"),
  simulatedNow: z.string().datetime().nullable().default(null),
});

export type StoryRuntimeConfig = z.infer<typeof StoryRuntimeConfigSchema>;

export const DEFAULT_STORY_RUNTIME_CONFIG: StoryRuntimeConfig = {
  mode: "live",
  simulatedNow: null,
};

export const StudyCardSchedulerStateSchema = z.enum(["New", "Learning", "Review", "Relearning"]);

export type StudyCardSchedulerState = z.infer<typeof StudyCardSchedulerStateSchema>;

export const StoryWordRatingSchema = z.enum(["again", "hard", "good", "easy"]);

export type StoryWordRating = z.infer<typeof StoryWordRatingSchema>;

export const StudyCardSchedulerSchema = z.object({
  due: z.string().datetime(),
  stability: z.number(),
  difficulty: z.number(),
  elapsedDays: z.number().int().min(0),
  scheduledDays: z.number().int().min(0),
  learningSteps: z.number().int().min(0),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  state: StudyCardSchedulerStateSchema,
  lastReview: z.string().datetime().nullable(),
});

export type StudyCardScheduler = z.infer<typeof StudyCardSchedulerSchema>;

export const StoryWordCardSchema = VocabularyCardSchema.extend({
  sourceSessionId: z.string().min(1),
  sourceTitle: z.string().min(1),
  sourceDeliveryId: z.string().min(1).optional(),
  encounterCount: z.number().int().min(1),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  lastRating: StoryWordRatingSchema.nullable(),
  scheduler: StudyCardSchedulerSchema,
});

export type StoryWordCard = z.infer<typeof StoryWordCardSchema>;

export const StoryDeliveryRecordSchema = z.object({
  id: z.string().min(1),
  deliveredAt: z.string().datetime(),
  story: StoryTurnResponseSchema,
});

export type StoryDeliveryRecord = z.infer<typeof StoryDeliveryRecordSchema>;

export const StorySessionSnapshotSchema = z.object({
  sessionId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: StorySessionStatusSchema,
  currentStory: StoryTurnResponseSchema.nullable(),
  deliveryLog: z.array(StoryDeliveryRecordSchema).default([]),
  history: z.array(ConversationEntrySchema),
  wordBank: z.array(StoryWordCardSchema),
  environment: EnvironmentSchema.optional(),
  learnerProfile: LearnerProfileSchema.optional(),
  preferences: StoryExperienceSettingsSchema.default(DEFAULT_STORY_EXPERIENCE_SETTINGS),
  runtime: StoryRuntimeConfigSchema.default(DEFAULT_STORY_RUNTIME_CONFIG),
});

export type StorySessionSnapshot = z.infer<typeof StorySessionSnapshotSchema>;

export const StoryBootstrapRequestSchema = z.object({
  age: z.union([z.number().int().min(3).max(12), z.string().trim().min(1)]),
  englishLevel: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
});

export type StoryBootstrapRequest = z.infer<typeof StoryBootstrapRequestSchema>;

export const StoryWordReviewRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  cardId: z.string().trim().min(1),
  rating: StoryWordRatingSchema,
});

export type StoryWordReviewRequest = z.infer<typeof StoryWordReviewRequestSchema>;

export function parseAgeYears(age: StoryTurnRequest["age"]): number {
  if (typeof age === "number") {
    return age;
  }

  const match = age.match(/\d+/);
  if (!match) {
    throw new Error(`Could not parse age from "${age}"`);
  }

  const value = Number.parseInt(match[0], 10);
  if (!Number.isFinite(value) || value < 3 || value > 12) {
    throw new Error(`Age "${age}" is outside the supported range`);
  }

  return value;
}

export function ageBandFromAge(ageYears: number): AgeBand {
  if (ageYears <= 5) {
    return "3-5";
  }
  if (ageYears <= 6) {
    return "5-6";
  }
  return "6-8";
}

export function normalizeStoryTurnRequest(input: unknown): NormalizedStoryTurnRequest {
  const parsed = StoryTurnRequestSchema.parse(input);
  const ageYears = parseAgeYears(parsed.age);

  return {
    message: parsed.message,
    ageYears,
    ageBand: ageBandFromAge(ageYears),
    englishLevel: parsed.englishLevel,
    sessionId: parsed.sessionId?.trim() || undefined,
  };
}
