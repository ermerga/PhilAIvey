import json
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections grouped by session_id."""

    def __init__(self) -> None:
        # Maps session_id -> list of active WebSocket connections
        self.active_connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        """Accept and register a new WebSocket connection for a session."""
        await websocket.accept()
        self.active_connections[session_id].append(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket connection from a session's connection list."""
        connections = self.active_connections.get(session_id, [])
        if websocket in connections:
            connections.remove(websocket)
        # Clean up the key if no connections remain
        if not connections and session_id in self.active_connections:
            del self.active_connections[session_id]

    async def broadcast(self, session_id: str, message: dict) -> None:
        """Send a JSON message to all WebSocket connections for a session."""
        connections = self.active_connections.get(session_id, [])
        dead: list[WebSocket] = []
        for connection in connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                # Connection is broken; mark for removal
                dead.append(connection)
        for conn in dead:
            self.disconnect(session_id, conn)


# Shared singleton used by routers and services
manager = ConnectionManager()
