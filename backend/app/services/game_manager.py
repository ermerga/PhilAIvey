import asyncio
import json
import random
import uuid
from dataclasses import dataclass, field
from typing import Callable, Optional

from pypokerengine.engine.action_checker import ActionChecker
from pypokerengine.engine.pay_info import PayInfo
from pypokerengine.engine.player import Player as EnginePlayer
from pypokerengine.engine.round_manager import RoundManager
from pypokerengine.engine.table import Table as EngineTable

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PLAY_STYLES = [
    "tight-aggressive",
    "loose-aggressive",
    "tight-passive",
    "loose-passive",
    "maniac",
    "gto-balanced",
]

STREET_MAP = {
    0: "preflop",
    1: "flop",
    2: "turn",
    3: "river",
}

# ---------------------------------------------------------------------------
# Card conversion helpers
#
# PyPokerEngine card format : SUIT+RANK uppercase  e.g. "HA", "DK", "ST", "C2"
# Our app card format       : RANK+suit lowercase  e.g. "Ah", "Kd", "Ts", "2c"
# ---------------------------------------------------------------------------

_SUIT_TO_PYPOKER = {"h": "H", "d": "D", "s": "S", "c": "C"}
_SUIT_FROM_PYPOKER = {v: k for k, v in _SUIT_TO_PYPOKER.items()}


def _to_pypoker_card(card_str: str) -> str:
    """Convert 'Ah' → 'HA'."""
    rank = card_str[0].upper()
    suit = _SUIT_TO_PYPOKER[card_str[1].lower()]
    return suit + rank


def _from_pypoker_card(card_str: str) -> str:
    """Convert 'HA' → 'Ah'."""
    suit = _SUIT_FROM_PYPOKER[card_str[0].upper()]
    rank = card_str[1].upper()
    return rank + suit


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class PlayerState:
    id: str
    name: str
    stack: int
    is_human: bool
    play_style: Optional[str]           # None for the human player
    hole_cards: list[str] = field(default_factory=list)   # our card format
    action_history: list[dict] = field(default_factory=list)  # actions this session
    is_folded: bool = False
    is_allin: bool = False


@dataclass
class GameState:
    session_id: str
    players: list[PlayerState]
    community_cards: list[str]          # our card format
    pot: int
    street: str                         # preflop / flop / turn / river
    current_actor: Optional[str]        # player id, None when hand is over
    hand_number: int
    small_blind: int
    is_hand_over: bool
    winners: list[str]                  # player ids
    valid_actions: list[dict] = field(default_factory=list)
    engine_state: Optional[dict] = None # pypokerengine internal state — never sent to client
    dealer_id: Optional[str] = None
    small_blind_id: Optional[str] = None
    big_blind_id: Optional[str] = None


# ---------------------------------------------------------------------------
# GameManager
# ---------------------------------------------------------------------------


