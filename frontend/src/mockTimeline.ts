import {
  DEFAULT_MOCK_TIMELINE_SESSION_ID,
  buildTimelineMockSession as buildTimelineMockSessionFromShared,
  pickDefaultMockMoment,
  type RawMockTimeline,
} from "@capybara-letter/shared";
import mockData from "../../mock.json";
import { buildAdventurePreview } from "./story-presets";

const timeline = mockData as RawMockTimeline;

function readQuerySessionId(search: URLSearchParams): string | null {
  const candidate = search.get("sessionId")?.trim();
  if (!candidate) {
    return null;
  }
  return candidate;
}

export function resolveMockTimelineOptions() {
  if (typeof window === "undefined") {
    return {
      forceMock: false,
      mockAt: null as string | null,
      sessionId: null as string | null,
    };
  }

  const search = new URLSearchParams(window.location.search);
  const defaultMockAt = pickDefaultMockMoment(timeline.week);
  return {
    forceMock: search.get("source") === "mock",
    mockAt: search.get("mockAt") ?? defaultMockAt,
    sessionId: readQuerySessionId(search),
  };
}

export function buildTimelineMockSession(nowIso?: string, sessionId?: string) {
  return buildTimelineMockSessionFromShared({
    timeline,
    nowIso,
    sessionId: sessionId ?? DEFAULT_MOCK_TIMELINE_SESSION_ID,
    buildBaseScene: (phase) => buildAdventurePreview({ phase }).scene,
  });
}
