import { useState, useCallback } from "react";
import type { GameState } from "./types";
import { newGame, submitAction, startHand } from "./api";
import { useGameSocket } from "./hooks/useGameSocket";
import { Table } from "./components/Table";
import { ActionBar } from "./components/ActionBar";
import { PhilPanel } from "./components/PhilPanel";

type SkillLevel = "beginner" | "intermediate" | "advanced";

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("beginner");
  const [numOpponents, setNumOpponents] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [thinkingPlayerId, setThinkingPlayerId] = useState<string | null>(null);
  const [philText, setPhilText] = useState("");
  const [isPhilStreaming, setIsPhilStreaming] = useState(false);

  // useCallback keeps the function reference stable so the WebSocket hook
  // doesn't reconnect every time App re-renders
  const handleSocketUpdate = useCallback((state: GameState) => {
    setThinkingPlayerId(null); // clear thinking state when a new game_state arrives
    setGameState(state);
  }, []);

  const handleAiThinking = useCallback((playerId: string) => {
    setThinkingPlayerId(playerId);
  }, []);

  const handlePhilChunk = useCallback((content: string) => {
    setIsPhilStreaming(true);
    setPhilText((prev) => prev + content);
  }, []);

  const handlePhilDone = useCallback(() => {
    setIsPhilStreaming(false);
  }, []);

  useGameSocket(sessionId, handleSocketUpdate, handleAiThinking, handlePhilChunk, handlePhilDone);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleStartGame() {
    setError(null);
    setLoading(true);
    setPhilText("");
    setIsPhilStreaming(false);
    try {
      const res = await newGame(numOpponents, skillLevel);
      setSessionId(res.session_id);
      setGameState(res.game_state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start game.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(
    action: "fold" | "call" | "raise",
    amount: number
  ) {
    if (!sessionId) return;
    setError(null);
    try {
      const updated = await submitAction(sessionId, action, amount, skillLevel);
      setGameState(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    }
  }

  async function handleNextHand() {
    if (!sessionId) return;
    setError(null);
    setPhilText("");
    setIsPhilStreaming(false);
    try {
      const updated = await startHand(sessionId, skillLevel);
      setGameState(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start next hand.");
    }
  }

  // ---------------------------------------------------------------------------
  // Lobby screen — shown before a game starts
  // ---------------------------------------------------------------------------

  if (!sessionId || !gameState) {
    return (
      <div style={styles.page}>
        <div style={styles.lobby}>
          <h1 style={styles.title}>PhilAIvey</h1>
          <p style={styles.subtitle}>Texas Hold'em AI Poker Tutor</p>

          <div style={styles.field}>
            <label style={styles.label}>Skill Level</label>
            <select
              style={styles.select}
              value={skillLevel}
              onChange={(e) => setSkillLevel(e.target.value as SkillLevel)}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              Opponents: {numOpponents}
            </label>
            <input
              type="range"
              min={1}
              max={5}
              value={numOpponents}
              onChange={(e) => setNumOpponents(Number(e.target.value))}
              style={styles.slider}
            />
            <div style={styles.sliderLabels}>
              <span>1</span><span>5</span>
            </div>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button
            style={styles.startButton}
            onClick={handleStartGame}
            disabled={loading}
          >
            {loading ? "Starting..." : "Start Game"}
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Game screen
  // ---------------------------------------------------------------------------

  const isMyTurn = gameState.current_actor === "human";

  return (
    <div style={styles.page}>
      <style>{`@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
      <div style={styles.game}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.headerTitle}>PhilAIvey</h2>
          <span style={styles.skillBadge}>{skillLevel}</span>
          <button
            style={styles.newGameBtn}
            onClick={() => {
              setSessionId(null);
              setGameState(null);
            }}
          >
            New Game
          </button>
        </div>

        {/* Error banner */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Poker table */}
        <Table gameState={gameState} thinkingPlayerId={thinkingPlayerId} />

        {/* Next hand button — shown after a hand ends */}
        {gameState.is_hand_over && (
          <button style={styles.nextHandBtn} onClick={handleNextHand}>
            Deal Next Hand
          </button>
        )}

        {/* Action controls — shown while hand is in progress */}
        {!gameState.is_hand_over && (
          <ActionBar
            validActions={gameState.valid_actions}
            isMyTurn={isMyTurn}
            onAction={handleAction}
          />
        )}

        {/* Phil Ivey coaching panel */}
        <PhilPanel
          sessionId={sessionId}
          skillLevel={skillLevel}
          philText={philText}
          isStreaming={isPhilStreaming}
          isMyTurn={isMyTurn}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#0d0d1a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    color: "#e2e8f0",
    padding: "16px",
  },
  lobby: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    padding: "40px",
    backgroundColor: "#1a1a2e",
    borderRadius: "16px",
    border: "2px solid #2a2a4e",
    width: "100%",
    maxWidth: "400px",
  },
  title: {
    margin: 0,
    fontSize: "36px",
    fontWeight: "bold",
    color: "#f0c040",
    textAlign: "center",
  },
  subtitle: {
    margin: 0,
    textAlign: "center",
    color: "#94a3b8",
    fontSize: "14px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: "14px",
    color: "#94a3b8",
  },
  select: {
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #2a2a4e",
    backgroundColor: "#0d0d1a",
    color: "#e2e8f0",
    fontSize: "15px",
  },
  slider: {
    cursor: "pointer",
  },
  sliderLabels: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "12px",
    color: "#64748b",
  },
  startButton: {
    padding: "14px",
    fontSize: "16px",
    fontWeight: "bold",
    backgroundColor: "#f0c040",
    color: "#111",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    letterSpacing: "0.5px",
  },
  game: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    width: "100%",
    maxWidth: "900px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  headerTitle: {
    margin: 0,
    color: "#f0c040",
    fontSize: "22px",
  },
  skillBadge: {
    backgroundColor: "#1e3a5f",
    color: "#93c5fd",
    padding: "2px 10px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "bold",
    textTransform: "capitalize",
  },
  newGameBtn: {
    marginLeft: "auto",
    padding: "6px 14px",
    backgroundColor: "transparent",
    border: "1px solid #2a2a4e",
    color: "#94a3b8",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
  },
  error: {
    padding: "10px 14px",
    backgroundColor: "#7f1d1d",
    color: "#fca5a5",
    borderRadius: "6px",
    fontSize: "13px",
  },
  nextHandBtn: {
    padding: "14px",
    fontSize: "15px",
    fontWeight: "bold",
    backgroundColor: "#14532d",
    color: "#86efac",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    alignSelf: "center",
    width: "200px",
  },
};
