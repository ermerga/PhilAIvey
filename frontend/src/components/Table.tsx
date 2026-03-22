import type { GameState, Player } from "../types";

interface TableProps {
  gameState: GameState;
}

export function Table({ gameState }: TableProps) {
  const {
    players,
    community_cards,
    pot,
    street,
    current_actor,
    is_hand_over,
    winners,
    hand_number,
  } = gameState;

  const winnerNames = winners
    .map((id) => players.find((p) => p.id === id)?.name ?? id)
    .join(", ");

  return (
    <div style={styles.table}>
      {/* Hand info */}
      <div style={styles.handInfo}>
        <span>Hand #{hand_number}</span>
        <span style={styles.street}>{street.toUpperCase()}</span>
        <span>Pot: {pot} chips</span>
      </div>

      {/* Hand over banner */}
      {is_hand_over && (
        <div style={styles.handOverBanner}>
          {winners.length > 0
            ? `Winner: ${winnerNames}`
            : "Hand complete"}
        </div>
      )}

      {/* Players */}
      <div style={styles.players}>
        {players.map((player) => (
          <PlayerSeat
            key={player.id}
            player={player}
            isCurrentActor={player.id === current_actor}
            isWinner={winners.includes(player.id)}
          />
        ))}
      </div>

      {/* Community cards */}
      <div style={styles.boardSection}>
        <div style={styles.boardLabel}>Board</div>
        <div style={styles.cardRow}>
          {community_cards.length === 0 ? (
            <span style={styles.noCards}>No cards dealt yet</span>
          ) : (
            community_cards.map((card, i) => (
              <CardDisplay key={i} card={card} />
            ))
          )}
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
}

function PlayerSeat({ player, isCurrentActor, isWinner }: PlayerSeatProps) {
  const seatStyle = {
    ...styles.seat,
    ...(player.is_human ? styles.humanSeat : {}),
    ...(isCurrentActor ? styles.activeSeat : {}),
    ...(player.is_folded ? styles.foldedSeat : {}),
    ...(isWinner ? styles.winnerSeat : {}),
  };

  return (
    <div style={seatStyle}>
      {/* Name + badge */}
      <div style={styles.seatHeader}>
        <span style={styles.playerName}>
          {player.name}
          {player.is_human && " (You)"}
        </span>
        {isCurrentActor && <span style={styles.actingBadge}>Acting</span>}
        {player.is_folded && <span style={styles.foldedBadge}>Folded</span>}
        {player.is_allin && <span style={styles.allinBadge}>All-in</span>}
        {isWinner && <span style={styles.winnerBadge}>Winner</span>}
      </div>

      {/* Stack */}
      <div style={styles.stack}>{player.stack} chips</div>

      {/* Play style (AI only) */}
      {!player.is_human && player.play_style && (
        <div style={styles.playStyle}>{player.play_style}</div>
      )}

      {/* Hole cards */}
      <div style={styles.cardRow}>
        {player.hole_cards.length > 0 ? (
          player.hole_cards.map((card, i) => (
            <CardDisplay key={i} card={card} />
          ))
        ) : (
          // Show face-down placeholders for AI players
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
    <div style={{ ...styles.card, color: isRed ? "#c0392b" : "#111" }}>
      <div style={styles.cardRank}>{rank}</div>
      <div style={styles.cardSuit}>{suitSymbol[suit] ?? suit}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardBack — face-down card placeholder for AI hands
// ---------------------------------------------------------------------------

function CardBack() {
  return <div style={{ ...styles.card, ...styles.cardBack }}>🂠</div>;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  table: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    padding: "24px",
    backgroundColor: "#0f3d0f",
    borderRadius: "16px",
    border: "4px solid #5a3e1b",
    minHeight: "400px",
  },
  handInfo: {
    display: "flex",
    justifyContent: "space-between",
    color: "#ccc",
    fontSize: "14px",
    fontWeight: "bold",
  },
  street: {
    color: "#f0c040",
    letterSpacing: "2px",
  },
  handOverBanner: {
    textAlign: "center",
    padding: "10px",
    backgroundColor: "#78350f",
    color: "#fde68a",
    borderRadius: "8px",
    fontWeight: "bold",
    fontSize: "16px",
  },
  players: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    justifyContent: "center",
  },
  seat: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "12px",
    backgroundColor: "#1a1a2e",
    borderRadius: "10px",
    border: "2px solid #2a2a4e",
    minWidth: "140px",
    opacity: 1,
    transition: "opacity 0.2s",
  },
  humanSeat: {
    border: "2px solid #3b82f6",
  },
  activeSeat: {
    border: "2px solid #f0c040",
    boxShadow: "0 0 12px #f0c04066",
  },
  foldedSeat: {
    opacity: 0.4,
  },
  winnerSeat: {
    border: "2px solid #22c55e",
    boxShadow: "0 0 12px #22c55e66",
  },
  seatHeader: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
  playerName: {
    color: "#e2e8f0",
    fontWeight: "bold",
    fontSize: "13px",
  },
  actingBadge: {
    backgroundColor: "#f0c040",
    color: "#111",
    fontSize: "10px",
    padding: "1px 5px",
    borderRadius: "4px",
    fontWeight: "bold",
  },
  foldedBadge: {
    backgroundColor: "#7f1d1d",
    color: "#fca5a5",
    fontSize: "10px",
    padding: "1px 5px",
    borderRadius: "4px",
  },
  allinBadge: {
    backgroundColor: "#7c3aed",
    color: "#ede9fe",
    fontSize: "10px",
    padding: "1px 5px",
    borderRadius: "4px",
  },
  winnerBadge: {
    backgroundColor: "#14532d",
    color: "#86efac",
    fontSize: "10px",
    padding: "1px 5px",
    borderRadius: "4px",
  },
  stack: {
    color: "#94a3b8",
    fontSize: "12px",
  },
  playStyle: {
    color: "#64748b",
    fontSize: "11px",
    fontStyle: "italic",
  },
  boardSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
  },
  boardLabel: {
    color: "#94a3b8",
    fontSize: "12px",
    letterSpacing: "1px",
    textTransform: "uppercase",
  },
  cardRow: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },
  noCards: {
    color: "#475569",
    fontSize: "12px",
    fontStyle: "italic",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "36px",
    height: "52px",
    backgroundColor: "#fff",
    borderRadius: "5px",
    border: "1px solid #ccc",
    fontSize: "13px",
    fontWeight: "bold",
    boxShadow: "1px 1px 3px rgba(0,0,0,0.3)",
    userSelect: "none",
  },
  cardRank: {
    lineHeight: 1,
  },
  cardSuit: {
    lineHeight: 1,
    fontSize: "15px",
  },
  cardBack: {
    backgroundColor: "#1e3a8a",
    color: "#93c5fd",
    fontSize: "20px",
    border: "1px solid #3b82f6",
  },
};
