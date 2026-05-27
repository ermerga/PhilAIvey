import random
from typing import Optional

from anthropic import AsyncAnthropic

from app.core.config import get_settings
from app.services.game_manager import GameState, PlayerState

# ---------------------------------------------------------------------------
# Play-style system prompts
# ---------------------------------------------------------------------------

SYSTEM_PROMPTS: dict[str, str] = {
    "tight-aggressive": """\
You are a tight-aggressive Texas Hold'em player. You fold most hands preflop, \
but when you enter a pot you play aggressively — betting and raising for value and as bluffs. \
You rarely limp. You make thin value bets on the river. You do not call down lightly.""",

    "loose-aggressive": """\
You are a loose-aggressive Texas Hold'em player. You play many hands and apply constant pressure. \
You bet and raise frequently, bluff often, and love to put opponents to tough decisions. \
You chase equity with semi-bluffs. You rarely check-fold.""",

    "tight-passive": """\
You are a tight-passive Texas Hold'em player. You only play strong starting hands and prefer \
calling to raising. You rarely bluff. You check or call most streets and only raise with very \
strong hands. You fold speculative or marginal hands preflop.""",

    "loose-passive": """\
You are a loose-passive Texas Hold'em player — a calling station. You play many hands and \
hate folding once you're in a pot. You chase draws and call down with weak pairs and second \
best hands. You rarely raise. You call with almost anything that has any equity.""",

    "maniac": """\
You are a maniac Texas Hold'em player. You are extremely aggressive — raising almost every hand \
preflop and continuing to bet and raise on nearly every street. You apply relentless pressure and \
bluff very frequently. You almost never fold once you've entered a pot.""",

    "gto-balanced": """\
You are a GTO-balanced Texas Hold'em player. You balance your ranges across value hands and \
bluffs. You mix between raising, calling, and folding at appropriate frequencies. You semi-bluff \
with draws, apply selective pressure in position, and make well-timed folds against strong action.""",
}

# ---------------------------------------------------------------------------
# Fallback stub (mirrors GameManager._stub_ai_action — duplicated for isolation)
# ---------------------------------------------------------------------------

def _stub_fallback(valid_actions: list[dict]) -> tuple[str, int]:
    """Random weighted fallback used when the Claude API fails or returns unparseable output."""
    if not valid_actions:
        return "call", 0

    choice = random.choices(["fold", "call", "raise"], weights=[15, 60, 25], k=1)[0]

    if choice == "fold":
        return "fold", 0

    if choice == "call":
        call = next((a for a in valid_actions if a["action"] == "call"), None)
        return "call", call["amount"] if call else 0

    raise_action = next((a for a in valid_actions if a["action"] == "raise"), None)
    if raise_action and isinstance(raise_action["amount"], dict):
        min_raise = raise_action["amount"]["min"]
        max_raise = raise_action["amount"]["max"]
        amount = random.randint(min_raise, min(min_raise * 3, max_raise))
        return "raise", amount

    return "call", 0


# ---------------------------------------------------------------------------
# AIOpponent service
# ---------------------------------------------------------------------------

class AIOpponent:
    def __init__(self) -> None:
        self._client: Optional[AsyncAnthropic] = None

    def _get_client(self) -> AsyncAnthropic:
        if self._client is None:
            settings = get_settings()
            self._client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        return self._client

    def _build_context(self, player: PlayerState, state: GameState) -> str:
        hole = " ".join(player.hole_cards) if player.hole_cards else "(unknown)"
        board = " ".join(state.community_cards) if state.community_cards else "(none)"

        call_amount = 0
        min_raise = 0
        max_raise = 0
        for a in state.valid_actions:
            if a["action"] == "call":
                call_amount = a["amount"]
            elif a["action"] == "raise" and isinstance(a["amount"], dict):
                min_raise = a["amount"]["min"]
                max_raise = a["amount"]["max"]

        active_count = sum(1 for p in state.players if not p.is_folded)

        recent = player.action_history[-5:]
        if recent:
            action_log = "\n".join(
                "  {street}: {action}".format(**e)
                + (f" {e['amount']}" if e.get("amount") else "")
                for e in recent
            )
        else:
            action_log = "  (no actions yet this session)"

        return (
            f"Your hole cards: {hole}\n"
            f"Board: {board} ({state.street})\n"
            f"Pot: {state.pot} chips | To call: {call_amount} chips\n"
            f"Your stack: {player.stack} chips | Min raise: {min_raise} | Max raise: {max_raise}\n"
            f"Players still in hand: {active_count}\n"
            f"\n=== Recent action this session ===\n"
            f"{action_log}\n"
            f"\nRespond with ONLY one of:\n"
            f"fold\n"
            f"call\n"
            f"raise <integer_amount>\n"
            f"\nExamples: \"fold\" or \"call\" or \"raise 150\"\n"
            f"Do not include any explanation. One word or two words only."
        )

    def _parse_decision(
        self, text: str, valid_actions: list[dict]
    ) -> tuple[str, int]:
        text = text.strip().lower()

        if text == "fold":
            return "fold", 0

        if text == "call":
            call = next((a for a in valid_actions if a["action"] == "call"), None)
            return "call", call["amount"] if call else 0

        if text.startswith("raise "):
            raise_action = next(
                (a for a in valid_actions if a["action"] == "raise"), None
            )
            min_raise = 0
            max_raise = 0
            if raise_action and isinstance(raise_action["amount"], dict):
                min_raise = raise_action["amount"]["min"]
                max_raise = raise_action["amount"]["max"]
            try:
                amount = int(text.split()[1])
                amount = max(min_raise, min(amount, max_raise))
                return "raise", amount
            except ValueError:
                return _stub_fallback(valid_actions)

        return _stub_fallback(valid_actions)

    async def decide(self, player: PlayerState, state: GameState) -> tuple[str, int]:
        play_style = player.play_style or "tight-aggressive"
        system_prompt = SYSTEM_PROMPTS.get(play_style, SYSTEM_PROMPTS["tight-aggressive"])
        context = self._build_context(player, state)

        try:
            client = self._get_client()
            response = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=20,
                system=system_prompt,
                messages=[{"role": "user", "content": context}],
            )
            raw = response.content[0].text if response.content else ""
            return self._parse_decision(raw, state.valid_actions)
        except Exception as exc:
            print(f"[AIOpponent] Claude API error for {player.name} ({play_style}): {exc}")
            return _stub_fallback(state.valid_actions)


ai_opponent = AIOpponent()
