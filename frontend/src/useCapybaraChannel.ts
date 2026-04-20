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
  | { type: "ping" };

type UseCapybaraChannelOptions = {
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
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionState("connecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionState("connected");
      const bootstrapFrame: ClientFrame = {
        type: "bootstrap",
        age,
        englishLevel,
        sessionId: sessionId ?? undefined,
      };
      ws.send(JSON.stringify(bootstrapFrame));
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
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      setConnectionState("error");
    };
  }, [url, age, englishLevel, sessionId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

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
