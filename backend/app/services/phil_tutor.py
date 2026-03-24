import json
from typing import Callable, Optional

from anthropic import AsyncAnthropic

from app.core.config import get_settings
from app.services.game_manager import GameState, PlayerState
from app.services.hand_evaluator import HandEvaluator

# ---------------------------------------------------------------------------
# System prompt — defines Phil's voice and skill-level rules
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are Phil Ivey, one of the greatest Texas Hold'em poker players of all time. \
You are coaching a student in real-time as they play a hand.

Speak in Phil's voice: calm, precise, confident, never condescending. \
Short sentences. You see everything at the table.

STUDENT SKILL LEVEL: {skill_level}

INSTRUCTIONS FOR THIS SKILL LEVEL:
{skill_instructions}

EQUITY RULE (applies at ALL levels):
Never reveal the exact win probability percentage before the student acts. \
You know it internally — use it only to guide your coaching accuracy. \
After they act, you may reveal it as a teaching moment ("The real number was 34% — \
how close was your estimate?").

Keep unprompted advice to 3-5 sentences. \
When the student asks a question, answer it fully and always tie it back to the current hand. \
Define any poker term you use if the skill level calls for it."""

SKILL_INSTRUCTIONS = {
    "beginner": """\
- Use plain language only. No jargon without an immediate explanation.
- Tell them what their hand is, whether it's strong or weak, and what you would do.
- Explain position in simple terms ("you act last — that's an advantage").
- Introduce pot odds as a simple ratio only ("you need to call $20 to win $60 — that's 3-to-1").
- Be direct and concrete. Invite questions at the end of your advice.""",

    "intermediate": """\
- Introduce poker terminology with brief explanations.
- Walk through outs and the Rule of 2 & 4: count outs, multiply by 4 on the flop or 2 on the turn.
- Ask guiding questions to build thinking habits ("How many outs do you have here?").
- Compare pot odds percentage to estimated equity to frame the decision.
- Give basic opponent reads based on observed tendencies.""",

    "advanced": """\
