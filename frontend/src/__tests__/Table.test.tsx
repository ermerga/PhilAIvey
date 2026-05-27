import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Table } from "../components/Table";
import type { GameState } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    session_id: "test-session",
    players: [
      {
        id: "human",
        name: "You",
        stack: 990,
        is_human: true,
        play_style: null,
        hole_cards: ["Ah", "Kd"],
        is_folded: false,
        is_allin: false,
      },
      {
        id: "ai_0",
        name: "Player 1",
        stack: 1000,
        is_human: false,
        play_style: "tight-aggressive",
        hole_cards: [],
        is_folded: false,
        is_allin: false,
      },
      {
        id: "ai_1",
        name: "Player 2",
        stack: 1010,
        is_human: false,
        play_style: "loose-passive",
        hole_cards: [],
        is_folded: false,
        is_allin: false,
      },
    ],
    community_cards: [],
    pot: 30,
    street: "preflop",
    current_actor: "human",
    hand_number: 1,
    small_blind: 10,
    is_hand_over: false,
    winners: [],
    valid_actions: [],
    dealer_id: "ai_1",
    small_blind_id: "ai_0",
    big_blind_id: "human",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Table", () => {
  it("renders the oval table container", () => {
    const { container } = render(
      <Table
        gameState={makeGameState()}
        thinkingPlayerId={null}
        actionFlash={null}
      />
    );
    expect(container.querySelector(".table-felt")).toBeTruthy();
  });

  it("shows the street label during an active hand", () => {
    render(
      <Table
        gameState={makeGameState({ street: "flop", is_hand_over: false })}
        thinkingPlayerId={null}
        actionFlash={null}
      />
    );
    expect(screen.getByText("FLOP")).toBeTruthy();
  });

  it("hides the street label when the hand is over", () => {
    render(
      <Table
        gameState={makeGameState({ is_hand_over: true, winners: [] })}
        thinkingPlayerId={null}
        actionFlash={null}
      />
    );
    expect(screen.queryByText("PREFLOP")).toBeNull();
  });

  it("applies gold glow class to human seat when it is the human's turn", () => {
    const { container } = render(
      <Table
        gameState={makeGameState({ current_actor: "human" })}
        thinkingPlayerId={null}
        actionFlash={null}
      />
    );
    expect(container.querySelector(".seat-card--gold")).toBeTruthy();
  });

  it("applies purple glow class to the thinking AI's seat", () => {
    const { container } = render(
      <Table
        gameState={makeGameState({ current_actor: "ai_0" })}
        thinkingPlayerId="ai_0"
        actionFlash={null}
      />
    );
    expect(container.querySelector(".seat-card--purple")).toBeTruthy();
  });

  it("does not show winner badge on initial render (requires state transition)", () => {
    const { container } = render(
      <Table
        gameState={makeGameState({ is_hand_over: true, winners: ["human"] })}
        thinkingPlayerId={null}
        actionFlash={null}
      />
    );
    // winner-badge only fires after the is_hand_over transition, not on cold render
    expect(container.querySelector(".winner-badge")).toBeNull();
  });

  it("shows position badges (SB, BB, D) on the correct seats", () => {
    render(
      <Table
        gameState={makeGameState()}
        thinkingPlayerId={null}
        actionFlash={null}
      />
    );
    // human is BB, ai_0 is SB, ai_1 is D per makeGameState
    expect(screen.getByText("BB")).toBeTruthy();
    expect(screen.getByText("SB")).toBeTruthy();
    expect(screen.getByText("D")).toBeTruthy();
  });
});
