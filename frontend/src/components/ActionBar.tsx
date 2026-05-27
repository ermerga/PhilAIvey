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

  const raiseMin =
    raiseAction && typeof raiseAction.amount === "object"
      ? raiseAction.amount.min
      : 0;
  const raiseMax =
    raiseAction && typeof raiseAction.amount === "object"
      ? raiseAction.amount.max
      : 0;

  const [raiseAmount, setRaiseAmount] = useState(raiseMin);
  const clampedRaise = Math.min(Math.max(raiseAmount, raiseMin), raiseMax);

  const callAmount =
    typeof callAction?.amount === "number" ? callAction.amount : 0;
  const isCheck = callAmount === 0;

  if (!isMyTurn) {
    return (
      <div style={styles.bar}>
        <span style={styles.waiting}>Waiting for opponents...</span>
      </div>
    );
  }

  return (
    <div style={styles.bar}>
      {/* Row 1: Fold + Call/Check */}
      <div style={styles.row}>
        <button
          style={{ ...styles.btn, ...styles.fold }}
          onClick={() => onAction("fold", 0)}
        >
          Fold
        </button>

        {callAction && (
          <button
            style={{ ...styles.btn, ...styles.call }}
            onClick={() => onAction("call", callAmount)}
          >
            {isCheck ? "Check" : `Call ${callAmount}`}
          </button>
        )}
      </div>

      {/* Row 2: Raise controls — only shown when a raise is valid */}
      {raiseAction && raiseMax > 0 && (
        <div style={styles.raiseRow}>
          {/* Preset shortcut buttons */}
          <div style={styles.presets}>
            <button
              style={styles.preset}
              onClick={() => { setRaiseAmount(raiseMin); onAction("raise", raiseMin); }}
            >
              Min
            </button>
            {raiseMax > raiseMin * 2 && (
              <button
                style={styles.preset}
                onClick={() => {
                  const half = Math.round((raiseMin + raiseMax) / 2);
                  setRaiseAmount(half);
                  onAction("raise", half);
                }}
              >
                ½
              </button>
            )}
            <button
              style={styles.preset}
              onClick={() => { setRaiseAmount(raiseMax); onAction("raise", raiseMax); }}
            >
              All-In
            </button>
          </div>

          {/* Slider + amount display + raise button */}
          <div style={styles.sliderGroup}>
            <span style={styles.rangeLabel}>{raiseMin}</span>
            <input
              type="range"
              min={raiseMin}
              max={raiseMax}
              value={clampedRaise}
              onChange={(e) => setRaiseAmount(Number(e.target.value))}
              style={styles.slider}
            />
            <span style={styles.rangeLabel}>{raiseMax}</span>
          </div>

          <button
            style={{ ...styles.btn, ...styles.raise }}
            onClick={() => onAction("raise", clampedRaise)}
          >
            Raise{" "}
            <span style={styles.raiseAmt}>{clampedRaise}</span>
          </button>
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
    flexDirection: "column",
    gap: "10px",
    padding: "14px 16px 16px",
    height: "100%",
    justifyContent: "center",
  },
  waiting: {
    color: "#888",
    fontStyle: "italic",
    fontSize: "14px",
    textAlign: "center",
    padding: "8px 0",
  },
  row: {
    display: "flex",
    gap: "10px",
  },
  btn: {
    padding: "14px 28px",
    fontSize: "15px",
    fontWeight: "bold",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    letterSpacing: "0.4px",
    whiteSpace: "nowrap",
  },
  fold: {
    backgroundColor: "#7f1d1d",
    color: "#fff",
  },
  call: {
    backgroundColor: "#1e3a5f",
    color: "#fff",
    flex: 1,
  },
  raise: {
    backgroundColor: "#14532d",
    color: "#fff",
    minWidth: "120px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    padding: "12px 20px",
    fontSize: "14px",
  },
  raiseAmt: {
    color: "#86efac",
    fontWeight: 900,
    fontSize: "15px",
  },
  raiseRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "8px 0 0",
    borderTop: "1px solid #2a2a4e",
  },
  presets: {
    display: "flex",
    gap: "6px",
    flexShrink: 0,
  },
  preset: {
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: "bold",
    backgroundColor: "transparent",
    border: "1px solid #2a2a4e",
    borderRadius: "6px",
    color: "#94a3b8",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  sliderGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flex: 1,
  },
  slider: {
    flex: 1,
    cursor: "pointer",
    accentColor: "#14532d",
  },
  rangeLabel: {
    color: "#64748b",
    fontSize: "11px",
    whiteSpace: "nowrap",
    minWidth: "30px",
    textAlign: "center",
  },
};
