import { useState, useEffect, useRef } from "react";
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

  const [raiseAmount, setRaiseAmount] = useState(raiseMin > 0 ? raiseMin : 0);
  // Ref always holds the latest raise amount — prevents stale-closure bugs in the
  // Raise button's onClick when React batches renders between slider move and click.
  const raiseRef = useRef(raiseMin > 0 ? raiseMin : 0);

  // Reset to minimum whenever a new valid action set arrives (new hand / new street).
  useEffect(() => {
    if (raiseMin > 0) {
      raiseRef.current = raiseMin;
      setRaiseAmount(raiseMin);
    }
  }, [raiseMin, raiseMax]);

  const clamped = Math.min(Math.max(raiseAmount, raiseMin || 0), raiseMax || 0);
  // Keep ref always current with the rendered value.
  raiseRef.current = clamped;

  function setAmount(v: number) {
    const safe = Math.min(Math.max(v, raiseMin), raiseMax);
    raiseRef.current = safe;
    setRaiseAmount(safe);
  }

  function submitRaise() {
    onAction("raise", raiseRef.current);
  }

  const callAmount =
    typeof callAction?.amount === "number" ? callAction.amount : 0;
  const isCheck = callAmount === 0;
  const isCallAllin = !isCheck && raiseMin < 0;

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
            style={{ ...styles.btn, ...styles.call, ...(isCallAllin ? styles.callAllin : {}) }}
            onClick={() => onAction("call", callAmount)}
          >
            {isCheck ? "Check" : isCallAllin ? `All-In  ${callAmount}` : `Call  ${callAmount}`}
          </button>
        )}
      </div>

      {/* Row 2: Raise controls — hidden when raise is unavailable */}
      {raiseAction && raiseMax > 0 && raiseMin > 0 && (
        <div style={styles.raiseSection}>
          {/* Quick presets — submit immediately */}
          <div style={styles.presets}>
            <button style={styles.preset} onClick={() => { setAmount(raiseMin); onAction("raise", raiseMin); }}>
              Min
            </button>
            {raiseMax > raiseMin * 2 && (
              <button style={styles.preset} onClick={() => {
                const half = Math.round((raiseMin + raiseMax) / 2);
                setAmount(half);
                onAction("raise", half);
              }}>
                ½
              </button>
            )}
            <button style={styles.preset} onClick={() => { setAmount(raiseMax); onAction("raise", raiseMax); }}>
              All-In
            </button>
          </div>

          {/* Slider row */}
          <div style={styles.sliderRow}>
            <input
              type="range"
              min={raiseMin}
              max={raiseMax}
              step={1}
              value={clamped}
              onChange={(e) => setAmount(Number(e.target.value))}
              style={styles.slider}
            />
            {/* Editable number input — always shows exact amount, synced with slider */}
            <input
              type="number"
              min={raiseMin}
              max={raiseMax}
              value={clamped}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!isNaN(v)) setAmount(v);
              }}
              style={styles.amountInput}
            />
          </div>

          {/* Raise submit button */}
          <button
            style={{ ...styles.btn, ...styles.raise }}
            onClick={submitRaise}
          >
            Raise <span style={styles.raiseAmt}>{clamped}</span>
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
    gap: "8px",
    padding: "12px 14px 14px",
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
    padding: "12px 20px",
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
  callAllin: {
    backgroundColor: "#7c3a00",
    color: "#fed7aa",
    letterSpacing: "0.6px",
  },
  raise: {
    backgroundColor: "#14532d",
    color: "#fff",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    fontSize: "15px",
  },
  raiseAmt: {
    color: "#86efac",
    fontWeight: 900,
    fontSize: "16px",
  },
  raiseSection: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    paddingTop: "6px",
    borderTop: "1px solid #2a2a4e",
  },
  presets: {
    display: "flex",
    gap: "6px",
  },
  preset: {
    flex: 1,
    padding: "5px 0",
    fontSize: "12px",
    fontWeight: "bold",
    backgroundColor: "transparent",
    border: "1px solid #2a2a4e",
    borderRadius: "6px",
    color: "#94a3b8",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  sliderRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  slider: {
    flex: 1,
    cursor: "pointer",
    accentColor: "#14532d",
    minWidth: 0,
  },
  amountInput: {
    width: "64px",
    flexShrink: 0,
    padding: "4px 6px",
    fontSize: "13px",
    fontWeight: "bold",
    backgroundColor: "#1a1a2e",
    border: "1px solid #3a3a5e",
    borderRadius: "6px",
    color: "#86efac",
    textAlign: "center",
    outline: "none",
  },
};