class GameManager:
    """
    Owns the Texas Hold'em game loop.

    Uses PyPokerEngine's RoundManager for step-by-step game control rather
    than the blocking start_poker() call. Active game state lives in memory
    (self._active_games) and is also persisted to Redis so it survives restarts.
    """

    def __init__(self, redis_client=None) -> None:
        self._active_games: dict[str, GameState] = {}
        self.redis = redis_client

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def create_session(
        self,
        num_opponents: int,
        starting_stack: int = 1000,
        small_blind: int = 10,
    ) -> GameState:
        """
        Create a new game session. Randomly assigns play styles to AI opponents
        and shuffles seating so the human's position varies each game.
        """
        session_id = str(uuid.uuid4())

        # Sample play styles without repetition so each AI is distinct
        styles = random.sample(PLAY_STYLES, k=min(num_opponents, len(PLAY_STYLES)))

        human = PlayerState(
            id="human",
            name="You",
            stack=starting_stack,
            is_human=True,
            play_style=None,
        )
        ai_players = [
            PlayerState(
                id=f"ai_{i}",
                name=f"Player {i + 1}",
                stack=starting_stack,
                is_human=False,
                play_style=styles[i],
            )
            for i in range(num_opponents)
        ]

        all_players = [human] + ai_players
        random.shuffle(all_players)   # randomise seating each game

        state = GameState(
            session_id=session_id,
            players=all_players,
            community_cards=[],
            pot=0,
            street="preflop",
            current_actor=None,
            hand_number=0,
            small_blind=small_blind,
            is_hand_over=True,
            winners=[],
        )
        self._active_games[session_id] = state
        return state

    def get_session(self, session_id: str) -> Optional[GameState]:
        """Return the active GameState for a session, or None if not found."""
        return self._active_games.get(session_id)

    async def start_hand(
        self, session_id: str, broadcast: Optional[Callable] = None
    ) -> GameState:
        """
        Deal a new hand. Increments hand_number, resets per-hand state, calls
        RoundManager to deal hole cards, then runs AI turns if the first actor
        is not the human.

        broadcast : optional async callable(session_id, message_dict) — used to
                    push ai_thinking and game_state updates mid-loop.
        """
        state = self._require_state(session_id)
        state.hand_number += 1
        state.community_cards = []
        state.pot = 0
        state.street = "preflop"
        state.is_hand_over = False
        state.winners = []

        # Remove bust players (stack = 0) — they can't post blinds
        state.players = [p for p in state.players if p.stack > 0]

        # If fewer than 2 players remain, the game is effectively over
        if len(state.players) < 2:
            state.is_hand_over = True
            state.winners = [p.id for p in state.players]
            self._active_games[session_id] = state
            return state

        # Reset per-hand player fields
        for p in state.players:
            p.hole_cards = []
            p.is_folded = False
            p.is_allin = False

        # Rotate the dealer button one seat clockwise each hand.
        n = len(state.players)
        old_dealer_id = state.dealer_id
        if old_dealer_id is None:
            dealer_idx = 0
        else:
            prev_pos = next((i for i, p in enumerate(state.players) if p.id == old_dealer_id), None)
            dealer_idx = 0 if prev_pos is None else (prev_pos + 1) % n

        # Heads-up: dealer IS the SB (acts first preflop).
        # 3+ players: SB is one seat left of dealer, BB is two seats left.
        if n == 2:
            sb_idx = dealer_idx
            bb_idx = (dealer_idx + 1) % n
        else:
            sb_idx = (dealer_idx + 1) % n
            bb_idx = (dealer_idx + 2) % n

        table = self._build_engine_table(state)
        table.set_blind_pos(sb_idx, bb_idx)

        engine_state, messages = RoundManager.start_new_round(
            state.hand_number,
            state.small_blind,
            0,
            table,
        )

        # Sync our state from the engine's initial state
        self._extract_state(state, engine_state, messages)

        # Set positions directly. dealer_idx is already computed above.
        # sb_pos() / bb_pos() are authoritative for which seat posted blinds.
        t = engine_state["table"]
        seat_players = t.seats.players
        if seat_players:
            state.dealer_id = state.players[dealer_idx].id
            state.small_blind_id = seat_players[t.sb_pos()].uuid
            state.big_blind_id = seat_players[t.bb_pos()].uuid

        # If the first actor is an AI, run their turns automatically
        if state.current_actor and not self._is_human_turn(state):
            state = await self._run_ai_actions(state, broadcast)

        self._active_games[session_id] = state
        return state

    async def apply_human_action(
        self, session_id: str, action: str, amount: int = 0,
        broadcast: Optional[Callable] = None,
    ) -> GameState:
        """
        Apply the human player's action, then run AI turns until it is the
        human's turn again or the hand ends.

        action    : "fold" | "call" | "raise"
        amount    : chip amount (only relevant for raise)
        broadcast : optional async callable(session_id, message_dict)
        """
        state = self._require_state(session_id)

        if state.is_hand_over:
            raise ValueError("Hand is already over. Call start_hand() first.")
        if state.current_actor != "human":
            raise ValueError("It is not the human's turn.")

        prev_street = state.street
        prev_card_count = len(state.community_cards)

        engine_state, messages = RoundManager.apply_action(
            state.engine_state, action, amount
        )
        self._extract_state(state, engine_state, messages)

        # Record the action in the human player's session history
        human = self._get_player(state, "human")
        if human:
            human.action_history.append(
                {"street": state.street, "action": action, "amount": amount}
            )

        # Broadcast the human's action flash NOW, before AI turns run.
        # The route used to do this after apply_human_action returned, which
        # meant the flash fired after all AI player_acted + game_state messages
        # had already played — showing the animation on the wrong player.
        if broadcast:
            await broadcast(state.session_id, {
                "type": "player_acted",
                "player_id": "human",
                "action": action,
                "amount": amount,
            })

        # If the human's action triggered an all-in runout, broadcast each
        # intermediate street so the player watches the board run out.
        await self._broadcast_runout_if_needed(state, prev_card_count, broadcast)

        # If a new street was just dealt (flop/turn/river), pause before AI acts
        # so the player has time to register the new community cards.
        street_changed = not state.is_hand_over and state.street != prev_street

        # Run AI turns until back to the human or the hand ends
        if not state.is_hand_over and not self._is_human_turn(state):
            state = await self._run_ai_actions(
                state, broadcast, street_delay=2.5 if street_changed else 0.0
            )

        self._active_games[session_id] = state
        return state

    def get_state(self, session_id: str) -> Optional[GameState]:
        return self._active_games.get(session_id)

    def serialize_for_client(self, state: GameState, reveal_ai_cards: bool = False) -> dict:
        """
        Build a JSON-safe dict to send to the React frontend.
        - AI hole cards are hidden until showdown
        - reveal_ai_cards=True forces AI cards visible (used during all-in runout)
        - engine_state is excluded entirely
        """
        show_all = state.is_hand_over or reveal_ai_cards
        players_out = []
        for p in state.players:
            # Reveal AI cards at showdown or during runout (non-folded players only)
            show_cards = p.is_human or (show_all and not p.is_folded)
            players_out.append({
                "id": p.id,
                "name": p.name,
                "stack": p.stack,
                "is_human": p.is_human,
                "play_style": p.play_style,
                "hole_cards": p.hole_cards if show_cards else [],
                "is_folded": p.is_folded,
                "is_allin": p.is_allin,
            })

        return {
            "session_id": state.session_id,
            "players": players_out,
            "community_cards": state.community_cards,
            "pot": state.pot,
            "street": state.street,
            "current_actor": state.current_actor,
            "hand_number": state.hand_number,
            "small_blind": state.small_blind,
            "is_hand_over": state.is_hand_over,
            "winners": state.winners,
            "valid_actions": state.valid_actions,
            "dealer_id": state.dealer_id,
            "small_blind_id": state.small_blind_id,
            "big_blind_id": state.big_blind_id,
        }

    # ------------------------------------------------------------------
    # Redis persistence
    # ------------------------------------------------------------------

    async def save_to_redis(self, state: GameState) -> None:
        """Persist serialized state to Redis (excludes engine_state)."""
        if not self.redis:
            return
        key = f"game:{state.session_id}:state"
        payload = self.serialize_for_client(state)
        await self.redis.set(key, json.dumps(payload), ex=3600)  # 1-hour TTL

    async def load_from_redis(self, session_id: str) -> Optional[dict]:
        """Load serialized state from Redis. Returns raw dict (no engine_state)."""
        if not self.redis:
            return None
        key = f"game:{session_id}:state"
        raw = await self.redis.get(key)
        return json.loads(raw) if raw else None

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _run_ai_actions(
        self, state: GameState, broadcast: Optional[Callable] = None,
        street_delay: float = 0.0,
    ) -> GameState:
        """
        Loop through AI turns automatically until it is the human's turn
        or the hand ends.

        Before each action: broadcasts ai_thinking so the UI shows who's thinking.
        After each action: broadcasts the updated game_state.
        street_delay: extra pause after broadcasting the new street so the player
        can register flop/turn/river cards before the first AI acts.
        """
        # Push the current state immediately so the frontend shows the correct
        # street and community cards before any ai_thinking event fires.
        # Without this, the user sees the OLD street while an AI is "thinking."
        if broadcast:
            await broadcast(state.session_id, {
                "type": "game_state",
                "data": self.serialize_for_client(state),
            })

        # Pause so the player has time to see new community cards
        if street_delay > 0:
            await asyncio.sleep(street_delay)

        while not state.is_hand_over and not self._is_human_turn(state):
            acting_player = self._get_player(state, state.current_actor)

            # Tell the frontend this AI is now thinking
            if broadcast and acting_player:
                await broadcast(state.session_id, {
                    "type": "ai_thinking",
                    "player_id": acting_player.id,
                    "player_name": acting_player.name,
                })

            # Pause so the UI has time to show the thinking state
            await asyncio.sleep(1.5)

            # Capture the actor before _extract_state overwrites current_actor
            actor_id = state.current_actor
            if acting_player:
                from app.services.ai_opponent import ai_opponent
                action, amount = await ai_opponent.decide(acting_player, state)
                amt_str = f" {amount}" if action == "raise" else ""
                print(f"[AI] {acting_player.name} ({acting_player.play_style}) → {action}{amt_str}")
            else:
                action, amount = self._stub_ai_action(state.valid_actions)

            prev_card_count = len(state.community_cards)
            engine_state, messages = RoundManager.apply_action(
                state.engine_state, action, amount
            )
            self._extract_state(state, engine_state, messages)

            # Record the action in the AI player's session history
            actor = self._get_player(state, actor_id)
            if actor:
                actor.action_history.append(
                    {"street": state.street, "action": action, "amount": amount}
                )

            # Broadcast the action so the UI can animate it
            if broadcast:
                await broadcast(state.session_id, {
                    "type": "player_acted",
                    "player_id": actor_id,
                    "action": action,
                    "amount": amount,
                })

            # If this AI action triggered an all-in runout, broadcast each
            # intermediate street before the final hand-over state.
            await self._broadcast_runout_if_needed(state, prev_card_count, broadcast)

            # Broadcast the updated game state
            if broadcast:
                await broadcast(state.session_id, {
                    "type": "game_state",
                    "data": self.serialize_for_client(state),
                })

        return state

    async def _broadcast_runout_if_needed(
        self,
        state: GameState,
        prev_card_count: int,
        broadcast: Optional[Callable],
    ) -> None:
        """
        When all players are all-in, PyPokerEngine runs the full board in a
        single apply_action call, skipping intermediate streets. This method
        detects that jump (is_hand_over=True with new community cards) and
        re-broadcasts each street one at a time with a pause so the player
        can watch the run-out unfold.

        AI hole cards are revealed face-up during the runout (standard poker
        etiquette for all-in situations).
        """
        if not broadcast:
            return

        final_cards = state.community_cards[:]
        # Only fire for all-in runouts: hand ended AND new cards appeared
        if not (state.is_hand_over and len(final_cards) > prev_card_count):
            return

        # Snapshot the final state so we can restore it after the broadcasts
        final_is_hand_over = state.is_hand_over
        final_winners = state.winners[:]
        final_current_actor = state.current_actor
        final_valid_actions = state.valid_actions[:]
        final_street = state.street

        # Broadcast each new street in order: flop (3), turn (4), river (5)
        STREET_THRESHOLDS = [(3, "flop"), (4, "turn"), (5, "river")]
        new_streets = [
            (count, name)
            for count, name in STREET_THRESHOLDS
            if count > prev_card_count and count <= len(final_cards)
        ]

        for count, street_name in new_streets:
            state.community_cards = final_cards[:count]
            state.is_hand_over = False
            state.winners = []
            state.current_actor = None
            state.valid_actions = []
            state.street = street_name

            await broadcast(state.session_id, {
                "type": "game_state",
                # reveal_ai_cards=True: all-in players show cards face-up
                "data": self.serialize_for_client(state, reveal_ai_cards=True),
            })
            await asyncio.sleep(2.0)

        # Restore the real final state
        state.community_cards = final_cards
        state.is_hand_over = final_is_hand_over
        state.winners = final_winners
        state.current_actor = final_current_actor
        state.valid_actions = final_valid_actions
        state.street = final_street

    def _stub_ai_action(self, valid_actions: list[dict]) -> tuple[str, int]:
        """
        Phase 1 placeholder: pick a random valid action.
        Will be replaced in Phase 3 with Claude API calls.

        valid_actions format from PyPokerEngine:
          [
            {"action": "fold",  "amount": 0},
            {"action": "call",  "amount": <int>},
            {"action": "raise", "amount": {"min": <int>, "max": <int>}},
          ]
        """
        if not valid_actions:
            return "call", 0

        # Weight toward call to make early games less chaotic
        choice = random.choices(
            ["fold", "call", "raise"],
            weights=[15, 60, 25],
            k=1,
        )[0]

        if choice == "fold":
            return "fold", 0

        if choice == "call":
            call = next((a for a in valid_actions if a["action"] == "call"), None)
            return "call", call["amount"] if call else 0

        # raise
        raise_action = next((a for a in valid_actions if a["action"] == "raise"), None)
        if raise_action and isinstance(raise_action["amount"], dict):
            min_raise = raise_action["amount"]["min"]
            max_raise = raise_action["amount"]["max"]
            amount = random.randint(min_raise, min(min_raise * 3, max_raise))
            return "raise", amount

        return "call", 0

    def _build_engine_table(self, state: GameState) -> EngineTable:
        """Build a PyPokerEngine Table with all players seated."""
        table = EngineTable()
        for p in state.players:
            ep = EnginePlayer(p.id, p.stack, p.name)
            ep.hole_card = []
            ep.action_histories = []
            ep.pay_info = PayInfo()
            table.seats.sitdown(ep)
        return table

    def _extract_state(self, state: GameState, engine_state: dict, messages: list) -> None:
        """
        Sync our GameState from PyPokerEngine's engine_state and messages.

        Real engine_state structure (confirmed by inspection):
          {
            "street": int (0=preflop, 1=flop, 2=turn, 3=river),
            "next_player": int (seat index),
            "round_count": int,
            "small_blind_amount": int,
            "table": Table object  ← players, hole cards, community cards live here
          }

        Pot and valid_actions live in the messages, specifically in
        the round_state dict inside street_start_message and ask_message.
        """
        table = engine_state["table"]

        # Street
        street_int = engine_state.get("street", 0)
        state.street = STREET_MAP.get(street_int, "preflop")

        # Community cards from the table object
        raw_board = table.get_community_card()
        state.community_cards = [_from_pypoker_card(str(c)) for c in raw_board]

        # Player stacks, hole cards, fold/allin from live Player objects.
        # Fold/allin status lives on pay_info: FOLDED=2, ALLIN=1, PAY_TILL_END=0
        for ep in table.seats.players:
            our_player = self._get_player(state, ep.uuid)
            if not our_player:
                continue
            our_player.stack = ep.stack
            our_player.is_folded = ep.pay_info.status == PayInfo.FOLDED
            our_player.is_allin = ep.pay_info.status == PayInfo.ALLIN
            if ep.hole_card:
                our_player.hole_cards = [_from_pypoker_card(str(c)) for c in ep.hole_card]

        # Current actor from next_player seat index
        next_idx = engine_state.get("next_player")
        if isinstance(next_idx, str):
            try:
                next_idx = int(next_idx)
            except ValueError:
                next_idx = None
        seat_players = table.seats.players
        if next_idx is not None and 0 <= next_idx < len(seat_players):
            state.current_actor = seat_players[next_idx].uuid
        else:
            state.current_actor = None

        # Parse messages for pot, valid_actions, and hand-over detection
        for receiver, msg in messages:
            msg_data = msg.get("message", {})
            msg_type = msg_data.get("message_type", "")

            # Pot lives in the round_state dict inside street/ask messages
            if msg_type in ("street_start_message", "ask_message"):
                round_state_dict = msg_data.get("round_state", {})
                pot_info = round_state_dict.get("pot", {})
                main_pot = pot_info.get("main", {}).get("amount", 0)
                if main_pot:
                    state.pot = main_pot

            # Valid actions come from the ask_message for the current actor
            if msg_type == "ask_message":
                state.valid_actions = msg_data.get("valid_actions", [])

            # Hand over when we get a round_result_message
            if msg_type == "round_result_message":
                state.is_hand_over = True
                state.current_actor = None
                winners = msg_data.get("winners", [])
                state.winners = [w.get("uuid", "") for w in winners]
                # PyPokerEngine clears table.get_community_card() after the round
                # ends, but the final board is preserved in round_state.community_card.
                # We must read from here for all-in runout detection to work.
                round_state = msg_data.get("round_state", {})
                final_board = round_state.get("community_card", [])
                if final_board:
                    state.community_cards = [_from_pypoker_card(str(c)) for c in final_board]

        state.engine_state = engine_state

    def _is_human_turn(self, state: GameState) -> bool:
        return state.current_actor == "human"

    def _get_player(self, state: GameState, player_id: Optional[str]) -> Optional[PlayerState]:
        if not player_id:
            return None
        return next((p for p in state.players if p.id == player_id), None)

    def _require_state(self, session_id: str) -> GameState:
        state = self._active_games.get(session_id)
        if not state:
            raise ValueError(f"No active game session: {session_id}")
        return state


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

# Injected with a Redis client in main.py after startup.
# Routers import this directly for Phase 1 simplicity.
game_manager = GameManager()
