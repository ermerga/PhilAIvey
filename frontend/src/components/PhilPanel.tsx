import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "../types";

const API_BASE = "/api";

interface PhilPanelProps {
  sessionId: string;
  skillLevel: string;
  messages: ChatMessage[];
  isMyTurn: boolean;
  onUserMessage: (msg: string) => void;
}

export function PhilPanel({
  sessionId,
  skillLevel,
  messages,
  isMyTurn,
  onUserMessage,
}: PhilPanelProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const isStreaming = messages.some((m) => m.isStreaming);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending || isStreaming) return;

    onUserMessage(trimmed);
    setSending(true);
    setInput("");

    try {
      await fetch(`${API_BASE}/game/${sessionId}/tutor/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, skill_level: skillLevel }),
      });
    } catch {
      // Phil's response streams back over WebSocket; HTTP errors are silent
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
        <div style={styles.avatar} />
        <div style={styles.identity}>
          <span style={styles.name}>Phil</span>
          <span style={styles.role}>Coach</span>
        </div>
        {isStreaming && <div style={styles.streamingBadge}>Speaking&hellip;</div>}
      </div>

      {/* Conversation thread */}
      <div style={styles.messageArea}>
        {messages.length === 0 ? (
          <p style={styles.placeholder}>
            {isMyTurn
              ? "Phil is sizing up the situation..."
              : "Waiting for your turn..."}
          </p>
        ) : (
          messages.map((msg, i) =>
            msg.role === "phil" ? (
              <div key={i} style={styles.philRow}>
                <div style={styles.philBubble} className="phil-message">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                  {msg.isStreaming && <span style={styles.cursor}>▍</span>}
                </div>
              </div>
            ) : (
              <div key={i} style={styles.userRow}>
                <div style={styles.userBubble}>
                  <span style={styles.userText}>{msg.content}</span>
                </div>
              </div>
            )
          )
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
          placeholder={isMyTurn ? "Reply to Phil..." : "Wait for your turn"}
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
          Send
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
    height: "100%",
    overflow: "hidden",
    borderLeft: "2px solid var(--brass)",
    background: "linear-gradient(180deg, var(--panel-hi), var(--panel))",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px 10px",
    borderBottom: "1px solid var(--line)",
    flexShrink: 0,
  },
  avatar: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    background: "radial-gradient(circle at 35% 30%, #3A2C1C, #17110B)",
    border: "1px solid var(--brass-dim)",
    flexShrink: 0,
  },
  identity: {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
  },
  name: {
    fontFamily: "var(--f-display)",
    color: "var(--text)",
    fontWeight: 600,
    fontSize: "15px",
  },
  role: {
    fontSize: "9px",
    textTransform: "uppercase",
    letterSpacing: "0.2em",
    color: "var(--brass)",
    fontWeight: 600,
  },
  streamingBadge: {
    marginLeft: "auto",
    background: "rgba(95,185,140,0.16)",
    color: "var(--rise)",
    fontSize: "10px",
    padding: "2px 9px",
    borderRadius: "999px",
    fontStyle: "italic",
    border: "1px solid rgba(95,185,140,0.35)",
  },
  messageArea: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  philRow: {
    display: "flex",
    justifyContent: "flex-start",
  },
  philBubble: {
    maxWidth: "90%",
    background: "var(--panel)",
    borderLeft: "2px solid var(--brass)",
    padding: "8px 13px",
    borderRadius: "0 var(--r-md) var(--r-md) 0",
    color: "var(--text)",
    fontSize: "13px",
    lineHeight: "1.6",
  },
  userRow: {
    display: "flex",
    justifyContent: "flex-end",
  },
  userBubble: {
    maxWidth: "82%",
    background: "var(--panel-hi)",
    border: "1px solid var(--line)",
    padding: "8px 13px",
    borderRadius: "var(--r-md) 0 var(--r-md) var(--r-md)",
  },
  userText: {
    color: "var(--text)",
    fontSize: "13px",
    lineHeight: "1.55",
  },
  cursor: {
    display: "inline-block",
    color: "var(--brass)",
    animation: "blink 1s step-end infinite",
  },
  placeholder: {
    margin: 0,
    color: "var(--muted)",
    fontSize: "13px",
    fontStyle: "italic",
  },
  inputRow: {
    display: "flex",
    gap: "8px",
    padding: "10px 16px",
    borderTop: "1px solid var(--line)",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    padding: "8px 11px",
    borderRadius: "var(--r-sm)",
    border: "1px solid var(--line)",
    background: "var(--room)",
    color: "var(--text)",
    fontSize: "13px",
    fontFamily: "var(--f-body)",
    outline: "none",
  },
  inputDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  sendButton: {
    padding: "8px 16px",
    background: "linear-gradient(180deg, #D8A552, var(--brass))",
    color: "#21160A",
    border: "none",
    borderRadius: "var(--r-sm)",
    fontWeight: 600,
    fontSize: "12px",
    cursor: "pointer",
  },
  sendButtonDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
};
