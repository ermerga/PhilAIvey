import { useEffect, useRef } from "react";
import type { GameState, WebSocketMessage } from "../types";

// In Docker, nginx proxies /ws/* to the FastAPI backend as a WebSocket.
// Outside Docker (local dev), point directly to the backend.
const WS_BASE = "ws://localhost:8000";

// ---------------------------------------------------------------------------
// useGameSocket
//
// Opens a WebSocket connection for a given session and calls onStateUpdate
// whenever the backend pushes a new game state.
//
// The component using this hook doesn't need to know anything about WebSockets
// — it just provides a sessionId and a callback to receive state updates.
// ---------------------------------------------------------------------------
export function useGameSocket(
  sessionId: string | null,
  onStateUpdate: (state: GameState) => void
) {
  // useRef stores the WebSocket instance without triggering re-renders.
  // If we used useState here, updating the socket would cause the component
  // to re-render, which could cause the connection to re-open in a loop.
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Don't open a connection until we have a session
    if (!sessionId) return;

    const url = `${WS_BASE}/game/${sessionId}/stream`;
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log(`[WebSocket] Connected to session ${sessionId}`);
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        if (message.type === "game_state") {
          onStateUpdate(message.data);
        }
      } catch {
        console.error("[WebSocket] Failed to parse message:", event.data);
      }
    };

    ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
    };

    ws.onclose = () => {
      console.log(`[WebSocket] Disconnected from session ${sessionId}`);
    };

    // Cleanup: close the connection when the component unmounts or
    // when sessionId changes (i.e. user starts a new game).
    return () => {
      ws.close();
      socketRef.current = null;
    };

    // onStateUpdate is intentionally excluded from the dependency array.
    // Including it would cause the socket to reconnect on every render
    // because the parent component creates a new function reference each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
}
