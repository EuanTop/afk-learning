import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let envLoaded = false;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvFile(content: string): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
      continue;
    }

    const value = unquote(normalized.slice(separatorIndex + 1));
    entries.push({ key, value });
  }

  return entries;
}

function resolveEnvCandidates(): string[] {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const pluginRoot = path.resolve(moduleDir, "..");
  const repoRoot = path.resolve(pluginRoot, "..");
  const explicitFile = process.env.CAPYBARA_LETTER_ENV_FILE?.trim();

  const candidates = [
    explicitFile ? path.resolve(process.cwd(), explicitFile) : null,
    path.join(repoRoot, ".env"),
    path.join(repoRoot, ".env.local"),
    path.join(pluginRoot, ".env"),
    path.join(pluginRoot, ".env.local"),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates)];
}

export function ensureCapybaraEnvLoaded() {
  if (envLoaded) {
    return;
  }
  envLoaded = true;

  const protectedKeys = new Set(Object.keys(process.env));

  for (const filePath of resolveEnvCandidates()) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");
    for (const { key, value } of parseEnvFile(content)) {
      if (protectedKeys.has(key)) {
        continue;
      }
      process.env[key] = value;
    }
  }
}
