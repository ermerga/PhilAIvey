import type { GameState, Player } from "../types";

interface TableProps {
  gameState: GameState;
  thinkingPlayerId: string | null;
  onStartRound: () => void;
}

export function Table({ gameState, thinkingPlayerId, onStartRound }: TableProps) {
  const {
    players,
    community_cards,
    pot,
    street,
    current_actor,
    is_hand_over,
    winners,
    hand_number,
    small_blind,
    small_blind_id,
    big_blind_id,
    dealer_id,
  } = gameState;

  const human = players.find((p) => p.is_human) ?? null;
  const aiPlayers = players.filter((p) => !p.is_human);

  function playerName(id: string | null): string {
    if (!id) return "—";
    return players.find((p) => p.id === id)?.name ?? id;
  }

  const winnerNames = winners
    .map((id) => playerName(id))
    .join(", ");

  return (
    <div>
      {/* Hand info bar */}
      <div style={styles.handInfo}>
        <span style={styles.handNum}>
          {hand_number === 0 ? "" : `Hand #${hand_number}`}
        </span>
      </div>

      {/* Start Round overlay — full-screen modal between hands */}
      {is_hand_over && (
        <div className="start-overlay">
          <div className="start-overlay__heading">
            <p className="start-overlay__title">
              {hand_number === 0 ? "Ready to play?" : `Hand ${hand_number} complete`}
            </p>
            {winners.length > 0 && (
              <p className="start-overlay__sub">{winnerNames} wins the hand</p>
            )}
            {hand_number === 0 && (
              <p className="start-overlay__sub">Blinds posted — ready to deal</p>
            )}
          </div>

          {(small_blind_id || big_blind_id || dealer_id) && (
            <div className="start-overlay__info">
              <div className="start-overlay__card">
                <div className="start-overlay__card-label">Small Blind</div>
                <div className="start-overlay__card-player">{playerName(small_blind_id)}</div>
                <div className="start-overlay__card-amount">{small_blind} chips</div>
              </div>
              <div className="start-overlay__card">
                <div className="start-overlay__card-label">Big Blind</div>
                <div className="start-overlay__card-player">{playerName(big_blind_id)}</div>
                <div className="start-overlay__card-amount">{small_blind * 2} chips</div>
              </div>
              <div className="start-overlay__card">
                <div className="start-overlay__card-label">Dealer</div>
                <div className="start-overlay__card-player">{playerName(dealer_id)}</div>
                <div className="start-overlay__card-amount">Button</div>
              </div>
            </div>
          )}

          <button className="start-overlay__btn" onClick={onStartRound}>
            Start Round
          </button>
        </div>
      )}

      {/* Oval table — always rendered (seats show mid-hand state) */}
      <div className="table-viewport">
        <div className="table-wrap">
          {/* Green felt surface */}
          <div className="table-felt" />

          {/* Community cards + pot — centered on the felt */}
          <div className="table-center">
            <div style={styles.streetLabel}>
              {is_hand_over ? "" : street.toUpperCase()}
            </div>
            <div style={styles.communityCards}>
              {community_cards.map((card, i) => (
                <CardDisplay key={i} card={card} />
              ))}
            </div>
            {!is_hand_over && pot > 0 && (
              <div style={styles.potChip}>
                <span style={styles.potLabel}>Pot</span>
                {pot} chips
              </div>
            )}
          </div>

          {/* Human seat — bottom center */}
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
              />
            </div>
          )}

          {/* AI seats — top left then top right */}
          {aiPlayers.map((player, idx) => (
            <div
              key={player.id}
              className={`seat-pos seat-pos--p${idx + 1}`}
            >
              <PlayerSeat
                player={player}
                isCurrentActor={player.id === current_actor}
                isWinner={winners.includes(player.id)}
                isThinking={player.id === thinkingPlayerId}
                isDealer={player.id === dealer_id}
                isSB={player.id === small_blind_id}
                isBB={player.id === big_blind_id}
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
}

function PlayerSeat({
  player,
  isCurrentActor,
  isWinner,
  isThinking,
  isDealer,
  isSB,
  isBB,
}: PlayerSeatProps) {
  const cardClasses = [
    "seat-card",
    isThinking ? "seat-card--purple" : isCurrentActor ? "seat-card--gold" : "",
    player.is_folded ? "seat-card--folded" : "",
    isWinner ? "seat-card--winner" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClasses}>
      {/* Dealer button — white circle at top-right of card */}
      {isDealer && <div className="dealer-btn">D</div>}

      <div style={styles.seatName}>
        {player.name}
      </div>
      <div style={styles.seatStack}>{player.stack} chips</div>

      {/* Position + status badges */}
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
          player.hole_cards.map((card, i) => <CardDisplay key={i} card={card} />)
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
// CardDisplay — a single face-up card
// ---------------------------------------------------------------------------

function CardDisplay({ card }: { card: string }) {
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
    <div style={{ ...styles.card, color: isRed ? "#dc2626" : "#111" }}>
      <div style={styles.cardRank}>{rank}</div>
      <div style={styles.cardSuit}>{suitSymbol[suit] ?? suit}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardBack — face-down card placeholder for AI hands
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
  streetBadge: {
    color: "#f0c040",
    letterSpacing: "2px",
  },
  pot: {
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
