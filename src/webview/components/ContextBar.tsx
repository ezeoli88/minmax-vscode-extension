interface ContextBarProps {
  promptTokens: number;
  maxTokens: number;
  isCompacting: boolean;
  onCompact: () => void;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return String(tokens);
}

export function ContextBar({ promptTokens, maxTokens, isCompacting, onCompact }: ContextBarProps) {
  if (promptTokens <= 0) return null;

  const percentage = Math.min((promptTokens / maxTokens) * 100, 100);
  const showCompact = percentage >= 70;

  let colorClass = "context-fill-ok";
  if (percentage > 80) {
    colorClass = "context-fill-critical";
  } else if (percentage > 50) {
    colorClass = "context-fill-warning";
  }

  return (
    <div className="context-bar">
      <span className="context-bar-label">Context</span>
      <div className="context-bar-track">
        <div
          className={`context-bar-fill ${colorClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="context-bar-tokens">
        {formatTokens(promptTokens)} / {formatTokens(maxTokens)}
      </span>
      {showCompact && (
        <button
          className="context-bar-compact-btn"
          onClick={onCompact}
          disabled={isCompacting}
        >
          {isCompacting ? "Compacting..." : "Compact"}
        </button>
      )}
    </div>
  );
}
