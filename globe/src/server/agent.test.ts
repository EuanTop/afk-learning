import { describe, expect, it, vi } from "vitest";
import { buildGlobeLesson, type ForestPlantResearchProvider, type IntentModel, type StoryModel } from "./agent";
import type { IntentInterpretation, ResearchBundle, StoryCopy } from "../shared/types";

class FakeIntentModel implements IntentModel {
  public readonly interpret = vi.fn(async () => {
    const value: IntentInterpretation = {
      domain: "global forest plants",
      userNeed: "learn_topic",
      goalType: "story_inquiry",
      searchFocus: ["global forest plants", "rainforest regions"],
      targetVocabulary: ["forest", "leaf", "green", "rain"],
      reasoning: "The learner asked to study forest plants, so the agent should open a globe-scale distribution story."
    };
    return value;
  });
}

class FakeStoryModel implements StoryModel {
  public readonly compose = vi.fn(async () => {
    const value: StoryCopy = {
      headline: "地球上哪里长着更多森林植物？",
      subtitle: "转动地球，看看哪些地方更绿。",
      introPrompt: "今天我们不只看一棵树，我们来看整个地球。",
      globeQuestion: "你猜，哪里会有更多森林植物？",
      comparePrompt: "看看这两个地方，哪边更容易长很多植物？",
      microPrompt: "很多森林植物都有叶子。你还记得 leaf 吗？",
      recapPrompt: "雨多的地方，常常有更多什么？",
      recapOptions: [
        { id: "forest-plants", label: "forest plants", correct: true },
        { id: "cars", label: "cars", correct: false },
        { id: "rocks", label: "rocks", correct: false }
      ],
      successMessage: "你找到了更绿的地方。",
      hintMessage: "先看看哪块地方更绿。"
    };
    return value;
  });
}

class FakeResearchProvider implements ForestPlantResearchProvider {
  public readonly fetchGlobalForestPlants = vi.fn(async () => {
    const value: ResearchBundle = {
      queryLabel: "global forest plants",
      leafLabel: "leaf",
      sources: ["fake-source"],
      regions: [
        {
          id: "amazon",
          name: "亚马逊附近",
          countryCode: "BR",
          lat: -3.4,
          lng: -62.2,
          biome: "rainforest",
          climateCue: "rainy",
          plantOccurrenceCount: 12000000,
          densityScore: 1,
          color: "#4ade80"
        },
        {
          id: "sahara_edge",
          name: "撒哈拉附近",
          countryCode: "EG",
          lat: 26.8,
          lng: 30.8,
          biome: "dry_edge",
          climateCue: "dry",
          plantOccurrenceCount: 200000,
          densityScore: 0,
          color: "#facc15"
        }
      ]
    };
    return value;
  });
}

describe("buildGlobeLesson", () => {
  it("runs the MVP pipeline for '我想学习森林植物' with age 8 and 新概念一级", async () => {
    const intentModel = new FakeIntentModel();
    const storyModel = new FakeStoryModel();
    const researchProvider = new FakeResearchProvider();

    const result = await buildGlobeLesson(
      {
        message: "我想学习森林植物",
        age: "8岁",
        englishLevel: "新概念一级"
      },
      {
        intentModel,
        storyModel,
        researchProvider,
        now: () => new Date("2026-04-18T16:05:00+08:00")
      }
    );

    expect(result.learnerProfile.ageYears).toBe(8);
    expect(result.learnerProfile.ageBand).toBe("6-8");
    expect(result.learnerProfile.englishLevel).toBe("新概念一级");
    expect(result.intent.domain).toBe("global forest plants");
    expect(result.research.regions).toHaveLength(2);
    expect(result.sceneGraph.scenes[1]?.kind).toBe("globe_select");
    expect(result.sceneGraph.scenes[1]?.expectedRegionId).toBe("amazon");
    expect(result.generatedPageSource).toContain("GeneratedForestPlantsPage");
    expect(result.generatedPageSource).toContain("GlobeStoryExperience");
    expect(intentModel.interpret).toHaveBeenCalledOnce();
    expect(storyModel.compose).toHaveBeenCalledOnce();
    expect(researchProvider.fetchGlobalForestPlants).toHaveBeenCalledOnce();
  });
});
