import OpenAI from "openai";
import {
  IntentInterpretationSchema,
  StoryCopySchema,
  type IntentInterpretation,
  type NormalizedLessonRequest,
  type ResearchBundle,
  type StoryCopy
} from "../shared/types";

export interface IntentModel {
  interpret(params: {
    request: NormalizedLessonRequest;
    promptSummary: string;
  }): Promise<IntentInterpretation>;
}

export interface StoryModel {
  compose(params: {
    request: NormalizedLessonRequest;
    promptSummary: string;
    intent: IntentInterpretation;
    research: ResearchBundle;
  }): Promise<StoryCopy>;
}

type JsonSchema<T> = {
  schemaName: string;
  prompt: string;
  fallback: T;
  parse: (value: unknown) => T;
};

class OpenAiJsonRuntime {
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  }

  async run<T>(params: JsonSchema<T>): Promise<T> {
    if (!this.client) {
      return params.fallback;
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You build dynamic child-learning agents. Prefer flexible interpretation and typed JSON outputs. Never output markdown fences."
          },
          { role: "user", content: params.prompt }
        ]
      });

      const content = response.choices[0]?.message?.content ?? "";
      return params.parse(JSON.parse(content));
    } catch {
      return params.fallback;
    }
  }
}

export class OpenAiIntentModel implements IntentModel {
  private readonly runtime = new OpenAiJsonRuntime();

  async interpret(params: {
    request: NormalizedLessonRequest;
    promptSummary: string;
  }): Promise<IntentInterpretation> {
    const fallback = buildHeuristicIntent(params.request);
    return this.runtime.run({
      schemaName: "IntentInterpretation",
      fallback,
      parse: (value) => IntentInterpretationSchema.parse(value),
      prompt: [
        "You are the intent interpreter for a dynamic education agent.",
        "Return strict JSON only.",
        "The user may say broad topics; reinterpret them into a globe-scale learning topic when appropriate.",
        `User message: ${params.request.message}`,
        `Age band: ${params.request.ageBand}`,
        `English level: ${params.request.englishLevel}`,
        `Context summary: ${params.promptSummary}`,
        "Required fields:",
        JSON.stringify({
          domain: "global forest plants",
          userNeed: "learn_topic",
          goalType: "story_inquiry",
          searchFocus: ["global forest plants", "rainforest regions"],
          targetVocabulary: ["forest", "leaf", "green", "rain"],
          reasoning: "why this topic fits today's learner state"
        })
      ].join("\n")
    });
  }
}

export class OpenAiStoryModel implements StoryModel {
  private readonly runtime = new OpenAiJsonRuntime();

  async compose(params: {
    request: NormalizedLessonRequest;
    promptSummary: string;
    intent: IntentInterpretation;
    research: ResearchBundle;
  }): Promise<StoryCopy> {
    const sorted = [...params.research.regions].toSorted((a, b) => b.densityScore - a.densityScore);
    const top = sorted[0];
    const low = sorted.at(-1) ?? sorted[0];
    const fallback = buildHeuristicStory(top.name, low.name);

    return this.runtime.run({
      schemaName: "StoryCopy",
      fallback,
      parse: (value) => StoryCopySchema.parse(value),
      prompt: [
        "You are the story planner for a globe-scale child learning experience.",
        "Return strict JSON only.",
        "Keep Chinese prompts short, warm, and observation-driven.",
        `User message: ${params.request.message}`,
        `Age band: ${params.request.ageBand}`,
        `English level: ${params.request.englishLevel}`,
        `Context summary: ${params.promptSummary}`,
        `Intent: ${JSON.stringify(params.intent)}`,
        `Regions: ${JSON.stringify(
          params.research.regions.map((region) => ({
            name: region.name,
            biome: region.biome,
            climateCue: region.climateCue,
            count: region.plantOccurrenceCount
          }))
        )}`,
        "Required fields:",
        JSON.stringify(fallback)
      ].join("\n")
    });
  }
}

export class HeuristicIntentModel implements IntentModel {
  async interpret(params: {
    request: NormalizedLessonRequest;
    promptSummary: string;
  }): Promise<IntentInterpretation> {
    return buildHeuristicIntent(params.request);
  }
}

export class HeuristicStoryModel implements StoryModel {
  async compose(params: {
    request: NormalizedLessonRequest;
    promptSummary: string;
    intent: IntentInterpretation;
    research: ResearchBundle;
  }): Promise<StoryCopy> {
    const sorted = [...params.research.regions].toSorted((a, b) => b.densityScore - a.densityScore);
    return buildHeuristicStory(sorted[0]?.name ?? "热带森林", sorted.at(-1)?.name ?? "干燥地区");
  }
}

function buildHeuristicIntent(request: NormalizedLessonRequest): IntentInterpretation {
  return {
    domain: "global forest plants",
    userNeed: "learn_topic",
    goalType: "story_inquiry",
    searchFocus: ["global forest plants", "forest distribution on earth", "rainforest regions"],
    targetVocabulary: ["forest", "leaf", "green", "rain"],
    reasoning: `The learner asked about forest plants, is in age band ${request.ageBand}, and can start comparing global plant distribution rather than memorizing isolated words.`
  };
}

function buildHeuristicStory(topRegion: string, lowRegion: string): StoryCopy {
  return {
    headline: "地球上哪里长着更多森林植物？",
    subtitle: "转动地球，看看哪些地方更绿，哪些地方植物更少。",
    introPrompt: "你看，地球上有些地方绿绿的，有好多森林植物。我们一起找找看，哪里更多。",
    globeQuestion: `你猜，${topRegion} 和 ${lowRegion} 这些地方，哪里会有更多森林植物？`,
    comparePrompt: `看看 ${topRegion} 和 ${lowRegion}，哪边更容易长很多植物？`,
    microPrompt: "很多森林植物都有很多叶子。你还记得 leaf 是哪一个吗？",
    recapPrompt: "雨多、环境更湿润的地方，常常有更多什么？",
    recapOptions: [
      { id: "forest-plants", label: "forest plants", correct: true },
      { id: "cars", label: "cars", correct: false },
      { id: "rocks", label: "rocks", correct: false }
    ],
    successMessage: "对啦，你已经找到更绿、植物更多的地方了。",
    hintMessage: "先看看，哪一块更绿、植物点更多一点。"
  };
}
