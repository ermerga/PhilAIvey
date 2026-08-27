import { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { ActionFlash, GameState, Player } from "../types";
import { humanSeat, aiSeats, puckAnchor, type Point } from "../lib/seatLayout";

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
  // Track how many cards were visible last render. When more appear, mark the
  // new indices so we can stagger the deal.
  // ---------------------------------------------------------------------------
  const prevCardCountRef = useRef(community_cards.length);
  const [animRange, setAnimRange] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const prev = prevCardCountRef.current;
    const curr = community_cards.length;
    if (curr > prev) {
      setAnimRange({ start: prev, end: curr - 1 });
      const timeout = setTimeout(() => setAnimRange(null), 1500);
      prevCardCountRef.current = curr;
      return () => clearTimeout(timeout);
    }
    prevCardCountRef.current = curr;
  }, [community_cards.length]);

  // ---------------------------------------------------------------------------
  // Winner animation + show/muck prompt
  // ---------------------------------------------------------------------------
  const [winnerAnimActive, setWinnerAnimActive] = useState(false);
  const [showMuckPrompt, setShowMuckPrompt] = useState(false);
  const [muckChosen, setMuckChosen] = useState(false);
  const prevIsHandOverRef = useRef(is_hand_over);

  useEffect(() => {
    const prevIsHandOver = prevIsHandOverRef.current;
    prevIsHandOverRef.current = is_hand_over;

    if (!is_hand_over) {
      setWinnerAnimActive(false);
      setShowMuckPrompt(false);
      setMuckChosen(false);
      return;
    }
    if (prevIsHandOver) return;
    if (hand_number === 0) return;
    setWinnerAnimActive(true);
    if (winners.length === 1 && winners[0] === human?.id) {
      setShowMuckPrompt(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [is_hand_over]);

  // ---------------------------------------------------------------------------
  // Seat geometry — every player gets a point on the table; pucks derive from
  // those points. Changing which point a puck sits on between hands makes it
  // slide across the felt (CSS transition on .puck).
  // ---------------------------------------------------------------------------
  const humanIdx = players.findIndex((p) => p.is_human);
  const orderedAi: Player[] =
    humanIdx >= 0
      ? [...players.slice(humanIdx + 1), ...players.slice(0, humanIdx)].filter(
          (p) => !p.is_human,
        )
      : players.filter((p) => !p.is_human);

  const aiPoints = aiSeats(orderedAi.length);

  const seatOf = new Map<string, Point>();
  if (human) seatOf.set(human.id, humanSeat());
  orderedAi.forEach((p, i) => seatOf.set(p.id, aiPoints[i]));

  const pucks: { role: "D" | "SB" | "BB"; className: string; playerId: string | null }[] = [
    { role: "D", className: "puck--d", playerId: dealer_id },
    { role: "SB", className: "puck--sb", playerId: small_blind_id },
    { role: "BB", className: "puck--bb", playerId: big_blind_id },
  ];

  return (
    <div>
      {/* Hand info bar */}
      <div style={styles.handInfo}>
        <span style={styles.handNum}>
          {hand_number === 0 ? "" : `Hand #${hand_number}`}
        </span>
      </div>

      <div className="table-viewport">
        <div className="table-wrap">
          <div className="table-felt" />

          {/* Center: street label + community cards + pot */}
          <div className="table-center">
            <div className="street-label">
              {is_hand_over ? "" : street.toUpperCase()}
            </div>
            <div className="community-cards">
              {community_cards.map((card, i) => {
                const isNew =
                  animRange !== null && i >= animRange.start && i <= animRange.end;
                const delay = isNew ? (i - animRange!.start) * 0.12 : 0;
                return (
                  <div
                    key={i}
                    className={`community-card-wrapper${
                      isNew ? " community-card-wrapper--dealing" : ""
                    }`}
                    style={isNew ? { animationDelay: `${delay}s` } : undefined}
                  >
                    <CardDisplay card={card} />
                  </div>
                );
              })}
            </div>
            {!is_hand_over && pot > 0 && (
              <div className="pot-chip">
                <span className="pot-chip__label">Pot</span>
                <span className="pot-chip__amount">{pot.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Dealer + blind pucks, resting on the felt */}
          {pucks.map(({ role, className, playerId }) => {
            if (!playerId) return null;
            const seat = seatOf.get(playerId);
            if (!seat) return null;
            const anchor = puckAnchor(seat, role);
            return (
              <div
                key={role}
                className={`puck ${className}`}
                style={
                  {
                    "--puck-x": `${anchor.xPct}%`,
                    "--puck-y": `${anchor.yPct}%`,
                  } as CSSProperties
                }
              >
                {role}
              </div>
            );
          })}

          {/* Human seat */}
          {human && (
            <PlayerSeat
              player={human}
              pos={humanSeat()}
              isCurrentActor={human.id === current_actor}
              isWinner={winners.includes(human.id)}
              isThinking={human.id === thinkingPlayerId}
              actionFlash={actionFlash?.playerId === human.id ? actionFlash : null}
              winnerAnimActive={winnerAnimActive}
              showMuckPrompt={showMuckPrompt && !muckChosen}
              muckChosen={muckChosen}
              onShow={() => setShowMuckPrompt(false)}
              onMuck={() => {
                setMuckChosen(true);
                setShowMuckPrompt(false);
              }}
            />
          )}

          {/* AI seats */}
          {orderedAi.map((player, idx) => (
            <PlayerSeat
              key={player.id}
              player={player}
              pos={aiPoints[idx]}
              isCurrentActor={player.id === current_actor}
              isWinner={winners.includes(player.id)}
              isThinking={player.id === thinkingPlayerId}
              actionFlash={actionFlash?.playerId === player.id ? actionFlash : null}
              winnerAnimActive={winnerAnimActive}
              showMuckPrompt={false}
              muckChosen={false}
              onShow={() => {}}
              onMuck={() => {}}
            />
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
  pos: Point;
  isCurrentActor: boolean;
  isWinner: boolean;
  isThinking: boolean;
  actionFlash: ActionFlash | null;
  winnerAnimActive: boolean;
  showMuckPrompt: boolean;
  muckChosen: boolean;
  onShow: () => void;
  onMuck: () => void;
}

function PlayerSeat({
  player,
  pos,
  isCurrentActor,
  isWinner,
  isThinking,
  actionFlash,
  winnerAnimActive,
  showMuckPrompt,
  muckChosen,
  onShow,
  onMuck,
}: PlayerSeatProps) {
  const flashClass = actionFlash ? `seat--flash-${actionFlash.action}` : "";

  const seatClasses = [
    "seat",
    flashClass || (isThinking ? "seat--thinking" : isCurrentActor ? "seat--acting" : ""),
    player.is_folded ? "seat--folded" : "",
    isWinner && !winnerAnimActive ? "seat--winner" : "",
    winnerAnimActive && isWinner ? "seat--winner-announced" : "",
    winnerAnimActive && !isWinner && !player.is_folded ? "seat--loser-dim" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const isCheckFlash = actionFlash?.action === "call" && actionFlash.amount === 0;
  const ACTION_LABELS: Record<string, string> = {
    fold: "Fold",
    call: "Call",
    raise: "Raise",
  };

  // Single status line under name/stack.
  let tag: string | null = null;
  if (player.is_folded) tag = "Folded";
  else if (player.is_allin) tag = "All-in";
  else if (isThinking) tag = "Thinking";
  else if (isCurrentActor) tag = "Acting";

  return (
    <div
      className={seatClasses}
      style={
        { "--seat-x": `${pos.xPct}%`, "--seat-y": `${pos.yPct}%` } as CSSProperties
      }
    >
      {winnerAnimActive && isWinner && <div className="winner-badge">Winner</div>}

      {showMuckPrompt && <ShowMuckPrompt onShow={onShow} onMuck={onMuck} />}

      {/* Hole cards sit above the plate */}
      <div className="seat-hole">
        {player.hole_cards.length > 0 ? (
          player.hole_cards.map((card, i) => (
            <CardDisplay
              key={i}
              card={card}
              mini
              className={muckChosen ? "card--muck" : undefined}
            />
          ))
        ) : (
          !player.is_human &&
          !player.is_folded && (
            <>
              <CardBack mini />
              <CardBack mini />
            </>
          )
        )}
      </div>

      <div className="seat-plate">
        {actionFlash && (
          <div className={`action-label action-label--${actionFlash.action}`}>
            {isCheckFlash ? "Check" : ACTION_LABELS[actionFlash.action]}
            {!isCheckFlash &&
              actionFlash.action !== "fold" &&
              actionFlash.amount > 0 && (
                <span className="action-label__amount"> {actionFlash.amount}</span>
              )}
          </div>
        )}

        <div className="seat-name">{player.name}</div>
        <div className="seat-stack">{player.stack.toLocaleString()}</div>
        {tag && <span className="seat-tag">{tag}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShowMuckPrompt
// ---------------------------------------------------------------------------

function ShowMuckPrompt({ onShow, onMuck }: { onShow: () => void; onMuck: () => void }) {
  return (
    <div className="show-muck-prompt">
      <div className="show-muck-prompt__title">Show cards?</div>
      <div className="show-muck-prompt__buttons">
        <button
          className="show-muck-prompt__btn show-muck-prompt__btn--show"
          onClick={onShow}
        >
          Show
        </button>
        <button
          className="show-muck-prompt__btn show-muck-prompt__btn--muck"
          onClick={onMuck}
        >
          Muck
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardDisplay — a single face-up card
// ---------------------------------------------------------------------------

function CardDisplay({
  card,
  mini,
  className,
}: {
  card: string;
  mini?: boolean;
  className?: string;
}) {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const suitSymbol: Record<string, string> = { h: "♥", d: "♦", s: "♠", c: "♣" };
  const isRed = suit === "h" || suit === "d";

  const classes = [
    "pcard",
    isRed ? "pcard--red" : "pcard--black",
    mini ? "pcard--mini" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className="pcard__rank">{rank}</div>
      <div className="pcard__suit">{suitSymbol[suit] ?? suit}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardBack — face-down placeholder
// ---------------------------------------------------------------------------

function CardBack({ mini }: { mini?: boolean }) {
  return <div className={`pcard pcard--back${mini ? " pcard--mini" : ""}`} />;
}

// ---------------------------------------------------------------------------
// Styles — only the hand-info bar; everything else is in index.css
// ---------------------------------------------------------------------------

const styles: Record<string, CSSProperties> = {
  handInfo: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "12px",
    fontWeight: 600,
    padding: "10px 8px 0",
  },
  handNum: {
    color: "var(--muted)",
    letterSpacing: "0.04em",
  },
};
