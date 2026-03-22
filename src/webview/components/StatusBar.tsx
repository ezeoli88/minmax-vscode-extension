import { useState, useRef, useEffect } from "react";
import type { AgentMode, QuotaData } from "../../shared/protocol";

function formatReset(minutes: number): string {
  if (minutes <= 0) return "now";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getQuotaClass(quota: QuotaData): string {
  const pct = (quota.remaining / quota.total) * 100;
  if (pct <= 10) return "quota-critical";
  if (pct <= 30) return "quota-low";
  return "quota-ok";
}

const AVAILABLE_MODELS = [
  "MiniMax-M2.7",
  "MiniMax-M2.7-highspeed",
  "MiniMax-M2.5",
  "MiniMax-M2.5-highspeed",
  "MiniMax-M2.1",
  "MiniMax-M2.1-highspeed",
];

interface StatusBarProps {
  model: string;
  mode: AgentMode;
  totalTokens: number;
  quota: QuotaData | null;
  onModeChange: (mode: AgentMode) => void;
  onModelChange: (model: string) => void;
  onClear: () => void;
}

export function StatusBar({ model, mode, totalTokens, quota, onModeChange, onModelChange, onClear }: StatusBarProps) {
  const [showModelPicker, setShowModelPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showModelPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showModelPicker]);

  return (
    <div className="status-bar">
      <div className="status-model-wrapper" ref={pickerRef}>
        <span
          className="status-model"
          onClick={() => setShowModelPicker(!showModelPicker)}
          title="Click to change model"
        >
          {model} ▾
        </span>
        {showModelPicker && (
          <div className="model-picker">
            {AVAILABLE_MODELS.map((m) => (
              <div
                key={m}
                className={`model-picker-item${m === model ? " model-picker-item-active" : ""}`}
                onClick={() => {
                  onModelChange(m);
                  setShowModelPicker(false);
                }}
              >
                {m}
              </div>
            ))}
          </div>
        )}
      </div>
      <span className="status-separator">|</span>
      <span
        className={`status-mode mode-${mode.toLowerCase()}`}
        onClick={() => onModeChange(mode === "PLAN" ? "BUILDER" : "PLAN")}
        title="Click to toggle mode"
      >
        {mode}
      </span>
      <span className="status-separator">|</span>
      <span className="status-tokens">
        {totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens} tokens
      </span>
      {quota && quota.total > 0 && (
        <>
          <span className="status-separator">|</span>
          <span className={`status-quota ${getQuotaClass(quota)}`} title={`${quota.used}/${quota.total} used`}>
            {Math.round((quota.remaining / quota.total) * 100)}% left
          </span>
          <span className="status-separator">|</span>
          <span className="status-reset" title="Quota reset time">
            {formatReset(quota.resetMinutes)}
          </span>
        </>
      )}
      <span className="status-spacer" />
      <button className="status-clear-btn" onClick={onClear} title="Clear chat">
        Clear
      </button>
    </div>
  );
}
