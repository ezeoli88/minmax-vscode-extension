import { useState, useRef, useEffect } from "react";
import type { SessionSummaryData } from "../../shared/protocol";

interface ChatHeaderProps {
  sessions: SessionSummaryData[];
  hasApiKey: boolean;
  onNewSession: () => void;
  onGetSessions: () => void;
  onLoadSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onSetApiKey: (key: string) => void;
}

type OpenPanel = null | "history" | "settings";

export function ChatHeader({
  sessions,
  hasApiKey,
  onNewSession,
  onGetSessions,
  onLoadSession,
  onDeleteSession,
  onSetApiKey,
}: ChatHeaderProps) {
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel on outside click
  useEffect(() => {
    if (!openPanel) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpenPanel(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openPanel]);

  const handleHistoryClick = () => {
    if (openPanel === "history") {
      setOpenPanel(null);
    } else {
      onGetSessions();
      setOpenPanel("history");
    }
  };

  const handleSettingsClick = () => {
    setOpenPanel(openPanel === "settings" ? null : "settings");
  };

  const handleSaveApiKey = () => {
    const trimmed = apiKeyInput.trim();
    if (trimmed) {
      onSetApiKey(trimmed);
      setApiKeyInput("");
      setOpenPanel(null);
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="chat-header" ref={panelRef}>
      <span className="chat-header-title">MiniMax</span>
      <div className="chat-header-actions">
        <button
          className="header-btn"
          onClick={onNewSession}
          title="New chat"
        >
          +
        </button>
        <button
          className={`header-btn${openPanel === "history" ? " header-btn-active" : ""}`}
          onClick={handleHistoryClick}
          title="Chat history"
        >
          &#9776;
        </button>
        <button
          className={`header-btn${openPanel === "settings" ? " header-btn-active" : ""}`}
          onClick={handleSettingsClick}
          title="Settings"
        >
          &#9881;
        </button>
      </div>

      {openPanel === "history" && (
        <div className="header-panel history-panel">
          <div className="header-panel-title">Chat History</div>
          {sessions.length === 0 ? (
            <div className="header-panel-empty">No previous chats</div>
          ) : (
            <div className="history-list">
              {sessions.map((s) => (
                <div key={s.id} className="history-item">
                  <div
                    className="history-item-content"
                    onClick={() => {
                      onLoadSession(s.id);
                      setOpenPanel(null);
                    }}
                  >
                    <span className="history-item-title">{s.title}</span>
                    <span className="history-item-meta">
                      {formatDate(s.updatedAt)} · {s.messageCount} msgs
                    </span>
                  </div>
                  <button
                    className="history-item-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(s.id);
                    }}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {openPanel === "settings" && (
        <div className="header-panel settings-panel">
          <div className="header-panel-title">Settings</div>
          <div className="settings-section">
            <label className="settings-label">
              API Key
              {hasApiKey && <span className="settings-badge">configured</span>}
            </label>
            <div className="settings-key-row">
              <input
                type="password"
                className="settings-input"
                placeholder={hasApiKey ? "Enter new key to update..." : "sk-..."}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey()}
              />
              <button
                className="settings-save-btn"
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
