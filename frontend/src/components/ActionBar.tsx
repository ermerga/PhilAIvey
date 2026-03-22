import { useState } from "react";
import type { ValidAction } from "../types";

interface ActionBarProps {
  validActions: ValidAction[];
  isMyTurn: boolean;
  onAction: (action: "fold" | "call" | "raise", amount: number) => void;
}

export function ActionBar({ validActions, isMyTurn, onAction }: ActionBarProps) {
  const callAction = validActions.find((a) => a.action === "call");
  const raiseAction = validActions.find((a) => a.action === "raise");

  // Raise amount defaults to the minimum raise
  const raiseMin =
    raiseAction && typeof raiseAction.amount === "object"
      ? raiseAction.amount.min
      : 0;
  const raiseMax =
    raiseAction && typeof raiseAction.amount === "object"
      ? raiseAction.amount.max
      : 0;

  const [raiseAmount, setRaiseAmount] = useState(raiseMin);

  // Keep raiseAmount in bounds if valid_actions changes between streets
  const clampedRaise = Math.min(Math.max(raiseAmount, raiseMin), raiseMax);

  if (!isMyTurn) {
    return (
      <div style={styles.bar}>
        <span style={styles.waiting}>Waiting for opponents...</span>
      </div>
    );
  }

  return (
    <div style={styles.bar}>
      {/* Fold */}
      <button
        style={{ ...styles.button, ...styles.fold }}
        onClick={() => onAction("fold", 0)}
      >
        Fold
      </button>

      {/* Call */}
      {callAction && (
        <button
          style={{ ...styles.button, ...styles.call }}
          onClick={() =>
            onAction("call", typeof callAction.amount === "number" ? callAction.amount : 0)
          }
        >
          {typeof callAction.amount === "number" && callAction.amount === 0
            ? "Check"
            : `Call ${typeof callAction.amount === "number" ? callAction.amount : 0}`}
        </button>
      )}

      {/* Raise */}
      {raiseAction && raiseMax > 0 && (
        <div style={styles.raiseGroup}>
          <button
            style={{ ...styles.button, ...styles.raise }}
            onClick={() => onAction("raise", clampedRaise)}
          >
            Raise {clampedRaise}
          </button>
          <input
            type="range"
            min={raiseMin}
            max={raiseMax}
            value={clampedRaise}
            onChange={(e) => setRaiseAmount(Number(e.target.value))}
            style={styles.slider}
          />
          <span style={styles.raiseLabel}>
            {raiseMin} – {raiseMax}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "16px 24px",
    backgroundColor: "#1a1a2e",
    borderTop: "2px solid #2a2a4e",
    flexWrap: "wrap",
  },
  waiting: {
    color: "#888",
    fontStyle: "italic",
    fontSize: "14px",
  },
  button: {
    padding: "10px 20px",
    fontSize: "15px",
    fontWeight: "bold",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    letterSpacing: "0.5px",
  },
  fold: {
    backgroundColor: "#7f1d1d",
    color: "#fff",
  },
  call: {
    backgroundColor: "#1e3a5f",
    color: "#fff",
  },
  raise: {
    backgroundColor: "#14532d",
    color: "#fff",
  },
  raiseGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  slider: {
    width: "120px",
    cursor: "pointer",
  },
  raiseLabel: {
    color: "#888",
    fontSize: "12px",
    whiteSpace: "nowrap",
  },
};
