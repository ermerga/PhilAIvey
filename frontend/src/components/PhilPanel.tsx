import { useState, useRef, useEffect } from "react";

const API_BASE = "/api";

interface PhilPanelProps {
  sessionId: string;
  skillLevel: string;
  philText: string;
  isStreaming: boolean;
  isMyTurn: boolean;
}

export function PhilPanel({
  sessionId,
  skillLevel,
  philText,
  isStreaming,
  isMyTurn,
}: PhilPanelProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messageEndRef = useRef<HTMLDivElement>(null);

  // Scroll to the bottom whenever Phil's text grows
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [philText]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending || isStreaming) return;

    setSending(true);
    setInput("");

    try {
      await fetch(`${API_BASE}/game/${sessionId}/tutor/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, skill_level: skillLevel }),
      });
      // Phil's response streams back over WebSocket — nothing to do with the HTTP response
    } catch {
      // Silently ignore — Phil will recover on next interaction
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSend();
  }

  const inputDisabled = !isMyTurn || sending || isStreaming;

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.avatar}>PI</div>
        <div>
          <div style={styles.name}>Phil Ivey</div>
          <div style={styles.subtitle}>Your Coach</div>
        </div>
        {isStreaming && <div style={styles.streamingBadge}>Speaking...</div>}
      </div>

      {/* Message area */}
      <div style={styles.messageArea}>
        {philText ? (
          <p style={styles.messageText}>
            {philText}
            {isStreaming && <span style={styles.cursor}>▍</span>}
          </p>
        ) : (
          <p style={styles.placeholder}>
            {isMyTurn
              ? "Phil is sizing up the situation..."
              : "Waiting for your turn..."}
          </p>
        )}
        <div ref={messageEndRef} />
      </div>

      {/* Chat input */}
      <div style={styles.inputRow}>
        <input
          style={{
            ...styles.input,
            ...(inputDisabled ? styles.inputDisabled : {}),
          }}
          type="text"
          placeholder={isMyTurn ? "Ask Phil anything..." : "Wait for your turn"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={inputDisabled}
        />
        <button
          style={{
            ...styles.sendButton,
            ...(inputDisabled ? styles.sendButtonDisabled : {}),
          }}
          onClick={handleSend}
          disabled={inputDisabled}
        >
          Ask
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "16px",
    backgroundColor: "#1a1a2e",
    borderRadius: "12px",
    border: "2px solid #2a2a4e",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  avatar: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    backgroundColor: "#78350f",
    color: "#fde68a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: "14px",
    flexShrink: 0,
  },
  name: {
    color: "#f0c040",
    fontWeight: "bold",
    fontSize: "15px",
  },
  subtitle: {
    color: "#64748b",
    fontSize: "11px",
  },
  streamingBadge: {
    marginLeft: "auto",
    backgroundColor: "#14532d",
    color: "#86efac",
    fontSize: "11px",
    padding: "2px 8px",
    borderRadius: "10px",
    fontStyle: "italic",
  },
  messageArea: {
    minHeight: "100px",
    maxHeight: "220px",
    overflowY: "auto",
    backgroundColor: "#0d0d1a",
    borderRadius: "8px",
    padding: "12px",
  },
  messageText: {
    margin: 0,
    color: "#e2e8f0",
    fontSize: "14px",
    lineHeight: "1.6",
    whiteSpace: "pre-wrap",
  },
  cursor: {
    display: "inline-block",
    color: "#f0c040",
    animation: "blink 1s step-end infinite",
  },
  placeholder: {
    margin: 0,
    color: "#475569",
    fontSize: "13px",
    fontStyle: "italic",
  },
  inputRow: {
    display: "flex",
    gap: "8px",
  },
  input: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #2a2a4e",
    backgroundColor: "#0d0d1a",
    color: "#e2e8f0",
    fontSize: "13px",
    outline: "none",
  },
  inputDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  sendButton: {
    padding: "8px 16px",
    backgroundColor: "#f0c040",
    color: "#111",
    border: "none",
    borderRadius: "6px",
    fontWeight: "bold",
    fontSize: "13px",
    cursor: "pointer",
  },
  sendButtonDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
};
