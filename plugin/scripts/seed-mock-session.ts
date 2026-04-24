import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_MOCK_TIMELINE_SESSION_ID,
  buildTimelineMockSession,
  type RawMockTimeline,
} from "../../shared/src/mock-session-projection.ts";
import {
  loadConfig,
  recordSessionMetaFromInbound,
  resolveStorePath,
  updateLastRoute,
} from "openclaw/plugin-sdk/config-runtime";
import { buildChannelOutboundSessionRoute } from "openclaw/plugin-sdk/channel-core";
import { resolveCapybaraLetterAccount } from "../src/accounts.ts";
import type { CoreConfig } from "../src/types.ts";
import { CapybaraLetterSessionStore } from "../src/tools/session-store.ts";

type SeedOptions = {
  sessionId: string;
  mockAt?: string;
  accountId?: string;
};

function parseArgs(argv: string[]): SeedOptions {
  const opts: SeedOptions = {
    sessionId: DEFAULT_MOCK_TIMELINE_SESSION_ID,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if ((arg === "--session-id" || arg === "-s") && value) {
      opts.sessionId = value.trim();
      i += 1;
      continue;
    }
    if ((arg === "--mock-at" || arg === "-t") && value) {
      opts.mockAt = value.trim();
      i += 1;
      continue;
    }
    if ((arg === "--account-id" || arg === "-a") && value) {
      opts.accountId = value.trim();
      i += 1;
    }
  }

  return opts;
}

async function readMockTimeline(): Promise<RawMockTimeline> {
  const filePath = path.resolve(process.cwd(), "../mock.json");
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as RawMockTimeline;
}

function buildInboundContext(params: {
  sessionId: string;
  text: string;
  timestamp: string;
  accountId: string;
}) {
  const senderId = `learner:${params.sessionId}`;
  const target = `capybara-letter:${params.sessionId}`;
  return {
    Body: params.text,
    BodyForAgent: params.text,
    RawBody: params.text,
    CommandBody: params.text,
    From: senderId,
    To: target,
    SessionKey: "",
    AccountId: params.accountId,
    ChatType: "direct",
    ConversationLabel: `Capybara's Letter - ${params.sessionId}`,
    SenderName: "Learner",
    SenderId: senderId,
    Provider: "capybara-letter",
    Surface: "capybara-letter",
    MessageSid: `seed-${Date.now()}`,
    MessageSidFull: `seed-${Date.now()}`,
    Timestamp: params.timestamp,
    OriginatingChannel: "capybara-letter",
    OriginatingTo: target,
    CommandAuthorized: true,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.sessionId) {
    throw new Error("sessionId must not be empty");
  }

  const timeline = await readMockTimeline();
  const snapshot = buildTimelineMockSession({
    timeline,
    nowIso: opts.mockAt,
    sessionId: opts.sessionId,
  });

  const sessionsRoot = path.join(os.homedir(), ".openclaw", "capybara-letter", "sessions");
  const snapshotStore = new CapybaraLetterSessionStore(sessionsRoot);
  await snapshotStore.replaceSnapshot(snapshot);

  const cfg = (await loadConfig()) as CoreConfig;
  const account = resolveCapybaraLetterAccount({
    cfg,
    accountId: opts.accountId,
  });

  const target = `capybara-letter:${opts.sessionId}`;
  const senderId = `learner:${opts.sessionId}`;
  const route = buildChannelOutboundSessionRoute({
    cfg,
    agentId: account.agentId,
    channel: "capybara-letter",
    accountId: account.accountId,
    peer: { kind: "direct", id: target },
    chatType: "direct",
    from: senderId,
    to: target,
  });
  const openclawStorePath = resolveStorePath(cfg.session?.store, {
    agentId: account.agentId,
  });

  const latestEntry = [...snapshot.history].toReversed()[0];
  const ctx = buildInboundContext({
    sessionId: opts.sessionId,
    text: latestEntry?.text ?? "Seeded mock session snapshot",
    timestamp: snapshot.updatedAt,
    accountId: account.accountId,
  });

  await recordSessionMetaFromInbound({
    storePath: openclawStorePath,
    sessionKey: route.sessionKey,
    ctx,
  });
  await updateLastRoute({
    storePath: openclawStorePath,
    sessionKey: route.sessionKey,
    channel: "capybara-letter",
    to: target,
    accountId: account.accountId,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        sessionId: snapshot.sessionId,
        routeSessionKey: route.sessionKey,
        snapshotFile: path.join(sessionsRoot, `${snapshot.sessionId}.json`),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[seed-mock-session] ${message}`);
  process.exitCode = 1;
});
