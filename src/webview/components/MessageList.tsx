import { useRef, useEffect } from "react";
import type { ChatMessage } from "../App";
import { Message } from "./Message";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
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
      {messages.map((msg, i) => (
        <Message key={i} message={msg} />
      ))}
      {isLoading && messages[messages.length - 1]?.isStreaming && (
        <div className="thinking-indicator">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
