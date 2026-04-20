import type { ResearchBundle, RegionData } from "../shared/types";

type RegionTemplate = {
  id: string;
  name: string;
  countryCode: string;
  lat: number;
  lng: number;
  biome: string;
  climateCue: string;
  color: string;
  fallbackCount: number;
};

const REGION_TEMPLATES: RegionTemplate[] = [
  {
    id: "amazon",
    name: "亚马逊附近",
    countryCode: "BR",
    lat: -3.4,
    lng: -62.2,
    biome: "rainforest",
    climateCue: "rainy",
    color: "#4ade80",
    fallbackCount: 12_502_593
  },
  {
    id: "congo",
    name: "刚果盆地附近",
    countryCode: "CD",
    lat: -0.2,
    lng: 21.8,
    biome: "rainforest",
    climateCue: "humid",
    color: "#22c55e",
    fallbackCount: 2_550_000
  },
  {
    id: "southeast_asia",
    name: "东南亚附近",
    countryCode: "ID",
    lat: -0.8,
    lng: 113.9,
    biome: "tropical_forest",
    climateCue: "warm_rain",
    color: "#86efac",
    fallbackCount: 8_400_000
  },
  {
    id: "sahara_edge",
    name: "撒哈拉附近",
    countryCode: "EG",
    lat: 26.8,
    lng: 30.8,
    biome: "dry_edge",
    climateCue: "dry",
    color: "#facc15",
    fallbackCount: 210_000
  }
];

export interface ForestPlantResearchProvider {
  fetchGlobalForestPlants(): Promise<ResearchBundle>;
}

async function fetchCountryPlantCount(countryCode: string): Promise<number> {
  const url = new URL("https://api.gbif.org/v1/occurrence/search");
  url.searchParams.set("kingdom_key", "6");
  url.searchParams.set("country", countryCode);
  url.searchParams.set("limit", "0");

  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) {
    throw new Error(`GBIF request failed for ${countryCode}: ${response.status}`);
  }

  const payload = (await response.json()) as { count?: number };
  if (typeof payload.count !== "number") {
    throw new Error(`GBIF count missing for ${countryCode}`);
  }

  return payload.count;
}

function normalizeRegionScores(regions: Omit<RegionData, "densityScore">[]): RegionData[] {
  const logs = regions.map((region) => Math.log10(Math.max(region.plantOccurrenceCount, 1)));
  const min = Math.min(...logs);
  const max = Math.max(...logs);
  const range = Math.max(max - min, 0.001);

  return regions.map((region, index) => ({
    ...region,
    densityScore: (logs[index] - min) / range
  }));
}

export class NetworkForestPlantResearchProvider implements ForestPlantResearchProvider {
  async fetchGlobalForestPlants(): Promise<ResearchBundle> {
    const counts = await Promise.all(
      REGION_TEMPLATES.map(async (region) => {
        try {
          return await fetchCountryPlantCount(region.countryCode);
        } catch {
          return region.fallbackCount;
        }
      })
    );

    const regions = normalizeRegionScores(
      REGION_TEMPLATES.map((region, index) => ({
        id: region.id,
        name: region.name,
        countryCode: region.countryCode,
        lat: region.lat,
        lng: region.lng,
        biome: region.biome,
        climateCue: region.climateCue,
        plantOccurrenceCount: counts[index],
        color: region.color
      }))
    );

    return {
      queryLabel: "global forest plants",
      regions,
      sources: [
        "GBIF occurrence API: https://api.gbif.org/v1/occurrence/search?kingdom_key=6&country=<CODE>&limit=0"
      ],
      leafLabel: "leaf"
    };
  }
}
