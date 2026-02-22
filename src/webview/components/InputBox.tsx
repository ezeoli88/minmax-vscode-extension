import { useState, useRef, useCallback, useEffect } from "react";
import type { AgentMode } from "../../shared/protocol";

interface InputBoxProps {
  isLoading: boolean;
  mode: AgentMode;
  fileCompletions: string[];
  onSend: (text: string, fileContext?: string) => void;
  onCancel: () => void;
  onModeChange: (mode: AgentMode) => void;
  onRequestFileCompletion: (query: string) => void;
}

export function InputBox({
  isLoading,
  mode,
  fileCompletions,
  onSend,
  onCancel,
  onModeChange,
  onRequestFileCompletion,
}: InputBoxProps) {
  const [text, setText] = useState("");
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [fileQuery, setFileQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isLoading) return;
        const trimmed = text.trim();
        if (!trimmed) return;
        onSend(trimmed);
        setText("");
      }

      if (e.key === "Escape" && isLoading) {
        onCancel();
      }

      if (e.key === "Tab" && !e.shiftKey && !showFilePicker) {
        e.preventDefault();
        onModeChange(mode === "PLAN" ? "BUILDER" : "PLAN");
      }
    },
    [text, isLoading, mode, onSend, onCancel, onModeChange, showFilePicker]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    // Detect @ for file picker
    const lastAt = val.lastIndexOf("@");
    if (lastAt >= 0 && (lastAt === 0 || val[lastAt - 1] === " ")) {
      const query = val.slice(lastAt + 1);
      if (!query.includes(" ")) {
        setShowFilePicker(true);
        setFileQuery(query);
        onRequestFileCompletion(query);
        return;
      }
    }
    setShowFilePicker(false);
  };

  const selectFile = (file: string) => {
    const lastAt = text.lastIndexOf("@");
    const newText = text.slice(0, lastAt) + `@${file} `;
    setText(newText);
    setShowFilePicker(false);
    textareaRef.current?.focus();
  };

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    }
  }, [text]);

  return (
    <div className="input-box">
      {showFilePicker && fileCompletions.length > 0 && (
        <div className="file-picker">
          {fileCompletions.map((f) => (
            <div key={f} className="file-picker-item" onClick={() => selectFile(f)}>
              {f}
            </div>
          ))}
        </div>
      )}
      <div className="input-row">
        <textarea
          ref={textareaRef}
          className={`input-textarea mode-${mode.toLowerCase()}`}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? "Streaming... (Esc to cancel)" : "Type a message... (Tab to toggle mode)"}
          rows={1}
          disabled={false}
        />
        {isLoading ? (
          <button className="send-btn cancel-btn" onClick={onCancel} title="Cancel">
            &#x25A0;
          </button>
        ) : (
          <button
            className="send-btn"
            onClick={() => {
              const trimmed = text.trim();
              if (!trimmed) return;
              onSend(trimmed);
              setText("");
            }}
            disabled={!text.trim()}
            title="Send"
          >
            &#x27A4;
          </button>
        )}
      </div>
    </div>
  );
}
