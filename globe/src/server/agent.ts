import {
  inferSeason,
  normalizeLessonRequest,
  type GlobeLessonResponse,
  type IntentInterpretation,
  type NormalizedLessonRequest,
  type ResearchBundle,
  type SceneNode,
  type StoryCopy
} from "../shared/types";
import { buildGeneratedPageSource } from "./page-source";
import {
  HeuristicIntentModel,
  HeuristicStoryModel,
  OpenAiIntentModel,
  OpenAiStoryModel,
  type IntentModel,
  type StoryModel
} from "./llm";
import {
  NetworkForestPlantResearchProvider,
  type ForestPlantResearchProvider
} from "./research";

type AgentDeps = {
  intentModel: IntentModel;
  storyModel: StoryModel;
  researchProvider: ForestPlantResearchProvider;
  now: () => Date;
};

function defaultDeps(): AgentDeps {
  return {
    intentModel: new OpenAiIntentModel(),
    storyModel: new OpenAiStoryModel(),
    researchProvider: new NetworkForestPlantResearchProvider(),
    now: () => new Date()
  };
}

function buildPromptSummary(request: NormalizedLessonRequest, season: string, weather: string): string {
  return [
    `The learner is ${request.ageYears} years old in age band ${request.ageBand}.`,
    `English level: ${request.englishLevel}.`,
    `Today feels like ${season} with ${weather}.`,
    "Use a globe-scale data story instead of a fixed local forest picture book.",
    "Keep the lesson dynamic, typed, and interaction-driven."
  ].join(" ");
}

function buildScenes(research: ResearchBundle, story: StoryCopy): SceneNode[] {
  const sorted = [...research.regions].toSorted((a, b) => b.densityScore - a.densityScore);
  const richest = sorted[0];
  const driest = sorted.at(-1) ?? sorted[0];

  return [
    {
      id: "intro",
      kind: "intro",
      promptZh: story.introPrompt,
      nextSceneId: "globe-select"
    },
    {
      id: "globe-select",
      kind: "globe_select",
      promptZh: story.globeQuestion,
      hintZh: story.hintMessage,
      successZh: story.successMessage,
      expectedRegionId: richest.id,
      nextSceneId: "compare"
    },
    {
      id: "compare",
      kind: "compare_cards",
      promptZh: story.comparePrompt,
      hintZh: "先看看哪边更绿、雨更多一点。",
      successZh: `${richest.name} 更容易看到很多森林植物。`,
      options: [
        { id: richest.id, label: richest.name, correct: true },
        { id: driest.id, label: driest.name, correct: false }
      ],
      nextSceneId: "micro"
    },
    {
      id: "micro",
      kind: "micro_evidence",
      promptZh: story.microPrompt,
      hintZh: "找找那片绿色、带叶脉的 leaf。",
      successZh: "对，这就是 leaf。很多绿色植物，会让一块地方看起来更绿。",
      options: [
        { id: "leaf", label: "leaf", correct: true },
        { id: "rock", label: "rock", correct: false },
        { id: "cloud", label: "cloud", correct: false }
      ],
      nextSceneId: "recap"
    },
    {
      id: "recap",
      kind: "recap",
      promptZh: story.recapPrompt,
      hintZh: "想一想，雨多的地方是不是更容易看到很多绿色植物？",
      successZh: "答对啦，你已经能把地球上的植物分布和环境联系起来了。",
      options: story.recapOptions,
      nextSceneId: "complete"
    },
    {
      id: "complete",
      kind: "complete",
      promptZh: "今天我们看见了，地球上不同地方会长着不一样多的森林植物。",
      successZh: "你获得了“地球小观察家”贴纸。"
    }
  ];
}

export async function buildGlobeLesson(
  rawInput: unknown,
  overrides: Partial<AgentDeps> = {}
): Promise<GlobeLessonResponse> {
  const deps = { ...defaultDeps(), ...overrides };
  const request = normalizeLessonRequest(rawInput);
  const season = request.season ?? inferSeason(deps.now());
  const weather = request.weather ?? "cloudy";
  const promptSummary = buildPromptSummary(request, season, weather);

  const intent = await deps.intentModel.interpret({ request, promptSummary });
  const research = await deps.researchProvider.fetchGlobalForestPlants();
  const story = await deps.storyModel.compose({
    request,
    promptSummary,
    intent,
    research
  });

  const responseWithoutSource: Omit<GlobeLessonResponse, "generatedPageSource"> = {
    learnerProfile: {
      ageYears: request.ageYears,
      ageBand: request.ageBand,
      englishLevel: request.englishLevel
    },
    contextSummary: {
      weather,
      season,
      promptSummary
    },
    intent,
    research,
    title: story.headline,
    subtitle: story.subtitle,
    sceneGraph: {
      activeRegionIds: research.regions.map((region) => region.id),
      scenes: buildScenes(research, story)
    }
  };

  return {
    ...responseWithoutSource,
    generatedPageSource: buildGeneratedPageSource(responseWithoutSource)
  };
}

export {
  HeuristicIntentModel,
  HeuristicStoryModel,
  NetworkForestPlantResearchProvider,
  type IntentModel,
  type StoryModel,
  type ForestPlantResearchProvider,
  type IntentInterpretation,
  type ResearchBundle,
  type StoryCopy
};
