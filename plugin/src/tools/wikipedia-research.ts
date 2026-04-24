import type { ResearchDigest } from "../shared/types.js";

type BritannicaSearchHit = {
  title: string;
  summary: string;
  sourceUrl: string;
  sourceLabel: string;
};

const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
} as const;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSummary(value: string, maxLength = 320): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildResearchCandidates(rawQuery: string): string[] {
  const trimmed = rawQuery.trim();
  const withoutIntent = trimmed
    .replace(/^我想(了解|学习|知道)/, "")
    .replace(/^想(了解|学习|知道)/, "")
    .replace(/^请(帮我)?(介绍|讲讲|搜索|查一下)/, "")
    .replace(/(相关(的)?(知识|内容|信息)?|是什么|有哪些)$/u, "")
    .replace(/[！？?!.。]+$/u, "")
    .trim();
  const withoutNoise = withoutIntent
    .replace(/\s+/g, " ")
    .replace(/^(about|learn|study|tell me about)\s+/i, "")
    .trim();

  return [trimmed, withoutIntent, withoutNoise].filter(
    (value, index, array) => value.length > 0 && array.indexOf(value) === index,
  );
}

async function fetchHtml(url: string, timeoutMs = 8_000): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

function parseBritannicaResultList(html: string): BritannicaSearchHit[] {
  const matches = html.matchAll(
    /<li class="mb-45 RESULT-\d+"[\s\S]*?<a class="font-weight-bold font-18" href="([^"]+)"[^>]*>\s*([\s\S]*?)<\/a>[\s\S]*?<div class="mt-5 font-weight-normal">\s*([\s\S]*?)<\/div>/gi,
  );
  const hits: BritannicaSearchHit[] = [];

  for (const match of matches) {
    const relativeUrl = match[1]?.trim();
    const title = stripHtml(match[2] ?? "");
    const summary = compactSummary(stripHtml(match[3] ?? ""));
    if (!relativeUrl || !title || !summary) {
      continue;
    }
    if (relativeUrl.startsWith("/video/")) {
      continue;
    }

    hits.push({
      title,
      summary,
      sourceUrl: new URL(relativeUrl, "https://www.britannica.com").toString(),
      sourceLabel: "Britannica",
    });
  }

  return hits;
}

async function enrichBritannicaHit(hit: BritannicaSearchHit): Promise<BritannicaSearchHit> {
  const html = await fetchHtml(hit.sourceUrl, 10_000);
  if (!html) {
    return hit;
  }

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/i);
  const descriptionMatch = html.match(/<meta name="description" content="([^"]+)"/i);

  return {
    title:
      stripHtml(titleMatch?.[1] ?? "")
        .replace(/\s*\|\s*Britannica\s*$/i, "")
        .trim() || hit.title,
    summary: compactSummary(stripHtml(descriptionMatch?.[1] ?? "")) || hit.summary,
    sourceUrl: canonicalMatch?.[1]?.trim() || hit.sourceUrl,
    sourceLabel: hit.sourceLabel,
  };
}

async function fetchBritannicaResearch(query: string): Promise<BritannicaSearchHit | null> {
  const searchUrl = `https://www.britannica.com/search?query=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl, 10_000);
  if (!html) {
    return null;
  }

  const hits = parseBritannicaResultList(html);
  if (hits.length === 0) {
    return null;
  }

  return await enrichBritannicaHit(hits[0]!);
}

function extractBingFirstResult(html: string): BritannicaSearchHit | null {
  const match = html.match(
    /<li class="b_algo"[\s\S]*?<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?<div class="b_caption"><p[^>]*>([\s\S]*?)<\/p>/i,
  );
  if (!match) {
    return null;
  }

  const sourceUrl = match[1]?.trim();
  const title = stripHtml(match[2] ?? "");
  const summary = compactSummary(stripHtml(match[3] ?? ""));
  if (!sourceUrl || !title || !summary) {
    return null;
  }

  let sourceLabel = "Bing Search";
  try {
    sourceLabel = new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    // Keep the generic label if the result URL is not a standard absolute URL.
  }

  return {
    title,
    summary,
    sourceUrl,
    sourceLabel,
  };
}

async function fetchBingResearch(query: string): Promise<BritannicaSearchHit | null> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url, 10_000);
  if (!html) {
    return null;
  }
  return extractBingFirstResult(html);
}

export async function fetchWikipediaResearch(query: string): Promise<ResearchDigest | null> {
  const candidates = buildResearchCandidates(query).slice(0, 4);

  for (const candidate of candidates) {
    const britannica = await fetchBritannicaResearch(candidate);
    if (britannica) {
      return {
        query: candidate,
        title: britannica.title,
        summary: britannica.summary,
        sourceUrl: britannica.sourceUrl,
        sourceLabel: britannica.sourceLabel,
      };
    }
  }

  for (const candidate of candidates) {
    const bing = await fetchBingResearch(candidate);
    if (bing) {
      return {
        query: candidate,
        title: bing.title,
        summary: bing.summary,
        sourceUrl: bing.sourceUrl,
        sourceLabel: bing.sourceLabel,
      };
    }
  }

  return null;
}
