import { useRef, useEffect } from "react";
import type { ChatMessage } from "../App";
import type { CheckpointSummary } from "../../shared/protocol";
import { Message } from "./Message";
import { CheckpointDivider } from "./CheckpointDivider";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  showViewChangesButton?: boolean;
  onViewChanges?: () => void;
  checkpoints: CheckpointSummary[];
  onRestoreCheckpoint: (checkpointId: string) => void;
}

export function MessageList({ messages, isLoading, showViewChangesButton, onViewChanges, checkpoints, onRestoreCheckpoint }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      userScrolledUp.current = scrollHeight - scrollTop - clientHeight > 50;
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  return (
    <div className="message-list" ref={containerRef}>
      {messages.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">M</div>
          <div className="empty-state-text">Start a conversation with MiniMax</div>
        </div>
      )}
      {messages.map((msg, i) => {
        const cp = checkpoints.find(c => c.messageIndex === i);
        const cpIndex = cp ? checkpoints.indexOf(cp) + 1 : 0;
        return (
          <div key={i}>
            {cp && (
              <CheckpointDivider
                checkpoint={cp}
                index={cpIndex}
                isLoading={isLoading}
                onRestore={onRestoreCheckpoint}
              />
            )}
            <Message message={msg} />
          </div>
        );
      })}
      {isLoading && messages[messages.length - 1]?.isStreaming && (
        <div className="thinking-indicator">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      )}
      {showViewChangesButton && (
        <button className="view-changes-btn" onClick={onViewChanges}>
          View Changes
        </button>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
