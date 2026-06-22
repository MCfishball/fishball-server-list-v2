import { App } from "./App";
import { FeedbackPage } from "./pages/FeedbackPage";
import { SubmitServerPage } from "./pages/SubmitServerPage";

export function Router() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path.startsWith("/forum/posts/")) {
    return <App initialPostId={decodeURIComponent(path.replace("/forum/posts/", ""))} />;
  }

  if (path === "/forum") return <App />;
  if (path === "/feedback") return <FeedbackPage />;
  if (path === "/submit-server") return <SubmitServerPage />;

  // The root route is intentionally preserved. In the real V1 repository this
  // fallback remains the existing V1 router/application.
  return <App />;
}
