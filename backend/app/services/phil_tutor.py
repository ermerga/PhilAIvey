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

SOCRATIC RULE (applies at ALL levels):
Coach through questions, not answers. For every opening observation: give 1–2 sentences of \
situational framing (what they're holding, what the action says about the table), then close with a \
direct question that forces the student to think. Match the question's sophistication to the skill level. \
When the student answers, react to their reasoning — build on it if sound, redirect if shaky.

BREVITY RULE: Opening advice is 2–3 short sentences max (framing + question). \
When the student asks a follow-up, answer in 2–4 sentences and tie it to the current hand. \
Define any poker term you use if the skill level calls for it."""

SKILL_INSTRUCTIONS = {
    "beginner": """\
- Use plain language only. No jargon without an immediate explanation.
- Name their hand type and say in one sentence whether it is strong or weak.
- Mention one key factor — position, pot size, or an opponent pattern — in plain terms.
- Always end your opening message with a simple decision question: \
"What do you think you should do here?" — let them answer before giving your view.
- When they reply, give direct feedback and explain the reasoning in plain English.""",

    "intermediate": """\
- Introduce poker terminology with brief, one-phrase explanations.
- Surface ONE analytical frame — outs (Rule of 2 & 4) OR pot odds, not both at once.
- End your opening with a question that forces them to complete the reasoning: \
"So given that, what's your move?" or "How many outs do you count?"
- When they answer, confirm or correct using the specific numbers from the context.
- Offer opponent reads as clues to interpret, not conclusions: \
"They 3-bet from UTG — what does that tell you about their hand?".""",

    "advanced": """\
- Speak as a peer. Use full poker vocabulary without definitions.
- Lead with one sharp observation about range, SPR, board texture, or position dynamics.
- End with the hard question: "What range are you putting them on?" or \
"How does your stack-to-pot ratio change your line here?"
- Never give the answer on opening — the student must work through it and you react.
- Push back on weak reasoning: "Is that their range from this position? Think about what they'd fold preflop.".""",
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
                max_tokens=160,
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
        preflop_desc = ""
        outs_result = {}
        pot_odds_result = {}

        if human.hole_cards:
            try:
                if state.community_cards:
                    # Post-flop: treys can evaluate accurately with a board
                    eval_result = self._evaluator.evaluate(
                        human.hole_cards, state.community_cards
                    )
                    outs_result = self._evaluator.count_outs(
                        human.hole_cards, state.community_cards
                    )
                else:
                    # Preflop: treys can't evaluate without a board — use simple descriptor
                    preflop_desc = self._preflop_desc(human.hole_cards)
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

        if preflop_desc:
            lines.append(f"Preflop hand type: {preflop_desc}")
        elif eval_result:
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
        is_free_check = call_amount == 0
        lines.append(
            f"Pot: {state.pot} chips | "
            + ("No bet facing you — can check for free." if is_free_check
               else f"To call: {call_amount} chips")
        )

        if pot_odds_result:
            lines.append(
                f"Pot odds: {pot_odds_result.get('ratio', '?')} "
                f"({pot_odds_result.get('percentage', '?')}%)"
            )

        # Available actions — critical for Phil to know check vs call
        action_opts = []
        for a in state.valid_actions:
            if a["action"] == "fold":
                action_opts.append("fold")
            elif a["action"] == "call":
                if a.get("amount", 0) == 0:
                    action_opts.append("check (free)")
                else:
                    action_opts.append(f"call {a['amount']}")
            elif a["action"] == "raise" and isinstance(a.get("amount"), dict):
                lo = a["amount"]["min"]
                hi = a["amount"]["max"]
                action_opts.append(f"raise {lo}–{hi}")
        if action_opts:
            lines.append(f"Available actions: {' | '.join(action_opts)}")

        players_in = sum(1 for p in state.players if not p.is_folded)
        lines += [
            f"Your stack: {human.stack} chips | Position: {position}",
            f"Players still in hand: {players_in} of {len(state.players)}",
            "",
            "=== WHAT YOU'VE OBSERVED ===",
            opp_summary,
        ]

        if action_log:
            lines += ["", "=== ACTION SO FAR THIS HAND ===", action_log]

        if trigger == "opening":
            lines += [
                "",
                "Give your opening coaching advice: 1–2 sentences of situational framing, "
                "then close with a question that engages the student's thinking. "
                "Do NOT give the answer — ask them first.",
            ]
        else:
            lines += ["", f"Student asks: {trigger}"]

        return "\n".join(lines)

    def _preflop_desc(self, hole_cards: list[str]) -> str:
        """
        Simple preflop hand descriptor used in place of the post-flop evaluator
        (which requires a board and gives garbage output preflop).
        Returns a human-readable label like "Pocket Aces", "Suited Connectors (AKs)", etc.
        """
        RANK_ORDER = "23456789TJQKA"
        c1, c2 = hole_cards[0], hole_cards[1]
        r1, r2 = c1[0].upper(), c2[0].upper()
        s1, s2 = c1[1].lower(), c2[1].lower()

        paired = r1 == r2
        suited = s1 == s2
        gap = abs(RANK_ORDER.index(r1) - RANK_ORDER.index(r2))
        hi = r1 if RANK_ORDER.index(r1) >= RANK_ORDER.index(r2) else r2
        lo = r2 if hi == r1 else r1
        hand_str = f"{hi}{lo}{'s' if suited else 'o'}"

        # Named pocket pairs
        names = {"A": "Aces", "K": "Kings", "Q": "Queens", "J": "Jacks", "T": "Tens"}
        if paired:
            label = f"Pocket {names.get(r1, f'{r1}s')}"
            strength = "premium" if r1 in "AKQJT" else ("strong" if r1 in "789" else "low")
            return f"{label} ({strength} pocket pair)"

        # Suited / offsuit descriptors
        suit_tag = "suited" if suited else "offsuit"
        if gap == 1:
            return f"Suited Connectors ({hand_str})" if suited else f"Connected ({hand_str}, {suit_tag})"
        if gap == 2:
            return f"One-gapper ({hand_str}, {suit_tag})"
        if hi == "A":
            return f"Ace-x ({hand_str}, {suit_tag})"
        if hi == "K":
            return f"King-x ({hand_str}, {suit_tag})"
        return f"Unconnected ({hand_str}, {suit_tag})"

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
        Return a position label based on the human's role relative to the dealer.
        Compares by ID so rotation is handled correctly.
        """
        if human.id == state.small_blind_id:
            return "Small Blind (SB)"
        if human.id == state.big_blind_id:
            return "Big Blind (BB)"
        if human.id == state.dealer_id:
            return "Button (BTN)"

        # Compute clockwise distance from dealer for remaining seats.
        n = len(state.players)
        dealer_idx = next((i for i, p in enumerate(state.players) if p.id == state.dealer_id), None)
        human_idx = state.players.index(human)

        if dealer_idx is None or n <= 3:
            return "Middle Position"

        dist = (human_idx - dealer_idx) % n
        # dist 0=BTN, 1=SB, 2=BB already handled above
        if dist == n - 1:
            return "Cutoff (CO)"
        elif n >= 6 and dist == n - 2:
            return "Middle Position (MP)"
        else:
            return "Under the Gun (UTG)"

    def _opponent_summary(self, state: GameState, skill_level: str) -> str:
        """
        Build an opponent tendency summary filtered by skill level.
        Includes ALL opponents (even those folded this hand) so Phil has
        full historical context. Current fold state is noted inline.
        """
        lines = []
        for p in state.players:
            if p.is_human:
                continue

            folded_note = " (folded this hand)" if p.is_folded else ""
            total = len(p.action_history)
            if total == 0:
                lines.append(f"  {p.name}{folded_note}: No data yet.")
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
                lines.append(f"  {p.name}{folded_note}: {tendency}.")
            else:
                lines.append(
                    f"  {p.name}{folded_note}: fold {fold_pct}% | "
                    f"call {round(calls/total*100)}% | "
                    f"raise {raise_pct}% "
                    f"({total} actions observed)"
                )

        return "\n".join(lines) if lines else "  No opponent data yet — keep watching."

    def _recent_action_log(self, state: GameState) -> str:
        """
        Actions taken SO FAR in the current hand only (filtered by hand_number).
        Older history has `hand` key; entries without it are from a previous
        session before this field was added and are excluded.
        """
        current_hand = state.hand_number
        entries = []
        for p in state.players:
            for action in p.action_history:
                if action.get("hand") != current_hand:
                    continue
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
