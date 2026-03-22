import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    username: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    skill_level: Mapped[str] = mapped_column(
        String(32), nullable=False, default="beginner"
    )  # beginner / intermediate / advanced
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    sessions: Mapped[list["GameSession"]] = relationship(
        "GameSession", back_populates="user"
    )


class GameSession(Base):
    __tablename__ = "game_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    num_opponents: Mapped[int] = mapped_column(Integer, nullable=False)
    starting_stack: Mapped[int] = mapped_column(Integer, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="sessions")
    hands: Mapped[list["Hand"]] = relationship("Hand", back_populates="session")
    stats: Mapped[list["PlayerSessionStats"]] = relationship(
        "PlayerSessionStats", back_populates="session"
    )


class Hand(Base):
    __tablename__ = "hands"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("game_sessions.id"), nullable=False
    )
    hand_number: Mapped[int] = mapped_column(Integer, nullable=False)
    community_cards: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    pot: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    winners: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session: Mapped["GameSession"] = relationship("GameSession", back_populates="hands")
    actions: Mapped[list["Action"]] = relationship("Action", back_populates="hand")
    conversations: Mapped[list["TutorConversation"]] = relationship(
        "TutorConversation", back_populates="hand"
    )


class Action(Base):
    __tablename__ = "actions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    hand_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hands.id"), nullable=False
    )
    player_id: Mapped[str] = mapped_column(String(64), nullable=False)
    action_type: Mapped[str] = mapped_column(String(16), nullable=False)  # fold/call/raise
    amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    street: Mapped[str] = mapped_column(String(16), nullable=False)  # preflop/flop/turn/river
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    hand: Mapped["Hand"] = relationship("Hand", back_populates="actions")


class PlayerSessionStats(Base):
    __tablename__ = "player_session_stats"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("game_sessions.id"), nullable=False
    )
    player_id: Mapped[str] = mapped_column(String(64), nullable=False)
    is_human: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    play_style: Mapped[str | None] = mapped_column(String(32), nullable=True)
    vpip: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    pfr: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_hands: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hands_won: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    net_chips: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    session: Mapped["GameSession"] = relationship(
        "GameSession", back_populates="stats"
    )


class TutorConversation(Base):
    __tablename__ = "tutor_conversations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    hand_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hands.id"), nullable=False
    )
    skill_level: Mapped[str] = mapped_column(String(32), nullable=False)
    messages: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )  # list of {"role": str, "content": str}
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    hand: Mapped["Hand"] = relationship("Hand", back_populates="conversations")
