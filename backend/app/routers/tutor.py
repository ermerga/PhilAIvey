from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.game_manager import game_manager
from app.services.phil_tutor import phil_tutor
from app.ws.manager import manager as ws_manager

router = APIRouter(prefix="/game", tags=["tutor"])


class ChatRequest(BaseModel):
    message: str
    skill_level: str = "beginner"


@router.post("/{session_id}/tutor/chat")
async def tutor_chat(session_id: str, body: ChatRequest):
    """
    Receive a follow-up question from the user and stream Phil's
    response back over the existing WebSocket connection.
    """
    state = game_manager.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    await phil_tutor.chat(
        session_id=session_id,
        state=state,
        skill_level=body.skill_level,
        user_message=body.message,
        broadcast=ws_manager.broadcast,
    )
    return {"status": "ok"}


@router.get("/{session_id}/tutor/history")
async def tutor_history(session_id: str):
    """
    Return the Phil conversation history for the current hand.
    Used to repopulate the chat UI after a reconnect.
    """
    history = await phil_tutor.get_history(session_id)
    return {"history": history}
