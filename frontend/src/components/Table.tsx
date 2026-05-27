import { useState, useEffect, useRef } from "react";
import type { ActionFlash, GameState, Player } from "../types";

interface TableProps {
  gameState: GameState;
  thinkingPlayerId: string | null;
  actionFlash: ActionFlash | null;
}

export function Table({ gameState, thinkingPlayerId, actionFlash }: TableProps) {
  const {
    players,
    community_cards,
    pot,
    street,
    current_actor,
    is_hand_over,
    winners,
    hand_number,
    small_blind_id,
    big_blind_id,
    dealer_id,
  } = gameState;

  const human = players.find((p) => p.is_human) ?? null;

  // ---------------------------------------------------------------------------
  // Community card deal animation
  // Track how many cards were visible last render. When more cards appear,
  // mark which indices are "new" so we can stagger the deal animation.
  // ---------------------------------------------------------------------------
  const prevCardCountRef = useRef(community_cards.length);
  const [animRange, setAnimRange] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const prev = prevCardCountRef.current;
    const curr = community_cards.length;
    if (curr > prev) {
      setAnimRange({ start: prev, end: curr - 1 });
      // Clear the animation classes after they finish (0.72s × 5 cards + buffer)
      const timeout = setTimeout(() => setAnimRange(null), 1500);
      prevCardCountRef.current = curr;
      return () => clearTimeout(timeout);
    }
    // Cards were cleared (new hand starting) — just reset the ref
    prevCardCountRef.current = curr;
  }, [community_cards.length]);

  // ---------------------------------------------------------------------------
  // Winner animation + show/muck prompt
  // ---------------------------------------------------------------------------
  const [winnerAnimActive, setWinnerAnimActive] = useState(false);
  const [showMuckPrompt, setShowMuckPrompt] = useState(false);
  const [muckChosen, setMuckChosen] = useState(false);

  useEffect(() => {
    if (!is_hand_over) {
      // New hand started — reset everything
      setWinnerAnimActive(false);
      setShowMuckPrompt(false);
      setMuckChosen(false);
      return;
    }
    if (hand_number === 0) return; // fresh game, nothing to animate yet
    // Hand just ended — play winner animation
    setWinnerAnimActive(true);
    // Show the show/muck prompt when the human is the sole winner (won by fold)
    if (winners.length === 1 && winners[0] === human?.id) {
      setShowMuckPrompt(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [is_hand_over]);

  // ---------------------------------------------------------------------------
  // Seat layout helpers
  // ---------------------------------------------------------------------------
  const humanIdx = players.findIndex((p) => p.is_human);
  const aiPlayers = [
    ...players.slice(humanIdx + 1),
    ...players.slice(0, humanIdx),
  ].filter((p) => !p.is_human);

  const CLOCKWISE_SEATS: Record<number, string[]> = {
    1: ["p3"],
    2: ["p1", "p2"],
    3: ["p1", "p3", "p2"],
    4: ["p4", "p1", "p2", "p5"],
    5: ["p4", "p1", "p3", "p2", "p5"],
  };
  function seatClass(idx: number): string {
    const seats = CLOCKWISE_SEATS[aiPlayers.length] ?? aiPlayers.map((_, i) => `p${i + 1}`);
    return `seat-pos--${seats[idx] ?? `p${idx + 1}`}`;
  }

  return (
    <div>
      {/* Hand info bar */}
      <div style={styles.handInfo}>
        <span style={styles.handNum}>
          {hand_number === 0 ? "" : `Hand #${hand_number}`}
        </span>
      </div>

      {/* Oval table — always rendered */}
      <div className="table-viewport">
        <div className="table-wrap">
          <div className="table-felt" />

          {/* Community cards + pot */}
          <div className="table-center">
            <div style={styles.streetLabel}>
              {is_hand_over ? "" : street.toUpperCase()}
            </div>
            <div style={styles.communityCards}>
              {community_cards.map((card, i) => {
                const isNew = animRange !== null && i >= animRange.start && i <= animRange.end;
                const delay = isNew ? (i - animRange!.start) * 0.12 : 0;
                return (
                  <div
                    key={i}
                    className={`community-card-wrapper${isNew ? " community-card-wrapper--dealing" : ""}`}
                    style={isNew ? { animationDelay: `${delay}s` } : undefined}
                  >
                    <CardDisplay card={card} />
                  </div>
                );
              })}
            </div>
            {!is_hand_over && pot > 0 && (
              <div style={styles.potChip}>
                <span style={styles.potLabel}>Pot</span>
                {pot} chips
              </div>
            )}
          </div>

          {/* Human seat */}
          {human && (
            <div className="seat-pos seat-pos--human">
              <PlayerSeat
                player={human}
                isCurrentActor={human.id === current_actor}
                isWinner={winners.includes(human.id)}
                isThinking={human.id === thinkingPlayerId}
                isDealer={human.id === dealer_id}
                isSB={human.id === small_blind_id}
                isBB={human.id === big_blind_id}
                actionFlash={actionFlash?.playerId === human.id ? actionFlash : null}
                winnerAnimActive={winnerAnimActive}
                showMuckPrompt={showMuckPrompt && !muckChosen}
                muckChosen={muckChosen}
                onShow={() => setShowMuckPrompt(false)}
                onMuck={() => { setMuckChosen(true); setShowMuckPrompt(false); }}
              />
            </div>
          )}

          {/* AI seats */}
          {aiPlayers.map((player, idx) => (
            <div key={player.id} className={`seat-pos ${seatClass(idx)}`}>
              <PlayerSeat
                player={player}
                isCurrentActor={player.id === current_actor}
                isWinner={winners.includes(player.id)}
                isThinking={player.id === thinkingPlayerId}
                isDealer={player.id === dealer_id}
                isSB={player.id === small_blind_id}
                isBB={player.id === big_blind_id}
                actionFlash={actionFlash?.playerId === player.id ? actionFlash : null}
                winnerAnimActive={winnerAnimActive}
                showMuckPrompt={false}
                muckChosen={false}
                onShow={() => {}}
                onMuck={() => {}}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlayerSeat
// ---------------------------------------------------------------------------

interface PlayerSeatProps {
  player: Player;
  isCurrentActor: boolean;
  isWinner: boolean;
  isThinking: boolean;
  isDealer: boolean;
  isSB: boolean;
  isBB: boolean;
  actionFlash: ActionFlash | null;
  winnerAnimActive: boolean;
  showMuckPrompt: boolean;
  muckChosen: boolean;
  onShow: () => void;
  onMuck: () => void;
}

function PlayerSeat({
  player,
  isCurrentActor,
  isWinner,
  isThinking,
  isDealer,
  isSB,
  isBB,
  actionFlash,
  winnerAnimActive,
  showMuckPrompt,
  muckChosen,
  onShow,
  onMuck,
}: PlayerSeatProps) {
  const flashClass = actionFlash ? `seat-card--flash-${actionFlash.action}` : "";

  // Winner announced = gold pulse; loser dim = fade to 38%
  const winnerAnnouncedClass = winnerAnimActive && isWinner ? "seat-card--winner-announced" : "";
  const loserDimClass = winnerAnimActive && !isWinner && !player.is_folded ? "seat-card--loser-dim" : "";

  const cardClasses = [
    "seat-card",
    flashClass || (isThinking ? "seat-card--purple" : isCurrentActor ? "seat-card--gold" : ""),
    player.is_folded ? "seat-card--folded" : "",
    isWinner && !winnerAnimActive ? "seat-card--winner" : "",
    winnerAnnouncedClass,
    loserDimClass,
  ]
    .filter(Boolean)
    .join(" ");

  const ACTION_LABELS: Record<string, string> = {
    fold: "Fold",
    call: "Call",
    raise: "Raise",
  };

  return (
    <div className={cardClasses} style={{ position: "relative" }}>
      {isDealer && <div className="dealer-btn">D</div>}

      {/* Winner badge — bounces in above the card */}
      {winnerAnimActive && isWinner && (
        <div className="winner-badge">Winner!</div>
      )}

      {/* Show/muck prompt — only for human when they won by fold */}
      {showMuckPrompt && (
        <ShowMuckPrompt onShow={onShow} onMuck={onMuck} />
      )}

      {actionFlash && (
        <div className={`action-label action-label--${actionFlash.action}`}>
          {ACTION_LABELS[actionFlash.action]}
          {actionFlash.action !== "fold" && actionFlash.amount > 0 && (
            <span className="action-label__amount"> {actionFlash.amount}</span>
          )}
        </div>
      )}

      <div style={styles.seatName}>{player.name}</div>
      <div style={styles.seatStack}>{player.stack} chips</div>

      <div className="seat-badges">
        {isSB && <span className="badge badge--sb">SB</span>}
        {isBB && <span className="badge badge--bb">BB</span>}
        {!isSB && !isBB && isDealer && <span className="badge badge--btn">BTN</span>}
        {isThinking && <span className="badge badge--thinking">Thinking…</span>}
        {isCurrentActor && !isThinking && <span className="badge badge--acting">Acting</span>}
        {player.is_folded && <span className="badge badge--folded">Folded</span>}
        {player.is_allin && <span className="badge badge--allin">All-in</span>}
        {isWinner && <span className="badge badge--winner">Winner</span>}
      </div>

      {/* Hole cards */}
      <div style={styles.holeCards}>
        {player.hole_cards.length > 0 ? (
          player.hole_cards.map((card, i) => (
            <CardDisplay
              key={i}
              card={card}
              className={muckChosen ? "card--muck" : undefined}
            />
          ))
        ) : (
          !player.is_human && !player.is_folded && (
            <>
              <CardBack />
              <CardBack />
            </>
          )
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShowMuckPrompt — compact prompt above the human's seat when they win by fold
// ---------------------------------------------------------------------------

function ShowMuckPrompt({ onShow, onMuck }: { onShow: () => void; onMuck: () => void }) {
  return (
    <div className="show-muck-prompt">
      <div className="show-muck-prompt__title">Show cards?</div>
      <div className="show-muck-prompt__buttons">
        <button className="show-muck-prompt__btn show-muck-prompt__btn--show" onClick={onShow}>
          Show
        </button>
        <button className="show-muck-prompt__btn show-muck-prompt__btn--muck" onClick={onMuck}>
          Muck
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardDisplay — a single face-up card
// ---------------------------------------------------------------------------

function CardDisplay({ card, className }: { card: string; className?: string }) {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);

  const suitSymbol: Record<string, string> = {
    h: "♥",
    d: "♦",
    s: "♠",
    c: "♣",
  };
  const isRed = suit === "h" || suit === "d";

  return (
    <div
      className={className}
      style={{ ...styles.card, color: isRed ? "#dc2626" : "#111" }}
    >
      <div style={styles.cardRank}>{rank}</div>
      <div style={styles.cardSuit}>{suitSymbol[suit] ?? suit}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardBack — face-down placeholder for AI hands
// ---------------------------------------------------------------------------

function CardBack() {
  return (
    <div
      style={{
        ...styles.card,
        background: "linear-gradient(135deg, #1e3a8a, #3730a3)",
        color: "transparent",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  handInfo: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#ccc",
    fontSize: "13px",
    fontWeight: "bold",
    padding: "0 8px 8px",
    maxWidth: "620px",
    margin: "0 auto",
  },
  handNum: {
    color: "#94a3b8",
  },
  streetLabel: {
    color: "#f0c040",
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "3px",
    textTransform: "uppercase",
    opacity: 0.75,
  },
  communityCards: {
    display: "flex",
    gap: "5px",
  },
  potChip: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(0,0,0,0.4)",
    borderRadius: "20px",
    padding: "4px 12px",
    fontSize: "12px",
    fontWeight: 700,
    color: "#e2e8f0",
  },
  potLabel: {
    color: "#64748b",
    fontSize: "10px",
    fontWeight: 400,
    marginRight: "2px",
  },
  seatName: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#e2e8f0",
  },
  seatStack: {
    fontSize: "11px",
    color: "#64748b",
    marginTop: "1px",
  },
  holeCards: {
    display: "flex",
    gap: "3px",
    marginTop: "3px",
    justifyContent: "center",
  },
  card: {
    width: "28px",
    height: "38px",
    borderRadius: "3px",
    fontSize: "9px",
    fontWeight: 800,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#fff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
    lineHeight: 1,
    gap: 0,
    userSelect: "none",
  },
  cardRank: {
    fontSize: "11px",
    lineHeight: 1,
  },
  cardSuit: {
    fontSize: "9px",
    lineHeight: 1,
  },
};
