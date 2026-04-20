import { LabPage } from "./LabPage";
import { StoryHomePage } from "./StoryHomePage";

export function App() {
  const path = typeof window === "undefined" ? "/" : window.location.pathname;

  if (path.startsWith("/lab")) {
    return <LabPage />;
  }

  return <StoryHomePage />;
}
