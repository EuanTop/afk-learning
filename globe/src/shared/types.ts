import { z } from "zod";

export const RawLessonRequestSchema = z.object({
  message: z.string().trim().min(1),
  age: z.union([z.number().int().min(3).max(12), z.string().trim().min(1)]),
  englishLevel: z.string().trim().min(1),
  weather: z.string().trim().optional(),
  season: z.string().trim().optional()
});

export type RawLessonRequest = z.infer<typeof RawLessonRequestSchema>;

export type AgeBand = "3-5" | "5-6" | "6-8";

export type NormalizedLessonRequest = {
  message: string;
  ageYears: number;
  ageBand: AgeBand;
  englishLevel: string;
  weather?: string;
  season?: string;
};

export type IntentInterpretation = {
  domain: string;
  userNeed: "learn_topic" | "ask_question" | "free_explore";
  goalType: "story_inquiry" | "compare" | "classification";
  searchFocus: string[];
  targetVocabulary: string[];
  reasoning: string;
};

export type StoryCopy = {
  headline: string;
  subtitle: string;
  introPrompt: string;
  globeQuestion: string;
  comparePrompt: string;
  microPrompt: string;
  recapPrompt: string;
  recapOptions: Array<{ id: string; label: string; correct: boolean }>;
  successMessage: string;
  hintMessage: string;
};

export type RegionData = {
  id: string;
  name: string;
  countryCode: string;
  lat: number;
  lng: number;
  biome: string;
  climateCue: string;
  plantOccurrenceCount: number;
  densityScore: number;
  color: string;
};

export type ResearchBundle = {
  queryLabel: string;
  regions: RegionData[];
  sources: string[];
  leafLabel: string;
};

export type SceneKind =
  | "intro"
  | "globe_select"
  | "compare_cards"
  | "micro_evidence"
  | "recap"
  | "complete";

export type SceneNode = {
  id: string;
  kind: SceneKind;
  promptZh: string;
  hintZh?: string;
  successZh?: string;
  expectedRegionId?: string;
  options?: Array<{ id: string; label: string; correct: boolean }>;
  nextSceneId?: string;
};

export type GlobeLessonResponse = {
  learnerProfile: {
    ageYears: number;
    ageBand: AgeBand;
    englishLevel: string;
  };
  contextSummary: {
    weather: string;
    season: string;
    promptSummary: string;
  };
  intent: IntentInterpretation;
  research: ResearchBundle;
  title: string;
  subtitle: string;
  sceneGraph: {
    activeRegionIds: string[];
    scenes: SceneNode[];
  };
  generatedPageSource: string;
};

export const IntentInterpretationSchema = z.object({
  domain: z.string().min(1),
  userNeed: z.enum(["learn_topic", "ask_question", "free_explore"]),
  goalType: z.enum(["story_inquiry", "compare", "classification"]),
  searchFocus: z.array(z.string().min(1)).min(1),
  targetVocabulary: z.array(z.string().min(1)).min(1),
  reasoning: z.string().min(1)
});

export const StoryCopySchema = z.object({
  headline: z.string().min(1),
  subtitle: z.string().min(1),
  introPrompt: z.string().min(1),
  globeQuestion: z.string().min(1),
  comparePrompt: z.string().min(1),
  microPrompt: z.string().min(1),
  recapPrompt: z.string().min(1),
  recapOptions: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        correct: z.boolean()
      })
    )
    .length(3),
  successMessage: z.string().min(1),
  hintMessage: z.string().min(1)
});

export function parseAgeYears(age: RawLessonRequest["age"]): number {
  if (typeof age === "number") {
    return age;
  }

  const match = age.match(/\d+/);
  if (!match) {
    throw new Error(`Could not parse age from "${age}"`);
  }

  const value = Number.parseInt(match[0], 10);
  if (!Number.isFinite(value) || value < 3 || value > 12) {
    throw new Error(`Age "${age}" is outside the supported MVP range`);
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

export function inferSeason(date = new Date()): string {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) {
    return "spring";
  }
  if (month >= 6 && month <= 8) {
    return "summer";
  }
  if (month >= 9 && month <= 11) {
    return "autumn";
  }
  return "winter";
}

export function normalizeLessonRequest(input: unknown): NormalizedLessonRequest {
  const parsed = RawLessonRequestSchema.parse(input);
  const ageYears = parseAgeYears(parsed.age);

  return {
    message: parsed.message,
    ageYears,
    ageBand: ageBandFromAge(ageYears),
    englishLevel: parsed.englishLevel,
    weather: parsed.weather?.trim() || undefined,
    season: parsed.season?.trim() || undefined
  };
}
