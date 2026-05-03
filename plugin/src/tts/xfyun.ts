import crypto from "node:crypto";
import { URL } from "node:url";
import WebSocket from "ws";
import { ensureCapybaraEnvLoaded } from "../env.js";

type SpeechScope = "letter" | "word";

export type CapybaraSpeechRequest = {
  text: string;
  scope: SpeechScope;
};

export type CapybaraSpeechResult = {
  audioBase64: string;
  mimeType: "audio/mpeg";
  provider: "xfyun";
  voice: string;
  sid?: string;
  cacheKey: string;
};

type XfyunTtsConfig = {
  appId: string;
  apiKey: string;
  apiSecret: string;
  vcn: string;
  speed: number;
  volume: number;
  pitch: number;
};

const XFYUN_HOST = "tts-api.xfyun.cn";
const XFYUN_PATH = "/v2/tts";
const XFYUN_ENDPOINT = `wss://${XFYUN_HOST}${XFYUN_PATH}`;
const MAX_TEXT_BYTES = 8_000;
const REQUEST_TIMEOUT_MS = 20_000;
const speechCache = new Map<string, CapybaraSpeechResult>();

function readRequiredEnv(name: string): string {
  ensureCapybaraEnvLoaded();
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `TTS is not configured. Missing ${name}. Fill capybara-letter/.env (or plugin/.env), or export CAPYBARA_TTS_XFYUN_APP_ID / API_KEY / API_SECRET before starting OpenClaw Gateway.`,
    );
  }
  return value;
}

function readNumberEnv(name: string, fallback: number): number {
  ensureCapybaraEnvLoaded();
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function readConfig(): XfyunTtsConfig {
  return {
    appId: readRequiredEnv("CAPYBARA_TTS_XFYUN_APP_ID"),
    apiKey: readRequiredEnv("CAPYBARA_TTS_XFYUN_API_KEY"),
    apiSecret: readRequiredEnv("CAPYBARA_TTS_XFYUN_API_SECRET"),
    vcn: process.env.CAPYBARA_TTS_XFYUN_VCN?.trim() || "x_lele",
    speed: readNumberEnv("CAPYBARA_TTS_XFYUN_SPEED", 45),
    volume: readNumberEnv("CAPYBARA_TTS_XFYUN_VOLUME", 65),
    pitch: readNumberEnv("CAPYBARA_TTS_XFYUN_PITCH", 50),
  };
}

function buildCacheKey(params: CapybaraSpeechRequest, config: XfyunTtsConfig): string {
  return [
    "xfyun",
    params.scope,
    config.vcn,
    config.speed,
    config.volume,
    config.pitch,
    params.text.trim(),
  ].join(":");
}

function buildAuthUrl(config: XfyunTtsConfig): string {
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${XFYUN_HOST}\ndate: ${date}\nGET ${XFYUN_PATH} HTTP/1.1`;
  const signature = crypto
    .createHmac("sha256", config.apiSecret)
    .update(signatureOrigin)
    .digest("base64");
  const authorizationOrigin = `api_key="${config.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const url = new URL(XFYUN_ENDPOINT);
  url.searchParams.set("host", XFYUN_HOST);
  url.searchParams.set("date", date);
  url.searchParams.set("authorization", Buffer.from(authorizationOrigin).toString("base64"));
  return url.toString();
}

function buildPayload(params: CapybaraSpeechRequest, config: XfyunTtsConfig) {
  const text = params.text.trim();
  const byteLength = Buffer.byteLength(text, "utf8");
  if (!text) {
    throw new Error("TTS request text is empty.");
  }
  if (byteLength > MAX_TEXT_BYTES) {
    throw new Error(`TTS text is too long (${byteLength} bytes). iFlytek online TTS supports < 8000 bytes per request.`);
  }
  return {
    common: {
      app_id: config.appId,
    },
    business: {
      aue: "lame",
      sfl: 1,
      auf: "audio/L16;rate=16000",
      vcn: config.vcn,
      speed: config.speed,
      volume: config.volume,
      pitch: config.pitch,
      tte: "UTF8",
      reg: "0",
      rdn: "0",
    },
    data: {
      status: 2,
      text: Buffer.from(text, "utf8").toString("base64"),
    },
  };
}

type XfyunResponseFrame = {
  code?: number;
  message?: string;
  sid?: string;
  data?: {
    audio?: string;
    status?: number;
  } | null;
};

export async function synthesizeSpeech(params: CapybaraSpeechRequest): Promise<CapybaraSpeechResult> {
  const config = readConfig();
  const cacheKey = buildCacheKey(params, config);
  const cached = speechCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const payload = buildPayload(params, config);
  const url = buildAuthUrl(config);

  const result = await new Promise<CapybaraSpeechResult>((resolve, reject) => {
    const ws = new WebSocket(url);
    const audioChunks: Buffer[] = [];
    let settled = false;
    let sid: string | undefined;

    const finalize = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      ws.removeAllListeners();
      callback();
    };

    const fail = (error: Error) => {
      finalize(() => {
        try {
          ws.close(1000);
        } catch {
          // ignore close errors on failure path
        }
        reject(error);
      });
    };

    const timeout = setTimeout(() => {
      fail(new Error("TTS request timed out while waiting for iFlytek audio."));
    }, REQUEST_TIMEOUT_MS);

    ws.on("open", () => {
      ws.send(JSON.stringify(payload));
    });

    ws.on("message", (raw) => {
      let frame: XfyunResponseFrame;
      try {
        frame = JSON.parse(raw.toString()) as XfyunResponseFrame;
      } catch {
        fail(new Error("TTS provider returned malformed JSON."));
        return;
      }

      if ((frame.code ?? 0) !== 0) {
        fail(new Error(frame.message?.trim() || `TTS provider error ${frame.code}`));
        return;
      }

      sid = frame.sid ?? sid;
      if (frame.data?.audio) {
        audioChunks.push(Buffer.from(frame.data.audio, "base64"));
      }

      if (frame.data?.status === 2) {
        const audioBase64 = Buffer.concat(audioChunks).toString("base64");
        if (!audioBase64) {
          fail(new Error("TTS provider completed without returning audio."));
          return;
        }

        finalize(() => {
          try {
            ws.close(1000);
          } catch {
            // ignore close errors after success
          }
          resolve({
            audioBase64,
            mimeType: "audio/mpeg",
            provider: "xfyun",
            voice: config.vcn,
            sid,
            cacheKey,
          });
        });
      }
    });

    ws.on("error", (error) => {
      fail(error instanceof Error ? error : new Error(String(error)));
    });

    ws.on("close", (_code, _reason) => {
      if (!settled) {
        fail(new Error("TTS connection closed before audio completed."));
      }
    });
  });

  speechCache.set(cacheKey, result);
  return result;
}
