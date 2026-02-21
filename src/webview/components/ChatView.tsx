import type { ChatMessage } from "../App";
import type { AgentMode, QuotaData, SessionSummaryData } from "../../shared/protocol";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { InputBox } from "./InputBox";
import { StatusBar } from "./StatusBar";

interface ChatViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
  model: string;
  mode: AgentMode;
  theme: string;
  totalTokens: number;
  quota: QuotaData | null;
  sessions: SessionSummaryData[];
  hasApiKey: boolean;
  fileCompletions: string[];
  onSend: (text: string, fileContext?: string) => void;
  onCancel: () => void;
  onModeChange: (mode: AgentMode) => void;
  onModelChange: (model: string) => void;
  onNewSession: () => void;
  onGetSessions: () => void;
  onLoadSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onSetApiKey: (key: string) => void;
  onRequestFileCompletion: (query: string) => void;
  onClear: () => void;
}

export function ChatView({
  messages,
  isLoading,
  model,
  mode,
  theme,
  totalTokens,
  quota,
  sessions,
  hasApiKey,
  fileCompletions,
  onSend,
  onCancel,
  onModeChange,
  onModelChange,
  onNewSession,
  onGetSessions,
  onLoadSession,
  onDeleteSession,
  onSetApiKey,
  onRequestFileCompletion,
  onClear,
}: ChatViewProps) {
  return (
    <div className="chat-view">
      <ChatHeader
        sessions={sessions}
        hasApiKey={hasApiKey}
        onNewSession={onNewSession}
        onGetSessions={onGetSessions}
        onLoadSession={onLoadSession}
        onDeleteSession={onDeleteSession}
        onSetApiKey={onSetApiKey}
      />
      <MessageList messages={messages} isLoading={isLoading} />
      <InputBox
        isLoading={isLoading}
        mode={mode}
        fileCompletions={fileCompletions}
        onSend={onSend}
        onCancel={onCancel}
        onModeChange={onModeChange}
        onRequestFileCompletion={onRequestFileCompletion}
      />
      <StatusBar
        model={model}
        mode={mode}
        totalTokens={totalTokens}
        quota={quota}
        onModeChange={onModeChange}
        onModelChange={onModelChange}
        onClear={onClear}
      />
    </div>
  );
}
