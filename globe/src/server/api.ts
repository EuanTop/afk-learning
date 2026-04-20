import { buildGlobeLesson } from "./agent";

export async function handleLessonRequest(body: unknown) {
  return buildGlobeLesson(body);
}
