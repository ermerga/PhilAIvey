// ---------------------------------------------------------------------------
// These interfaces mirror the JSON shape returned by the FastAPI backend.
// If the backend response changes, update these types to match.
// ---------------------------------------------------------------------------

export interface ValidAction {
  action: "fold" | "call" | "raise";
  amount: number | { min: number; max: number };
}

export interface Player {
  id: string;
  name: string;
  stack: number;
  is_human: boolean;
  play_style: string | null;
  hole_cards: string[];   // e.g. ["Ah", "Kd"] — empty array for AI players until showdown
  is_folded: boolean;
  is_allin: boolean;
}

export interface GameState {
  session_id: string;
  players: Player[];
  community_cards: string[];  // 0–5 cards e.g. ["Qh", "7c", "2d"]
  pot: number;
  street: "preflop" | "flop" | "turn" | "river";
  current_actor: string | null;  // player id of whoever needs to act, null if hand is over
  hand_number: number;
  small_blind: number;
  is_hand_over: boolean;
  winners: string[];        // player ids of winners
  valid_actions: ValidAction[];
}

// Shape of every message received over the WebSocket
export interface WebSocketMessage {
  type: "game_state";
  data: GameState;
}
