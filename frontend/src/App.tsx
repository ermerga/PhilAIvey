import { useState, useCallback, useEffect } from "react";
import type { ActionFlash, ChatMessage, GameState } from "./types";
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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [actionFlash, setActionFlash] = useState<ActionFlash | null>(null);

  // useCallback keeps the function reference stable so the WebSocket hook
  // doesn't reconnect every time App re-renders
  const handleSocketUpdate = useCallback((state: GameState) => {
    setThinkingPlayerId(null); // clear thinking state when a new game_state arrives
    setGameState(state);
  }, []);

  const handleAiThinking = useCallback((playerId: string) => {
    setThinkingPlayerId(playerId);
  }, []);

  const handlePlayerActed = useCallback((flash: ActionFlash) => {
    setActionFlash(flash);
    setTimeout(() => setActionFlash(null), 900);
  }, []);

  const handlePhilChunk = useCallback((content: string) => {
    setChatMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "phil" && last.isStreaming) {
        return [...prev.slice(0, -1), { ...last, content: last.content + content }];
      }
      return [...prev, { role: "phil", content, isStreaming: true }];
    });
  }, []);

  const handlePhilDone = useCallback(() => {
    setChatMessages((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      if (last.role === "phil" && last.isStreaming) {
        return [...prev.slice(0, -1), { ...last, isStreaming: false }];
      }
      return prev;
    });
  }, []);

  const handleUserChatMessage = useCallback((msg: string) => {
    setChatMessages((prev) => [...prev, { role: "user", content: msg }]);
  }, []);

  useGameSocket(sessionId, handleSocketUpdate, handleAiThinking, handlePlayerActed, handlePhilChunk, handlePhilDone);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleStartGame() {
    setError(null);
    setLoading(true);
    setChatMessages([]);
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
    setChatMessages([]);
    try {
      const updated = await submitAction(sessionId, action, amount, skillLevel);
      setGameState(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    }
  }

  // Auto-start the next hand when one ends.
  // hand_number=0: game just created, deal immediately after a short settle delay.
  // hand_number>0: let the winner animation play (3.5s) before starting new hand.
  useEffect(() => {
    if (!gameState?.is_hand_over || !sessionId) return;
    const delay = gameState.hand_number === 0 ? 1000 : 3500;
    const capturedSessionId = sessionId;
    const capturedSkillLevel = skillLevel;
    const timer = setTimeout(async () => {
      setError(null);
      setChatMessages([]);
      setGameState((prev) => (prev ? { ...prev, is_hand_over: false } : prev));
      try {
        const updated = await startHand(capturedSessionId, capturedSkillLevel);
        setGameState(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start next hand.");
      }
    }, delay);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.is_hand_over, gameState?.hand_number, sessionId]);

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
    <div style={styles.gamePage}>
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

        {/* Poker table — flex:1 so it fills remaining space above the HUD */}
        <div style={styles.tableSection}>
          <Table
            gameState={gameState}
            thinkingPlayerId={thinkingPlayerId}
            actionFlash={actionFlash}
          />
        </div>

        {/* HUD zone — Phil (left) + ActionBar (right), visible during active play */}
        {!gameState.is_hand_over && (
          <div style={styles.hudZone}>
            <div style={styles.hudPhil}>
              <PhilPanel
                sessionId={sessionId}
                skillLevel={skillLevel}
                messages={chatMessages}
                isMyTurn={isMyTurn}
                onUserMessage={handleUserChatMessage}
              />
            </div>
            <div style={styles.hudActions}>
              <ActionBar
                validActions={gameState.valid_actions}
                isMyTurn={isMyTurn}
                onAction={handleAction}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  /* Lobby page — centered */
  page: {
    minHeight: "100svh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text)",
    padding: "16px",
  },
  /* Game page — fixed to full viewport, escapes #root width constraints */
  gamePage: {
    position: "fixed",
    inset: 0,
    overflow: "hidden",
    display: "flex",
    justifyContent: "center",
    color: "var(--text)",
  },
  lobby: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    padding: "40px",
    background: "linear-gradient(180deg, var(--panel-hi), var(--panel))",
    borderRadius: "var(--r-lg)",
    border: "1px solid var(--line)",
    boxShadow: "0 40px 80px -30px rgba(0,0,0,0.8)",
    width: "100%",
    maxWidth: "400px",
  },
  title: {
    margin: 0,
    fontFamily: "var(--f-display)",
    fontSize: "40px",
    fontWeight: 500,
    letterSpacing: "-0.01em",
    color: "var(--text)",
    textAlign: "center",
  },
  subtitle: {
    margin: 0,
    textAlign: "center",
    color: "var(--muted)",
    fontSize: "14px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: "13px",
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  select: {
    padding: "10px",
    borderRadius: "var(--r-sm)",
    border: "1px solid var(--line)",
    background: "var(--room)",
    color: "var(--text)",
    fontSize: "15px",
    fontFamily: "var(--f-body)",
  },
  slider: {
    cursor: "pointer",
    accentColor: "var(--brass)",
  },
  sliderLabels: {
    display: "flex",
    justifyContent: "space-between",
    fontFamily: "var(--f-num)",
    fontSize: "12px",
    color: "var(--muted)",
  },
  startButton: {
    padding: "14px",
    fontSize: "16px",
    fontWeight: 600,
    background: "linear-gradient(180deg, #D8A552, var(--brass))",
    color: "#21160A",
    border: "none",
    borderRadius: "var(--r-md)",
    cursor: "pointer",
    letterSpacing: "0.02em",
  },
  game: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  tableSection: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    zIndex: 5,
    overflow: "visible",
  },
  hudZone: {
    height: "220px",
    flexShrink: 0,
    display: "flex",
    borderTop: "1px solid var(--brass-dim)",
    background: "linear-gradient(180deg, var(--walnut-hi), var(--walnut-lo))",
    position: "relative",
    zIndex: 1,
  },
  hudPhil: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    borderRight: "1px solid var(--line)",
  },
  hudActions: {
    width: "340px",
    flexShrink: 0,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 18px",
  },
  headerTitle: {
    margin: 0,
    fontFamily: "var(--f-display)",
    fontWeight: 500,
    color: "var(--text)",
    fontSize: "20px",
    letterSpacing: "-0.01em",
  },
  skillBadge: {
    background: "rgba(200,150,62,0.14)",
    color: "var(--brass)",
    padding: "3px 10px",
    borderRadius: "999px",
    fontSize: "10px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    border: "1px solid rgba(200,150,62,0.35)",
  },
  newGameBtn: {
    marginLeft: "auto",
    padding: "9px 16px",
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--muted)",
    borderRadius: "var(--r-sm)",
    cursor: "pointer",
    fontSize: "13px",
    fontFamily: "var(--f-body)",
  },
  error: {
    padding: "10px 14px",
    background: "rgba(178,58,52,0.16)",
    color: "#E39A94",
    border: "1px solid rgba(178,58,52,0.4)",
    borderRadius: "var(--r-sm)",
    fontSize: "13px",
  },
};
