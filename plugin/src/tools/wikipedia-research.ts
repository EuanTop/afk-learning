import type { ResearchDigest } from "@capybara-letter/shared";

type WikipediaSearchResponse = [string, string[], string[], string[]];

type WikipediaSummaryResponse = {
  title?: string;
  extract?: string;
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
};

function buildResearchCandidates(rawQuery: string): string[] {
  const trimmed = rawQuery.trim();
  const withoutIntent = trimmed
    .replace(/^我想(了解|学习)/, "")
    .replace(/^想(了解|学习)/, "")
    .replace(/相关(的)?(知识|内容|信息)?$/, "")
    .trim();

  return [trimmed, withoutIntent].filter(
    (value, index, array) => value.length > 0 && array.indexOf(value) === index,
  );
}

async function searchWikipediaTitle(
  query: string,
): Promise<{ title: string; sourceLabel: string } | null> {
  const searchUrl = new URL("https://zh.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "opensearch");
  searchUrl.searchParams.set("limit", "1");
  searchUrl.searchParams.set("namespace", "0");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");
  searchUrl.searchParams.set("search", query);

  const response = await fetch(searchUrl, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as WikipediaSearchResponse;
  const title = Array.isArray(payload[1]) ? payload[1][0] : undefined;
  if (typeof title !== "string" || title.trim().length === 0) {
    return null;
  }

  return { title, sourceLabel: "Wikipedia" };
}

export async function fetchWikipediaResearch(query: string): Promise<ResearchDigest | null> {
  for (const candidate of buildResearchCandidates(query)) {
    try {
      const resolved = await searchWikipediaTitle(candidate);
      if (!resolved) {
        continue;
      }

      const summaryUrl = `https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(resolved.title)}`;
      const response = await fetch(summaryUrl, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as WikipediaSummaryResponse;
      const summary = payload.extract?.trim();
      const sourceUrl = payload.content_urls?.desktop?.page?.trim();
      if (!summary || !sourceUrl) {
        continue;
      }

      return {
        query: candidate,
        title: payload.title?.trim() || resolved.title,
        summary,
        sourceUrl,
        sourceLabel: resolved.sourceLabel,
      };
    } catch {
      continue;
    }
  }

  return null;
}
