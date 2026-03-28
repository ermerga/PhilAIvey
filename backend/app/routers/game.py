from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.services.game_manager import game_manager
from app.services.phil_tutor import phil_tutor
from app.ws.manager import manager as ws_manager

router = APIRouter(prefix="/game", tags=["game"])


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------


class NewGameRequest(BaseModel):
    num_opponents: int = Field(..., ge=1, le=5, description="Number of AI opponents (1–5)")
    starting_stack: int = Field(default=1000, ge=100)
    skill_level: str = Field(default="beginner", pattern="^(beginner|intermediate|advanced)$")


class ActionRequest(BaseModel):
    action: str = Field(..., pattern="^(fold|call|raise)$")
    amount: int = Field(default=0, ge=0)
    skill_level: str = Field(default="beginner", pattern="^(beginner|intermediate|advanced)$")


class StartHandRequest(BaseModel):
    skill_level: str = Field(default="beginner", pattern="^(beginner|intermediate|advanced)$")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/new")
async def new_game(body: NewGameRequest):
    """
    Start a brand-new game session.
    Creates the session, randomly assigns AI play styles, and deals the first hand.
    Returns the initial game state so the frontend can render the table immediately.
    """
    state = game_manager.create_session(
        num_opponents=body.num_opponents,
        starting_stack=body.starting_stack,
    )
    await phil_tutor.clear_history(state.session_id)
    state = await game_manager.start_hand(state.session_id, broadcast=ws_manager.broadcast)
    await game_manager.save_to_redis(state)

    return {
        "session_id": state.session_id,
        "skill_level": body.skill_level,
        "game_state": game_manager.serialize_for_client(state),
    }


@router.get("/{session_id}")
async def get_game(session_id: str):
    """Return the current state of an active game session."""
    state = game_manager.get_state(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game session not found.")
    return game_manager.serialize_for_client(state)


@router.post("/{session_id}/action")
async def submit_action(session_id: str, body: ActionRequest):
    """
    Submit the human player's action (fold / call / raise).

    After applying the action the backend automatically runs all AI turns
    until it is the human's turn again or the hand ends. The updated state
    is broadcast over WebSocket so the frontend updates in real-time, and
    also returned directly in the HTTP response.
    """
    try:
        state = await game_manager.apply_human_action(
            session_id=session_id,
            action=body.action,
            amount=body.amount,
            broadcast=ws_manager.broadcast,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    serialized = game_manager.serialize_for_client(state)

    # Broadcast updated state to all WebSocket connections for this session
    await ws_manager.broadcast(session_id, {"type": "game_state", "data": serialized})
    await game_manager.save_to_redis(state)

    if not state.is_hand_over and state.current_actor == "human":
        await phil_tutor.fire_opening_advice(
            session_id=session_id,
            state=state,
            skill_level=body.skill_level,
            broadcast=ws_manager.broadcast,
        )

    return serialized


@router.post("/{session_id}/start-hand")
async def start_hand(session_id: str, body: StartHandRequest = StartHandRequest()):
    """
    Deal a new hand. Called by the frontend after a hand ends and the user
    clicks "Deal" (or equivalent).
    """
    state = game_manager.get_state(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game session not found.")
    if not state.is_hand_over:
        raise HTTPException(status_code=400, detail="Current hand is still in progress.")

    await phil_tutor.clear_history(session_id)
    state = await game_manager.start_hand(session_id, broadcast=ws_manager.broadcast)
    serialized = game_manager.serialize_for_client(state)

    await ws_manager.broadcast(session_id, {"type": "game_state", "data": serialized})
    await game_manager.save_to_redis(state)

    if not state.is_hand_over and state.current_actor == "human":
        await phil_tutor.fire_opening_advice(
            session_id=session_id,
            state=state,
            skill_level=body.skill_level,
            broadcast=ws_manager.broadcast,
        )

    return serialized


@router.get("/{session_id}/coaching")
async def get_coaching(session_id: str):
    """
    Post-decision coaching data for the last human action.
    Stub in Phase 1 — full implementation in Phase 4.
    """
    state = game_manager.get_state(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game session not found.")

    return {
        "message": "Coaching engine coming in Phase 4.",
        "session_id": session_id,
    }


@router.get("/{session_id}/opponents")
async def get_opponents(session_id: str):
    """
    Return observable tendency summaries for each AI opponent, built from
    the action history we have recorded so far this session.

    In Phase 1 this is raw action counts. Phase 3 will compute proper
    VPIP / PFR / aggression frequency stats.
    """
    state = game_manager.get_state(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game session not found.")

    summaries = []
    for p in state.players:
        if p.is_human:
            continue

        total = len(p.action_history)
        if total == 0:
            summaries.append({
                "id": p.id,
                "name": p.name,
                "play_style": p.play_style,
                "hands_observed": 0,
                "tendencies": "No data yet — keep watching.",
            })
            continue

        folds = sum(1 for a in p.action_history if a["action"] == "fold")
        raises = sum(1 for a in p.action_history if a["action"] == "raise")
        calls = sum(1 for a in p.action_history if a["action"] == "call")

        summaries.append({
            "id": p.id,
            "name": p.name,
            "play_style": p.play_style,         # revealed so dev can verify logic
            "hands_observed": total,
            "tendencies": {
                "fold_pct": round(folds / total * 100, 1),
                "call_pct": round(calls / total * 100, 1),
                "raise_pct": round(raises / total * 100, 1),
            },
        })

    return {"opponents": summaries}


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------


@router.websocket("/{session_id}/stream")
async def game_stream(
    websocket: WebSocket,
    session_id: str,
    skill_level: str = "beginner",
):
    """
    Persistent WebSocket connection for a game session.

    The frontend opens this connection on game start and keeps it open.
    Whenever any player acts, the backend broadcasts the full updated game
    state here so the UI can re-render without polling.

    skill_level is passed as a query param so Phil knows how to pitch
    his advice when he auto-fires on connect.
    """
    state = game_manager.get_state(session_id)
    if not state:
        await websocket.close(code=4004, reason="Game session not found.")
        return

    await ws_manager.connect(session_id, websocket)

    # Send the current state immediately on connect so the client is in sync
    await websocket.send_json({
        "type": "game_state",
        "data": game_manager.serialize_for_client(state),
    })

    # Fire Phil's opening advice now that the socket is confirmed open.
    # This is the reliable trigger point — firing from HTTP endpoints races
    # against the socket connection and loses when the human acts first.
    if not state.is_hand_over and state.current_actor == "human":
        await phil_tutor.fire_opening_advice(
            session_id=session_id,
            state=state,
            skill_level=skill_level,
            broadcast=ws_manager.broadcast,
        )

    try:
        # Keep the connection alive — we only send from the server side,
        # but we still need to receive to detect disconnects.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(session_id, websocket)
