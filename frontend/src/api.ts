import type { GameState } from "./types";

// In Docker, nginx proxies /api/* to the FastAPI backend.
// In local dev (outside Docker), point directly to the backend port.
const BASE_URL = "/api";

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail ?? "Unknown error");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Start a new game session and deal the first hand.
// Returns the session_id and initial GameState.
// ---------------------------------------------------------------------------
export async function newGame(
  numOpponents: number,
  skillLevel: "beginner" | "intermediate" | "advanced" = "beginner",
  startingStack: number = 1000
): Promise<{ session_id: string; skill_level: string; game_state: GameState }> {
  const res = await fetch(`${BASE_URL}/game/new`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      num_opponents: numOpponents,
      skill_level: skillLevel,
      starting_stack: startingStack,
    }),
  });
  return handleResponse(res);
}

// ---------------------------------------------------------------------------
// Submit the human player's action for the current hand.
// ---------------------------------------------------------------------------
export async function submitAction(
  sessionId: string,
  action: "fold" | "call" | "raise",
  amount: number = 0,
  skillLevel: string = "beginner"
): Promise<GameState> {
  const res = await fetch(`${BASE_URL}/game/${sessionId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, amount, skill_level: skillLevel }),
  });
  return handleResponse(res);
}

// ---------------------------------------------------------------------------
// Deal the next hand after the current one has ended.
// ---------------------------------------------------------------------------
export async function startHand(
  sessionId: string,
  skillLevel: string = "beginner"
): Promise<GameState> {
  const res = await fetch(`${BASE_URL}/game/${sessionId}/start-hand`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skill_level: skillLevel }),
  });
  return handleResponse(res);
}
