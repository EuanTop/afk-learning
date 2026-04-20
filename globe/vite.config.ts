import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { handleLessonRequest } from "./src/server/api";

function lessonApiPlugin(): Plugin {
  const handle = (
    req: NodeJS.ReadableStream & { method?: string; url?: string },
    res: {
      statusCode: number;
      setHeader(name: string, value: string): void;
      end(body?: string): void;
    },
    next: () => void
  ) => {
    if (req.method !== "POST" || req.url !== "/api/lesson") {
      next();
      return;
    }

    console.log("[edu-globe-mvp] /api/lesson request received");
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => {
      void (async () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf8");
          const body = raw.length > 0 ? JSON.parse(raw) : {};
          const payload = await handleLessonRequest(body);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(payload));
        } catch (error) {
          console.error("[edu-globe-mvp] lesson api error", error);
          const message = error instanceof Error ? error.message : "Unknown error";
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: message }));
        }
      })();
    });
    req.on("error", (error) => {
      const message = error instanceof Error ? error.message : "Unknown stream error";
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: message }));
    });
  };

  return {
    name: "edu-globe-mvp-api",
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), lessonApiPlugin()]
});