- Speak as a peer. Use full poker vocabulary without definitions.
- Discuss range vs. range, stack-to-pot ratio (SPR), and GTO vs. exploitative lines.
- Challenge their reasoning: "What range are you putting them on and why?"
- Bring in table image and meta-game when relevant.
- Do not give answers — ask questions that force range thinking.""",
}


class PhilTutor:
    """
    Manages Phil Ivey AI coaching for a game session.

    fire_opening_advice() — auto-fires when it becomes the human's turn.
    chat()               — handles follow-up questions from the user.

    Both methods stream Claude's response chunk-by-chunk via the broadcast
    callback so the frontend can render a typewriter effect.
    """

    def __init__(self, redis_client=None) -> None:
        self.redis = redis_client
        self._evaluator = HandEvaluator()
        # Client is created lazily so the module can be imported without
        # a valid API key (e.g. during testing or early startup)
        self._client: Optional[AsyncAnthropic] = None

    @property
    def client(self) -> AsyncAnthropic:
        if self._client is None:
            self._client = AsyncAnthropic(api_key=get_settings().ANTHROPIC_API_KEY)
        return self._client

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def fire_opening_advice(
        self,
        session_id: str,
        state: GameState,
        skill_level: str,
        broadcast: Optional[Callable] = None,
    ) -> None:
        """
        Auto-fire Phil's opening advice when it becomes the human's turn.
        Streams the response via WebSocket.
        """
        history = await self.get_history(session_id)
        context = self._build_context_message(state, skill_level, trigger="opening")
        messages = history + [{"role": "user", "content": context}]

        # Save the context message so Phil can reference it in follow-ups
        await self._append_to_history(session_id, "user", context)
        await self._stream_response(session_id, skill_level, messages, broadcast)

    async def chat(
        self,
        session_id: str,
        state: GameState,
        skill_level: str,
        user_message: str,
        broadcast: Optional[Callable] = None,
    ) -> None:
        """
        Handle a follow-up question from the user mid-hand.
        Appends the question to history and streams Phil's response.
        """
        history = await self.get_history(session_id)

        # If there's no history yet (user typed before Phil auto-fired),
        # prepend the hand context so Phil has something to work from
        if not history:
            context = self._build_context_message(state, skill_level, trigger="opening")
            history = [{"role": "user", "content": context}]

        history.append({"role": "user", "content": user_message})
        await self._append_to_history(session_id, "user", user_message)
        await self._stream_response(session_id, skill_level, history, broadcast)

    async def get_history(self, session_id: str) -> list[dict]:
        """Return the Phil conversation history for the current hand."""
        if not self.redis:
            return []
        raw = await self.redis.get(f"tutor:{session_id}:chat")
        return json.loads(raw) if raw else []

    async def clear_history(self, session_id: str) -> None:
        """Reset conversation at the start of each new hand."""
        if self.redis:
            await self.redis.delete(f"tutor:{session_id}:chat")

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _stream_response(
        self,
        session_id: str,
        skill_level: str,
        messages: list[dict],
        broadcast: Optional[Callable],
    ) -> None:
        """
        Call the Claude API with streaming, broadcast each chunk via WebSocket,
        and append the full response to conversation history.
        """
        system = SYSTEM_PROMPT.format(
            skill_level=skill_level,
            skill_instructions=SKILL_INSTRUCTIONS.get(skill_level, SKILL_INSTRUCTIONS["beginner"]),
        )

        if broadcast:
            await broadcast(session_id, {"type": "phil_stream_start"})

        full_response = ""
        try:
            async with self.client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=400,
                system=system,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    full_response += text
                    if broadcast:
                        await broadcast(session_id, {
                            "type": "phil_stream_chunk",
                            "content": text,
                        })
        except Exception as exc:
            error_msg = "Phil stepped away from the table for a moment. Try again."
            if broadcast:
                await broadcast(session_id, {
                    "type": "phil_stream_chunk",
                    "content": error_msg,
                })
            full_response = error_msg
            print(f"[PhilTutor] Claude API error: {exc}")

        # Save Phil's full response to history
        if full_response:
            await self._append_to_history(session_id, "assistant", full_response)

        if broadcast:
            await broadcast(session_id, {"type": "phil_stream_end"})

    async def _append_to_history(
        self, session_id: str, role: str, content: str
    ) -> None:
        if not self.redis:
            return
        history = await self.get_history(session_id)
        history.append({"role": role, "content": content})
        await self.redis.set(
            f"tutor:{session_id}:chat",
            json.dumps(history),
            ex=7200,  # 2-hour TTL per hand
        )

    def _build_context_message(
        self, state: GameState, skill_level: str, trigger: str
    ) -> str:
        """
        Build the user-turn context message Phil receives.
        This is what gives Phil full awareness of the current hand.
        """
        human = self._get_human(state)
        if not human:
            return "The player is ready for advice."

        # --- Hand evaluation ---
        eval_result = {}
        outs_result = {}
        pot_odds_result = {}

        if human.hole_cards:
            try:
                eval_result = self._evaluator.evaluate(
                    human.hole_cards, state.community_cards
                )
                if state.community_cards:
                    outs_result = self._evaluator.count_outs(
                        human.hole_cards, state.community_cards
                    )
                call_amount = self._get_call_amount(state)
                if call_amount > 0:
                    pot_odds_result = self._evaluator.pot_odds(call_amount, state.pot)
            except Exception:
                pass

        # --- Position ---
        position = self._get_position(state, human)

        # --- Opponent summary ---
        opp_summary = self._opponent_summary(state, skill_level)

        # --- Action history this hand (last 10 recorded actions) ---
        action_log = self._recent_action_log(state)

        # --- Assemble the context ---
        lines = [
            "=== IT IS YOUR TURN ===",
            f"Your cards: {', '.join(human.hole_cards) if human.hole_cards else 'Not yet dealt'}",
            f"Board: {', '.join(state.community_cards) if state.community_cards else 'No community cards yet'} ({state.street})",
        ]

        if eval_result:
            lines.append(
                f"Hand strength: {eval_result.get('category', '?')} "
                f"(top {eval_result.get('percentile', '?')}% of all hands)"
            )

        if outs_result and outs_result.get("outs", 0) > 0:
            lines.append(
                f"Drawing to: {outs_result['draw_type']} "
                f"({outs_result['outs']} outs | "
                f"Rule of 4: ~{outs_result['rule_of_4']}% | "
                f"Rule of 2: ~{outs_result['rule_of_2']}%)"
            )

        call_amount = self._get_call_amount(state)
        lines.append(
            f"Pot: {state.pot} chips | "
            f"To call: {call_amount} chips"
        )

        if pot_odds_result:
            lines.append(
                f"Pot odds: {pot_odds_result.get('ratio', '?')} "
                f"({pot_odds_result.get('percentage', '?')}%)"
            )

        lines += [
            f"Your stack: {human.stack} chips | Position: {position}",
            f"Players still in hand: {sum(1 for p in state.players if not p.is_folded)}",
            "",
            "=== WHAT YOU'VE OBSERVED ===",
            opp_summary,
        ]

        if action_log:
            lines += ["", "=== ACTION THIS HAND ===", action_log]

        if trigger == "opening":
            lines += ["", "Give your opening coaching advice for this situation."]
        else:
            lines += ["", f"Student asks: {trigger}"]

        return "\n".join(lines)

    def _get_human(self, state: GameState) -> Optional[PlayerState]:
        return next((p for p in state.players if p.is_human), None)

    def _get_call_amount(self, state: GameState) -> int:
        call_action = next(
            (a for a in state.valid_actions if a.get("action") == "call"), None
        )
        if call_action:
            return call_action.get("amount", 0)
        return 0

    def _get_position(self, state: GameState, human: PlayerState) -> str:
        """
        Return a position label based on where the human sits
        relative to the SB (index 0) and BB (index 1).
        """
        active = [p for p in state.players if not p.is_folded]
        total = len(state.players)
        human_idx = state.players.index(human)

        position_labels = {
            0: "Small Blind (SB)",
            1: "Big Blind (BB)",
        }
        if human_idx in position_labels:
            return position_labels[human_idx]

        # Remaining positions based on distance from BB
        remaining = total - 2
        dist_from_bb = (human_idx - 1) % total
        if remaining <= 1:
            return "Button (BTN)"
        elif dist_from_bb == remaining - 1:
            return "Button (BTN)"
        elif dist_from_bb == remaining - 2:
            return "Cutoff (CO)"
        elif dist_from_bb <= 1:
            return "Under the Gun (UTG)"
        else:
            return "Middle Position (MP)"

    def _opponent_summary(self, state: GameState, skill_level: str) -> str:
        """
        Build an opponent tendency summary filtered by skill level.
        Beginners see plain language; intermediate/advanced see raw stats.
        """
        lines = []
        for p in state.players:
            if p.is_human or p.is_folded:
                continue

            total = len(p.action_history)
            if total == 0:
                lines.append(f"  {p.name}: No data yet.")
                continue

            folds = sum(1 for a in p.action_history if a["action"] == "fold")
            raises = sum(1 for a in p.action_history if a["action"] == "raise")
            calls = sum(1 for a in p.action_history if a["action"] == "call")

            fold_pct = round(folds / total * 100)
            raise_pct = round(raises / total * 100)

            if skill_level == "beginner":
                if raise_pct > 35:
                    tendency = "bets and raises a lot — aggressive player"
                elif fold_pct > 50:
                    tendency = "folds frequently — plays it safe"
                else:
                    tendency = "calls often — likes to see cards"
                lines.append(f"  {p.name}: {tendency}.")
            else:
                lines.append(
                    f"  {p.name}: fold {fold_pct}% | "
                    f"call {round(calls/total*100)}% | "
                    f"raise {raise_pct}% "
                    f"({total} actions observed)"
                )

        return "\n".join(lines) if lines else "  No opponent data yet — keep watching."

    def _recent_action_log(self, state: GameState) -> str:
        """
        Build a short log of the most recent actions across all players.
        Uses the last 3 actions from each player's session history.
        """
        entries = []
        for p in state.players:
            for action in p.action_history[-3:]:
                entries.append(
                    f"  {p.name}: {action['action']}"
                    + (f" {action['amount']}" if action.get("amount") else "")
                    + f" ({action.get('street', '?')})"
                )
        return "\n".join(entries) if entries else ""


# ---------------------------------------------------------------------------
# Module-level singleton — injected with Redis client in main.py
# ---------------------------------------------------------------------------
phil_tutor = PhilTutor()
