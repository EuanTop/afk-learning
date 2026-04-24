import { StoryHomePage } from "./StoryHomePage";

export function App() {
  const path = typeof window === "undefined" ? "/" : window.location.pathname;

  if (path.startsWith("/review")) {
    return <StoryHomePage initialView="review" />;
  }

  if (path.startsWith("/parent")) {
    return <StoryHomePage initialView="parent" />;
  }

  if (path.startsWith("/test")) {
    return <StoryHomePage initialView="test" />;
  }

  return <StoryHomePage />;
}
