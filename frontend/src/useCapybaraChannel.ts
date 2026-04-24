import type { StorySessionSnapshot } from "@capybara-letter/shared";
import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export type ServerFrame =
  | { type: "delivery"; payload: import("@capybara-letter/shared").StoryTurnResponse }
  | { type: "snapshot"; payload: StorySessionSnapshot }
  | { type: "delta"; text: string }
  | { type: "error"; message: string }
  | { type: "status"; state: "thinking" | "researching" | "composing" | "idle" }
  | { type: "connected"; sessionId: string }
  | { type: "pong" };

export type ClientFrame =
  | { type: "message"; text: string; meta?: { age?: number; englishLevel?: string } }
  | { type: "bootstrap"; age: number; englishLevel: string; sessionId?: string }
  | { type: "review-word"; cardId: string; rating: "again" | "hard" | "good" | "easy" }
  | { type: "update-profile"; profile: { name: string; age: number; englishLevel: string; interests: string[] } }
  | { type: "update-environment"; environment: { weather?: unknown; event?: string; parentNote?: string } }
  | { type: "update-preferences"; preferences: { deliveryTime?: string } }
  | { type: "update-runtime"; runtime: { mode?: "live" | "test"; simulatedNow?: string | null } }
  | { type: "ping" };

type UseCapybaraChannelOptions = {
  enabled?: boolean;
  url: string;
  age: number;
  englishLevel: string;
  sessionId: string | null;
  onSessionId: (id: string) => void;
  onSnapshot: (snapshot: StorySessionSnapshot) => void;
  onDelta: (text: string) => void;
  onStatus: (state: "thinking" | "researching" | "composing" | "idle") => void;
  onError: (message: string) => void;
};

export function useCapybaraChannel(options: UseCapybaraChannelOptions) {
  const {
    enabled = true,
    url,
    age,
    englishLevel,
    sessionId,
    onSessionId,
    onSnapshot,
    onDelta,
    onStatus,
    onError,
  } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const manuallyClosedRef = useRef(false);
  const lastBootstrapSignatureRef = useRef<string | null>(null);
  const callbacksRef = useRef(options);
  callbacksRef.current = options;
  const bootstrapRef = useRef({
    age,
    englishLevel,
    sessionId,
  });
  bootstrapRef.current = {
    age,
    englishLevel,
    sessionId,
  };

  const sendBootstrap = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const nextFrame: ClientFrame = {
      type: "bootstrap",
      age: bootstrapRef.current.age,
      englishLevel: bootstrapRef.current.englishLevel,
      sessionId: bootstrapRef.current.sessionId ?? undefined,
    };
    const signature = JSON.stringify(nextFrame);
    if (signature === lastBootstrapSignatureRef.current) {
      return true;
    }

    ws.send(signature);
    lastBootstrapSignatureRef.current = signature;
    return true;
  }, []);

  const connect = useCallback(() => {
    if (!enabled) {
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    manuallyClosedRef.current = false;
    setConnectionState("connecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      sendBootstrap();
    };

    ws.onmessage = (event) => {
      let frame: ServerFrame;
      try {
        frame = JSON.parse(event.data as string) as ServerFrame;
      } catch {
        return;
      }

      switch (frame.type) {
        case "connected":
          setConnectionState("connected");
          callbacksRef.current.onSessionId(frame.sessionId);
          break;
        case "snapshot":
          callbacksRef.current.onSnapshot(frame.payload);
          break;
        case "delivery":
          // delivery contains a full StoryTurnResponse — frontend handles rendering
          break;
        case "delta":
          callbacksRef.current.onDelta(frame.text);
          break;
        case "status":
          callbacksRef.current.onStatus(frame.state);
          break;
        case "error":
          callbacksRef.current.onError(frame.message);
          break;
        case "pong":
          break;
      }
    };

    ws.onclose = () => {
      setConnectionState("disconnected");
      wsRef.current = null;
      lastBootstrapSignatureRef.current = null;
      if (manuallyClosedRef.current) {
        return;
      }
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      setConnectionState("error");
    };
  }, [enabled, sendBootstrap, url]);

  useEffect(() => {
    if (!enabled) {
      manuallyClosedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
      setConnectionState("disconnected");
      return;
    }

    connect();
    return () => {
      manuallyClosedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    sendBootstrap();
  }, [enabled, sendBootstrap, age, englishLevel, sessionId]);

  const send = useCallback((frame: ClientFrame) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    ws.send(JSON.stringify(frame));
    return true;
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      return send({ type: "message", text, meta: { age, englishLevel } });
    },
    [send, age, englishLevel],
  );

  const sendReviewWord = useCallback(
    (cardId: string, rating: "again" | "hard" | "good" | "easy") => {
      return send({ type: "review-word", cardId, rating });
    },
    [send],
  );

  return {
    connectionState,
    send,
    sendMessage,
    sendReviewWord,
  };
}
