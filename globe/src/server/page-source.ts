import type { GlobeLessonResponse } from "../shared/types";

export function buildGeneratedPageSource(response: Omit<GlobeLessonResponse, "generatedPageSource">): string {
  return [
    "import { GlobeStoryExperience } from './GlobeStoryExperience';",
    "",
    "export function GeneratedForestPlantsPage() {",
    "  return (",
    "    <GlobeStoryExperience",
    `      title=${JSON.stringify(response.title)}`,
    `      subtitle=${JSON.stringify(response.subtitle)}`,
    `      regions={${JSON.stringify(response.research.regions, null, 2)}}`,
    `      scenes={${JSON.stringify(response.sceneGraph.scenes, null, 2)}}`,
    "    />",
    "  );",
    "}"
  ].join("\n");
}
