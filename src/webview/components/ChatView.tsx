import { useState } from "react";
import type { ChatMessage } from "../App";
import type { AgentMode, CheckpointSummary, FileChangeSummary, QuotaData, SessionSummaryData } from "../../shared/protocol";
import { ChatHeader } from "./ChatHeader";
import { ContextBar } from "./ContextBar";
import { MessageList } from "./MessageList";
import { InputBox } from "./InputBox";
import { ChangesModal } from "./ChangesModal";
import { StatusBar } from "./StatusBar";

interface ChatViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
  model: string;
  mode: AgentMode;
  theme: string;
  totalTokens: number;
  promptTokens: number;
  maxContextTokens: number;
  isCompacting: boolean;
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
  onCompact: () => void;
  fileChanges: FileChangeSummary[];
  onGetFileChanges: () => void;
  onOpenFileChange: (filePath: string) => void;
  onAcceptFileChange: (filePath: string) => void;
  onRejectFileChange: (filePath: string) => void;
  onAcceptAllChanges: () => void;
  onRejectAllChanges: () => void;
  checkpoints: CheckpointSummary[];
  onRestoreCheckpoint: (checkpointId: string) => void;
}

export function ChatView({
  messages,
  isLoading,
  model,
  mode,
  theme,
  totalTokens,
  promptTokens,
  maxContextTokens,
  isCompacting,
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
  onCompact,
  fileChanges,
  onGetFileChanges,
  onOpenFileChange,
  onAcceptFileChange,
  onRejectFileChange,
  onAcceptAllChanges,
  onRejectAllChanges,
  checkpoints,
  onRestoreCheckpoint,
}: ChatViewProps) {
  const [showChangesModal, setShowChangesModal] = useState(false);

  const showViewChangesButton = !isLoading && fileChanges.length > 0;

  const handleOpenModal = () => {
    onGetFileChanges();
    setShowChangesModal(true);
  };

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
      <ContextBar
        promptTokens={promptTokens}
        maxTokens={maxContextTokens}
        isCompacting={isCompacting}
        onCompact={onCompact}
      />
      <MessageList
        messages={messages}
        isLoading={isLoading}
        showViewChangesButton={showViewChangesButton}
        onViewChanges={handleOpenModal}
        checkpoints={checkpoints}
        onRestoreCheckpoint={onRestoreCheckpoint}
      />
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
      {showChangesModal && fileChanges.length > 0 && (
        <ChangesModal
          fileChanges={fileChanges}
          onClose={() => setShowChangesModal(false)}
          onAcceptAllChanges={onAcceptAllChanges}
          onRejectAllChanges={onRejectAllChanges}
          onOpenFileChange={onOpenFileChange}
          onAcceptFileChange={onAcceptFileChange}
          onRejectFileChange={onRejectFileChange}
        />
      )}
    </div>
  );
}
