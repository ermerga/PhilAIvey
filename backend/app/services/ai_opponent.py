import random
from typing import Optional

from anthropic import AsyncAnthropic

from app.core.config import get_settings
from app.services.game_manager import GameState, PlayerState

# ---------------------------------------------------------------------------
# Play-style system prompts
# ---------------------------------------------------------------------------
# Each prompt sets a personality tendency while still expecting the AI to play
# real poker — fold bad hands, use pot odds, bet for value, etc. Extreme one-
# dimensional play (always raise, never fold) produces unrealistic opponents.

SYSTEM_PROMPTS: dict[str, str] = {
    "tight-aggressive": """\
You are a skilled tight-aggressive (TAG) Texas Hold'em cash-game player.

TENDENCIES:
- Preflop: fold most weak hands (~75% of hands). Raise premium hands for value. \
  Occasionally raise suited connectors or pocket pairs for semi-bluffs.
- Postflop: bet and raise with strong made hands and strong draws. \
  Check-fold marginal hands facing action. Check back to control pot size with medium hands. \
  Make well-timed bluffs on good boards with fold equity.
- You prefer raising or folding over flat-calling, but you do call when pot odds \
  justify it or when you want to keep a hand disguised.
- Adjust to the situation: if the pot is huge, tighten up; if opponents are weak, \
  extract value aggressively.""",

    "loose-aggressive": """\
You are a skilled loose-aggressive (LAG) Texas Hold'em cash-game player.

TENDENCIES:
- Preflop: play a wide range of hands (~50%). Raise most of them rather than limping. \
  Sometimes call in position with speculative hands.
- Postflop: continuation-bet frequently, barrel turns with equity or fold equity, \
  and bluff rivers when the story makes sense. Apply relentless pressure on weak opponents.
- You DO fold when you have no equity and face big bets across multiple streets. \
  You also check or check-call sometimes to trap opponents or when you're out of position.
- Semi-bluff draws by raising, not just calling. Mix in check-raises.""",

    "tight-passive": """\
You are a tight-passive Texas Hold'em player — solid but conservative.

TENDENCIES:
- Preflop: only play strong starting hands (~20% of hands). Mostly call rather than raise. \
  Occasionally raise with premium hands like AA/KK/AK.
- Postflop: mostly check and call with good hands. Raise only with very strong holdings \
  (top pair top kicker+, two pair, sets). Fold draws when the price is too high.
- You do bet for value when you have a strong hand and believe you'll be called. \
  You don't bluff often but you're not purely passive — you make value bets.
- Fold hands that miss the board or face sustained aggression with only one pair.""",

    "loose-passive": """\
You are a loose-passive Texas Hold'em player — a calling station who loves seeing cards.

TENDENCIES:
- Preflop: play many hands (~60%), usually by calling. Fold to very large raises if your \
  hand is really bad (like 72o), but otherwise call often.
- Postflop: call down with pairs, draws, and second-best hands. Hate folding. \
  Check-call most streets rather than check-folding.
- You DO fold when you miss completely and face a large bet with no outs. \
  You also occasionally bet when you hit a strong hand and want value.
- You rarely raise but you're not incapable of it — you raise when you flop very strong \
  (sets, two pair) and want to build a pot.""",

    "maniac": """\
You are an aggressive, unpredictable Texas Hold'em player who applies constant pressure.

TENDENCIES:
- Preflop: raise very frequently (~70% of hands). Fold only truly terrible hands \
  to big re-raises (like 72o facing a 4-bet).
- Postflop: bet and raise most streets regardless of holding. Bluff often. \
  Attack any sign of weakness. Re-raise players who try to fight back.
- You ARE capable of folding when you face multi-street action with genuinely nothing — \
  you're aggressive, not braindead. When an opponent shows extreme strength multiple times, \
  you give them credit.
- Occasionally mix in a slow-play by checking a monster to induce action. \
  Keep opponents guessing by not being 100% predictable.""",

    "gto-balanced": """\
You are a skilled, balanced Texas Hold'em player who plays close to optimal poker.

TENDENCIES:
- Preflop: mix raising, calling, and folding at appropriate frequencies. \
  Raise strong hands for value, 3-bet bluff with suited connectors, fold trash.
- Postflop: balance value bets with bluffs. Bet ~2/3 pot as a default. \
  Check back some strong hands to protect your checking range. \
  Semi-bluff draws aggressively. Make well-timed folds against sustained aggression.
- Consider stack-to-pot ratio: play more cautiously with shallow SPR (commit or fold), \
  and mix more on deep-stacked boards.
- Don't over-fold or over-call. If you're getting 3:1 odds, you need ~25% equity to call.""",
}

# ---------------------------------------------------------------------------
# Fallback stub
# ---------------------------------------------------------------------------

