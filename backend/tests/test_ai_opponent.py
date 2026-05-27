import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.ai_opponent import AIOpponent, SYSTEM_PROMPTS, _stub_fallback
from app.services.game_manager import PLAY_STYLES


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

VALID_ACTIONS = [
    {"action": "fold", "amount": 0},
    {"action": "call", "amount": 50},
    {"action": "raise", "amount": {"min": 100, "max": 500}},
]

VALID_ACTIONS_NO_RAISE = [
    {"action": "fold", "amount": 0},
    {"action": "call", "amount": 50},
]


# ---------------------------------------------------------------------------
# _parse_decision — 6 paths (no API call, no async)
# ---------------------------------------------------------------------------

class TestParseDecision:
    def setup_method(self):
        self.opponent = AIOpponent()

    def test_fold(self):
        assert self.opponent._parse_decision("fold", VALID_ACTIONS) == ("fold", 0)

    def test_call(self):
        assert self.opponent._parse_decision("call", VALID_ACTIONS) == ("call", 50)

    def test_raise_in_range(self):
        assert self.opponent._parse_decision("raise 200", VALID_ACTIONS) == ("raise", 200)

    def test_raise_clamped_to_max(self):
        action, amount = self.opponent._parse_decision("raise 99999", VALID_ACTIONS)
        assert action == "raise"
        assert amount == 500

    def test_raise_bad_int_falls_back(self):
        # "raise abc" triggers ValueError — must return a valid action
        action, amount = self.opponent._parse_decision("raise abc", VALID_ACTIONS)
        assert action in ("fold", "call", "raise")
        assert isinstance(amount, int)

    def test_unrecognized_response_falls_back(self):
        # Hallucinated explanation — must return a valid action
        action, amount = self.opponent._parse_decision("I would raise here.", VALID_ACTIONS)
        assert action in ("fold", "call", "raise")
        assert isinstance(amount, int)

    def test_empty_string_falls_back(self):
        action, amount = self.opponent._parse_decision("", VALID_ACTIONS)
        assert action in ("fold", "call", "raise")
        assert isinstance(amount, int)


# ---------------------------------------------------------------------------
# decide() — API happy path and exception fallback (async, mocked client)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestDecide:
    def _make_mock_response(self, text: str) -> MagicMock:
        content_block = MagicMock()
        content_block.text = text
        response = MagicMock()
        response.content = [content_block]
        return response

    def _make_mock_player(self, play_style: str = "tight-aggressive"):
        player = MagicMock()
        player.name = "Bot1"
        player.play_style = play_style
        player.hole_cards = ["Ah", "Kd"]
        player.stack = 1000
        player.action_history = []
        return player

    def _make_mock_state(self):
        state = MagicMock()
        state.community_cards = ["2h", "7d", "Jc"]
        state.street = "flop"
        state.pot = 200
        state.valid_actions = VALID_ACTIONS
        player = MagicMock()
        player.is_folded = False
        state.players = [player]
        return state

    async def test_happy_path_call(self):
        opponent = AIOpponent()
        player = self._make_mock_player()
        state = self._make_mock_state()

        mock_create = AsyncMock(return_value=self._make_mock_response("call"))
        with patch.object(opponent, "_get_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.messages.create = mock_create
            mock_get_client.return_value = mock_client

            action, amount = await opponent.decide(player, state)

        assert action == "call"
        assert amount == 50

    async def test_api_exception_falls_back(self):
        opponent = AIOpponent()
        player = self._make_mock_player()
        state = self._make_mock_state()

        mock_create = AsyncMock(side_effect=Exception("rate limited"))
        with patch.object(opponent, "_get_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.messages.create = mock_create
            mock_get_client.return_value = mock_client

            action, amount = await opponent.decide(player, state)

        assert action in ("fold", "call", "raise")
        assert isinstance(amount, int)


# ---------------------------------------------------------------------------
# _stub_fallback — edge cases
# ---------------------------------------------------------------------------

class TestStubFallback:
    def test_empty_valid_actions(self):
        assert _stub_fallback([]) == ("call", 0)

    def test_returns_valid_action(self):
        for _ in range(20):  # run enough times to hit all branches
            action, amount = _stub_fallback(VALID_ACTIONS)
            assert action in ("fold", "call", "raise")
            assert isinstance(amount, int)
            if action == "raise":
                assert 100 <= amount <= 500

    def test_no_raise_option_falls_back_to_call(self):
        # When raise is not in valid_actions, stub must not crash
        action, amount = _stub_fallback(VALID_ACTIONS_NO_RAISE)
        assert action in ("fold", "call")
        assert isinstance(amount, int)


# ---------------------------------------------------------------------------
# SYSTEM_PROMPTS coverage — all 6 play styles must have entries
# ---------------------------------------------------------------------------

class TestSystemPrompts:
    def test_all_play_styles_present(self):
        for style in PLAY_STYLES:
            assert style in SYSTEM_PROMPTS, f"Missing system prompt for play style: {style}"

    def test_all_prompts_non_empty(self):
        for style, prompt in SYSTEM_PROMPTS.items():
            assert len(prompt.strip()) > 50, f"System prompt for {style} looks too short"
