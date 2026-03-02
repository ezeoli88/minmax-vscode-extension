import type { ChatMessage } from "../App";
import type { SubAgentTask } from "../../shared/protocol";
import { DiffView } from "./DiffView";
import { Markdown } from "./Markdown";
import { TerminalOutput } from "./TerminalOutput";
import { SubAgentIndicator } from "./SubAgentIndicator";

const TERMINAL_TOOLS = new Set(["bash", "bash_bg"]);

interface MessageProps {
  message: ChatMessage;
  subAgentTasks?: SubAgentTask[];
}

export function Message({ message, subAgentTasks }: MessageProps) {
  if (message.role === "user") {
    return (
      <div className="message message-user">
        <div className="message-label">You</div>
        <div className="message-content">{message.content}</div>
      </div>
    );
  }

  if (message.role === "tool") {
    const isSpawnExplorers = message.toolName === "spawn_explorers";

    return (
      <div className="message message-tool">
        <div className="message-label tool-label">
          {isSpawnExplorers ? "Sub-Agents" : (message.toolName || "Tool")}
        </div>
        <div className="message-content tool-content">
          {isSpawnExplorers && subAgentTasks && subAgentTasks.length > 0 ? (
            <SubAgentIndicator tasks={subAgentTasks} />
          ) : message.fileChange ? (
            <DiffView data={message.fileChange} />
          ) : TERMINAL_TOOLS.has(message.toolName || "") && message.content !== "Running..." ? (
            <TerminalOutput content={message.content || ""} />
          ) : isSpawnExplorers && message.content !== "Running..." ? (
            <Markdown content={message.content || ""} />
          ) : (
            <pre>{message.content}</pre>
          )}
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="message message-assistant">
      <div className="message-label">MiniMax</div>
      {message.reasoning && (
        <details className="reasoning-block">
          <summary className="reasoning-summary">Thinking...</summary>
          <Markdown content={message.reasoning} className="reasoning-content" />
        </details>
      )}
      {message.content && (
        <div className="message-content">
          <Markdown content={message.content} />
          {message.isStreaming && <span className="streaming-cursor">|</span>}
        </div>
      )}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="tool-calls-block">
          {message.toolCalls.map((tc) => {
            let argsDisplay = "";
            try {
              const parsed = JSON.parse(tc.function.arguments);
              argsDisplay = Object.entries(parsed)
                .map(([k, v]) => `${k}: ${typeof v === "string" && v.length > 100 ? v.slice(0, 100) + "..." : v}`)
                .join(", ");
            } catch {
              argsDisplay = tc.function.arguments;
            }
            return (
              <div key={tc.id} className="tool-call-item">
                <span className="tool-call-name">{tc.function.name}</span>
                <span className="tool-call-args">({argsDisplay})</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