def _stub_fallback(valid_actions: list[dict]) -> tuple[str, int]:
    """Weighted random fallback when the Claude API fails or returns garbage."""
    if not valid_actions:
        return "call", 0

    has_raise = any(
        a["action"] == "raise" and isinstance(a.get("amount"), dict)
        for a in valid_actions
    )

    if has_raise:
        weights = [15, 50, 35]
    else:
        weights = [20, 80, 0]

    choice = random.choices(["fold", "call", "raise"], weights=weights, k=1)[0]

    if choice == "fold":
        return "fold", 0

    if choice == "call":
        call = next((a for a in valid_actions if a["action"] == "call"), None)
        return "call", (call["amount"] if call else 0)

    raise_action = next((a for a in valid_actions if a["action"] == "raise"), None)
    if raise_action and isinstance(raise_action["amount"], dict):
        lo = raise_action["amount"]["min"]
        hi = raise_action["amount"]["max"]
        # Pick a realistic raise size: mostly 2-3x pot-ish, occasionally larger
        amount = random.choice([
            lo,
            min(lo * 2, hi),
            min(round((lo + hi) * 0.4), hi),
        ])
        return "raise", max(lo, min(amount, hi))

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
        can_raise = False
        for a in state.valid_actions:
            if a["action"] == "call":
                call_amount = a["amount"]
            elif a["action"] == "raise" and isinstance(a.get("amount"), dict):
                min_raise = a["amount"]["min"]
                max_raise = a["amount"]["max"]
                can_raise = min_raise > 0 and max_raise > 0

        active_count = sum(1 for p in state.players if not p.is_folded)

        # Describe the current situation clearly
        if call_amount == 0:
            situation = "No bet to you — you can check (free) or bet."
        else:
            pot_odds_pct = round(call_amount / (state.pot + call_amount) * 100) if state.pot + call_amount > 0 else 0
            situation = (
                f"You face a bet/raise. To call: {call_amount} chips. "
                f"Pot odds: {pot_odds_pct}% ({call_amount}:{state.pot} = you need ~{pot_odds_pct}% equity to break even)."
            )

        # Pot-sized raise reference
        pot_size_raise = ""
        if can_raise and state.pot > 0:
            pot_raise = min(state.pot + call_amount * 2, max_raise)
            pot_raise = max(pot_raise, min_raise)
            pot_size_raise = f" (pot-sized raise ≈ {pot_raise})"

        # Raise options line
        if can_raise:
            raise_line = f"Raise: {min_raise} to {max_raise}{pot_size_raise}"
        else:
            raise_line = "Raise: not available"

        # Stack-to-pot ratio for postflop decisions
        spr_line = ""
        if state.pot > 0 and state.community_cards:
            spr = round(player.stack / state.pot, 1)
            spr_line = f"\nStack-to-pot ratio: {spr}x"

        # Other active players' stacks (useful for depth awareness)
        others = [
            f"{p.name}: {p.stack} chips"
            for p in state.players
            if p.id != player.id and not p.is_folded
        ]
        others_str = ", ".join(others) if others else "none"

        # Recent actions this session (last 6 across all players for context)
        recent_entries = []
        for p in state.players:
            for a in p.action_history[-3:]:
                recent_entries.append((p.name, a))
        recent_entries = recent_entries[-6:]
        if recent_entries:
            action_log = "\n".join(
                f"  {name}: {e['action']}" + (f" {e['amount']}" if e.get("amount") else "") + f" ({e.get('street','?')})"
                for name, e in recent_entries
            )
        else:
            action_log = "  (no actions yet)"

        lines = [
            f"Your hole cards: {hole}",
            f"Board: {board} ({state.street})",
            f"Pot: {state.pot} chips",
            f"Your stack: {player.stack} chips",
            f"Opponents still in hand: {active_count - 1} ({others_str})",
            spr_line,
            "",
            f"SITUATION: {situation}",
            f"Your options:",
            f"  fold",
            f"  call {call_amount}" if call_amount > 0 else "  check (call 0)",
            f"  {raise_line}",
            "",
            "=== Recent action this session ===",
            action_log,
            "",
            "Decide your action. Respond with ONLY one of:",
            "  fold",
            "  call",
            "  raise <integer_amount>",
            "",
            "Examples: \"fold\" or \"call\" or \"raise 150\"",
            "One line only. No explanation.",
        ]
        return "\n".join(line for line in lines if line is not None)

    def _parse_decision(self, text: str, valid_actions: list[dict]) -> tuple[str, int]:
        text = text.strip().lower()
        # Strip any leading/trailing punctuation
        text = text.strip(".,!\"'")

        if text in ("fold", "i fold", "folds"):
            return "fold", 0

        if text in ("call", "check", "i call", "i check", "calls", "checks"):
            call = next((a for a in valid_actions if a["action"] == "call"), None)
            return "call", (call["amount"] if call else 0)

        if text.startswith("raise"):
            parts = text.split()
            raise_action = next((a for a in valid_actions if a["action"] == "raise"), None)
            if not raise_action or not isinstance(raise_action.get("amount"), dict):
                # Raise not available — fall back to call
                call = next((a for a in valid_actions if a["action"] == "call"), None)
                return "call", (call["amount"] if call else 0)
            lo = raise_action["amount"]["min"]
            hi = raise_action["amount"]["max"]
            if lo < 0:
                # All-in call situation — treat as call
                call = next((a for a in valid_actions if a["action"] == "call"), None)
                return "call", (call["amount"] if call else 0)
            try:
                amount = int(parts[1])
                amount = max(lo, min(amount, hi))
                return "raise", amount
            except (IndexError, ValueError):
                return _stub_fallback(valid_actions)

        return _stub_fallback(valid_actions)

    async def decide(self, player: PlayerState, state: GameState) -> tuple[str, int]:
        play_style = player.play_style or "gto-balanced"
        system_prompt = SYSTEM_PROMPTS.get(play_style, SYSTEM_PROMPTS["gto-balanced"])
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
            print(f"[AIOpponent] {player.name} ({play_style}) raw='{raw.strip()}'")
            return self._parse_decision(raw, state.valid_actions)
        except Exception as exc:
            print(f"[AIOpponent] Claude API error for {player.name} ({play_style}): {exc}")
            return _stub_fallback(state.valid_actions)


ai_opponent = AIOpponent()
