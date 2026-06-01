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
        <div style={styles.avatar}>PI</div>
        <div>
          <div style={styles.name}>Phil Ivey</div>
          <div style={styles.subtitle}>Your Coach</div>
        </div>
        {isStreaming && <div style={styles.streamingBadge}>Speaking...</div>}
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
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 14px 8px",
    borderBottom: "1px solid #2a2a4e",
    flexShrink: 0,
    background: "#1a1a2e",
  },
  avatar: {
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    backgroundColor: "#78350f",
    color: "#fde68a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: "12px",
    flexShrink: 0,
    border: "2px solid rgba(240,192,64,0.3)",
  },
  name: {
    color: "#f0c040",
    fontWeight: "bold",
    fontSize: "13px",
  },
  subtitle: {
    color: "#64748b",
    fontSize: "10px",
  },
  streamingBadge: {
    marginLeft: "auto",
    backgroundColor: "#14532d",
    color: "#86efac",
    fontSize: "10px",
    padding: "2px 8px",
    borderRadius: "10px",
    fontStyle: "italic",
  },
  messageArea: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "10px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  philRow: {
    display: "flex",
    justifyContent: "flex-start",
  },
  philBubble: {
    maxWidth: "88%",
    background: "#1a1a2e",
    borderLeft: "3px solid #f0c040",
    padding: "7px 12px",
    borderRadius: "0 8px 8px 0",
    color: "#e2e8f0",
    fontSize: "12px",
    lineHeight: "1.6",
  },
  userRow: {
    display: "flex",
    justifyContent: "flex-end",
  },
  userBubble: {
    maxWidth: "80%",
    background: "#2a2a4e",
    padding: "7px 12px",
    borderRadius: "8px 0 8px 8px",
  },
  userText: {
    color: "#cbd5e1",
    fontSize: "12px",
    lineHeight: "1.5",
  },
  cursor: {
    display: "inline-block",
    color: "#f0c040",
    animation: "blink 1s step-end infinite",
  },
  placeholder: {
    margin: 0,
    color: "#475569",
    fontSize: "12px",
    fontStyle: "italic",
  },
  inputRow: {
    display: "flex",
    gap: "8px",
    padding: "8px 14px",
    borderTop: "1px solid #2a2a4e",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    padding: "7px 10px",
    borderRadius: "6px",
    border: "1px solid #2a2a4e",
    backgroundColor: "#0d0d1a",
    color: "#e2e8f0",
    fontSize: "12px",
    outline: "none",
  },
  inputDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  sendButton: {
    padding: "7px 14px",
    backgroundColor: "#f0c040",
    color: "#111",
    border: "none",
    borderRadius: "6px",
    fontWeight: "bold",
    fontSize: "12px",
    cursor: "pointer",
  },
  sendButtonDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
};
