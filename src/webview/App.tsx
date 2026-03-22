import { useReducer, useEffect, useRef, useCallback } from "react";
import { ChatView } from "./components/ChatView";
import type { AgentMode, CheckpointSummary, ExtensionToWebview, SerializedToolCall, FileChangeData, FileChangeSummary, QuotaData, SessionSummaryData, SubAgentTask } from "../shared/protocol";

const vscode = acquireVsCodeApi();

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  reasoning?: string;
  toolCalls?: SerializedToolCall[];
  toolCallId?: string;
  toolName?: string;
  isStreaming?: boolean;
  fileChange?: FileChangeData;
}

interface AppState {
  messages: ChatMessage[];
  isLoading: boolean;
  model: string;
  theme: string;
  mode: AgentMode;
  totalTokens: number;
  promptTokens: number;
  maxContextTokens: number;
  isCompacting: boolean;
  quota: QuotaData | null;
  fileCompletions: string[];
  sessions: SessionSummaryData[];
  hasApiKey: boolean;
  fileChanges: FileChangeSummary[];
  checkpoints: CheckpointSummary[];
  subAgentTasks: SubAgentTask[];
  showWhatsNew: boolean;
  whatsNewVersion: string;
}

type AppAction =
  | { type: "CONTENT_DELTA"; delta: string }
  | { type: "REASONING_DELTA"; delta: string }
  | { type: "TOOLCALLS_DELTA"; toolCalls: SerializedToolCall[] }
  | { type: "MESSAGE_COMPLETE"; content: string; reasoning?: string; toolCalls?: SerializedToolCall[] }
  | { type: "TOOL_START"; toolCallId: string; toolName: string }
  | { type: "TOOL_END"; toolCallId: string; result: string; fileChange?: FileChangeData }
  | { type: "TOKENS_UPDATE"; total: number }
  | { type: "QUOTA_UPDATE"; quota: QuotaData }
  | { type: "ERROR"; message: string }
  | { type: "DONE" }
  | { type: "CONFIG_UPDATE"; model: string; theme: string; mode: AgentMode }
  | { type: "FILE_COMPLETIONS"; files: string[] }
  | { type: "SESSIONS_LIST"; sessions: SessionSummaryData[] }
  | { type: "SESSION_LOADED"; messages: ChatMessage[]; promptTokens?: number; maxContextTokens?: number }
  | { type: "API_KEY_STATUS"; hasKey: boolean }
  | { type: "FILE_CHANGES_LIST"; changes: FileChangeSummary[] }
  | { type: "CONTEXT_UPDATE"; promptTokens: number; maxTokens: number }
  | { type: "COMPACT_START" }
  | { type: "COMPACT_RESULT"; success: boolean; promptTokens: number }
  | { type: "SEND_MESSAGE"; text: string }
  | { type: "CLEAR_CHAT" }
  | { type: "CHECKPOINTS_UPDATE"; checkpoints: CheckpointSummary[] }
  | { type: "CHECKPOINT_RESTORED"; messages: ChatMessage[]; promptTokens: number; maxContextTokens: number; checkpoints: CheckpointSummary[] }
  | { type: "SUB_AGENT_START"; taskId: string; description: string }
  | { type: "SUB_AGENT_PROGRESS"; taskId: string; toolName: string }
  | { type: "SUB_AGENT_DONE"; taskId: string; summary: string }
  | { type: "SUB_AGENT_ERROR"; taskId: string; error: string }
  | { type: "SHOW_WHATS_NEW"; version: string }
  | { type: "DISMISS_WHATS_NEW" };

const initialState: AppState = {
  messages: [],
  isLoading: false,
  model: "MiniMax-M2.7",
  theme: "tokyo-night",
  mode: "BUILDER",
  totalTokens: 0,
  promptTokens: 0,
  maxContextTokens: 200_000,
  isCompacting: false,
  quota: null,
  fileCompletions: [],
  sessions: [],
  hasApiKey: false,
  fileChanges: [],
  checkpoints: [],
  subAgentTasks: [],
  showWhatsNew: false,
  whatsNewVersion: "",
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SEND_MESSAGE":
      return {
        ...state,
        isLoading: true,
        messages: [
          ...state.messages,
          { role: "user", content: action.text },
          { role: "assistant", content: "", isStreaming: true },
        ],
      };

    case "CONTENT_DELTA": {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.isStreaming) {
        msgs[msgs.length - 1] = { ...last, content: last.content + action.delta };
      }
      return { ...state, messages: msgs };
    }

    case "REASONING_DELTA": {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.isStreaming) {
        msgs[msgs.length - 1] = {
          ...last,
          reasoning: (last.reasoning || "") + action.delta,
        };
      }
      return { ...state, messages: msgs };
    }

    case "TOOLCALLS_DELTA": {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.isStreaming) {
        msgs[msgs.length - 1] = { ...last, toolCalls: action.toolCalls };
      }
      return { ...state, messages: msgs };
    }

    case "MESSAGE_COMPLETE": {
      const msgs = [...state.messages];
      // Find and finalize the streaming message
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].isStreaming) {
          msgs[i] = {
            ...msgs[i],
            content: action.content,
            reasoning: action.reasoning,
            toolCalls: action.toolCalls,
            isStreaming: false,
          };
          break;
        }
      }
      return { ...state, messages: msgs };
    }

    case "TOOL_START":
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            role: "tool",
            content: "Running...",
            toolCallId: action.toolCallId,
            toolName: action.toolName,
          },
        ],
      };

    case "TOOL_END": {
      const msgs = state.messages.map((m) =>
        m.toolCallId === action.toolCallId
          ? { ...m, content: action.result, fileChange: action.fileChange }
          : m
      );
      // Add a new streaming assistant message for the next loop iteration
      return {
        ...state,
        messages: [...msgs, { role: "assistant", content: "", isStreaming: true }],
      };
    }

    case "TOKENS_UPDATE":
      return { ...state, totalTokens: action.total };

    case "QUOTA_UPDATE":
      return { ...state, quota: action.quota };

    case "ERROR": {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.isStreaming) {
        msgs[msgs.length - 1] = {
          ...last,
          content: `Error: ${action.message}`,
          isStreaming: false,
        };
      } else {
        msgs.push({ role: "assistant", content: `Error: ${action.message}` });
      }
      return { ...state, messages: msgs, isLoading: false };
    }

    case "DONE":
      // Remove any trailing empty streaming messages
      const cleaned = state.messages.filter(
        (m) => !(m.isStreaming && !m.content && !m.reasoning && !m.toolCalls)
      );
      return { ...state, messages: cleaned, isLoading: false, subAgentTasks: [] };

    case "CONFIG_UPDATE":
      return {
        ...state,
        model: action.model,
        theme: action.theme,
        mode: action.mode,
      };

    case "FILE_COMPLETIONS":
      return { ...state, fileCompletions: action.files };

    case "SESSIONS_LIST":
      return { ...state, sessions: action.sessions };

    case "SESSION_LOADED":
      return { ...state, messages: action.messages, totalTokens: 0, promptTokens: action.promptTokens ?? 0, maxContextTokens: action.maxContextTokens ?? 200_000, isLoading: false, fileChanges: [], checkpoints: [] };

    case "API_KEY_STATUS":
      return { ...state, hasApiKey: action.hasKey };

    case "CONTEXT_UPDATE":
      return { ...state, promptTokens: action.promptTokens, maxContextTokens: action.maxTokens };

    case "COMPACT_START":
      return { ...state, isCompacting: true };

    case "COMPACT_RESULT":
      return {
        ...state,
        isCompacting: false,
        promptTokens: action.promptTokens,
        messages: action.success
          ? [{ role: "assistant" as const, content: "Context compacted successfully. The conversation history has been summarized to free up context space. You can continue working normally." }]
          : state.messages,
      };

    case "CLEAR_CHAT":
      return { ...state, messages: [], totalTokens: 0, promptTokens: 0, quota: state.quota, fileChanges: [], checkpoints: [], subAgentTasks: [] };

    case "FILE_CHANGES_LIST":
      return { ...state, fileChanges: action.changes };

    case "CHECKPOINTS_UPDATE":
      return { ...state, checkpoints: action.checkpoints };

    case "CHECKPOINT_RESTORED":
      return {
        ...state,
        messages: action.messages,
        promptTokens: action.promptTokens,
        maxContextTokens: action.maxContextTokens,
        checkpoints: action.checkpoints,
        isLoading: false,
        fileChanges: [],
      };

    case "SUB_AGENT_START":
      return {
        ...state,
        subAgentTasks: [
          ...state.subAgentTasks,
          { taskId: action.taskId, description: action.description, status: "running" },
        ],
      };

    case "SUB_AGENT_PROGRESS":
      return {
        ...state,
        subAgentTasks: state.subAgentTasks.map((t) =>
          t.taskId === action.taskId ? { ...t, currentTool: action.toolName } : t
        ),
      };

    case "SUB_AGENT_DONE":
      return {
        ...state,
        subAgentTasks: state.subAgentTasks.map((t) =>
          t.taskId === action.taskId
            ? { ...t, status: "completed" as const, summary: action.summary, currentTool: undefined }
            : t
        ),
      };

    case "SUB_AGENT_ERROR":
      return {
        ...state,
        subAgentTasks: state.subAgentTasks.map((t) =>
          t.taskId === action.taskId
            ? { ...t, status: "error" as const, summary: action.error, currentTool: undefined }
            : t
        ),
      };

    case "SHOW_WHATS_NEW":
      return { ...state, showWhatsNew: true, whatsNewVersion: action.version };

    case "DISMISS_WHATS_NEW":
      return { ...state, showWhatsNew: false };

    default:
      return state;
  }
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const initialized = useRef(false);
  const messagesRef = useRef(state.messages);
  messagesRef.current = state.messages;

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionToWebview>) => {
      const msg = event.data;
      switch (msg.type) {
        case "contentDelta":
          dispatch({ type: "CONTENT_DELTA", delta: msg.delta });
          break;
        case "reasoningDelta":
          dispatch({ type: "REASONING_DELTA", delta: msg.delta });
          break;
        case "toolCallsDelta":
          dispatch({ type: "TOOLCALLS_DELTA", toolCalls: msg.toolCalls });
          break;
        case "messageComplete":
          dispatch({ type: "MESSAGE_COMPLETE", content: msg.content, reasoning: msg.reasoning, toolCalls: msg.toolCalls });
          break;
        case "toolStart":
          dispatch({ type: "TOOL_START", toolCallId: msg.toolCallId, toolName: msg.toolName });
          break;
        case "toolEnd":
          dispatch({ type: "TOOL_END", toolCallId: msg.toolCallId, result: msg.result, fileChange: msg.fileChange });
          break;
        case "tokensUpdate":
          dispatch({ type: "TOKENS_UPDATE", total: msg.total });
          break;
        case "quotaUpdate":
          dispatch({ type: "QUOTA_UPDATE", quota: msg.quota });
          break;
        case "error":
          dispatch({ type: "ERROR", message: msg.message });
          break;
        case "done":
          dispatch({ type: "DONE" });
          // Sync messages to extension host for session persistence (use timeout so reducer runs first)
          setTimeout(() => {
            vscode.postMessage({ type: "syncMessages", messages: messagesRef.current });
          }, 50);
          break;
        case "configUpdate":
          dispatch({ type: "CONFIG_UPDATE", model: msg.model, theme: msg.theme, mode: msg.mode });
          break;
        case "sessionsList":
          dispatch({ type: "SESSIONS_LIST", sessions: msg.sessions });
          break;
        case "sessionLoaded":
          dispatch({ type: "SESSION_LOADED", messages: msg.messages, promptTokens: msg.promptTokens, maxContextTokens: msg.maxTokens });
          break;
        case "apiKeyStatus":
          dispatch({ type: "API_KEY_STATUS", hasKey: msg.hasKey });
          break;
        case "fileCompletions":
          dispatch({ type: "FILE_COMPLETIONS", files: msg.files });
          break;
        case "fileChangesList":
          dispatch({ type: "FILE_CHANGES_LIST", changes: msg.changes });
          break;
        case "contextUpdate":
          dispatch({ type: "CONTEXT_UPDATE", promptTokens: msg.promptTokens, maxTokens: msg.maxTokens });
          break;
        case "compactResult":
          dispatch({ type: "COMPACT_RESULT", success: msg.success, promptTokens: msg.promptTokens });
          break;
        case "checkpointsUpdate":
          dispatch({ type: "CHECKPOINTS_UPDATE", checkpoints: msg.checkpoints });
          break;
        case "checkpointRestored":
          dispatch({ type: "CHECKPOINT_RESTORED", messages: msg.messages, promptTokens: msg.promptTokens, maxContextTokens: msg.maxTokens, checkpoints: msg.checkpoints });
          break;
        case "subAgentStart":
          dispatch({ type: "SUB_AGENT_START", taskId: msg.taskId, description: msg.description });
          break;
        case "subAgentProgress":
          dispatch({ type: "SUB_AGENT_PROGRESS", taskId: msg.taskId, toolName: msg.toolName });
          break;
        case "subAgentDone":
          dispatch({ type: "SUB_AGENT_DONE", taskId: msg.taskId, summary: msg.summary });
          break;
        case "subAgentError":
          dispatch({ type: "SUB_AGENT_ERROR", taskId: msg.taskId, error: msg.error });
          break;
        case "showWhatsNew":
          dispatch({ type: "SHOW_WHATS_NEW", version: msg.version });
          break;
      }
    };

    window.addEventListener("message", handler);

    if (!initialized.current) {
      initialized.current = true;
      vscode.postMessage({ type: "ready" });
    }

    return () => window.removeEventListener("message", handler);
  }, []);

  const handleSend = (text: string, fileContext?: string) => {
    dispatch({ type: "SEND_MESSAGE", text });
    vscode.postMessage({ type: "sendMessage", text, fileContext });
  };

  const handleCancel = () => {
    vscode.postMessage({ type: "cancelStream" });
  };

  const handleModeChange = (mode: AgentMode) => {
    vscode.postMessage({ type: "setMode", mode });
  };

  const handleModelChange = (model: string) => {
    vscode.postMessage({ type: "setModel", model });
  };

  const handleRequestFileCompletion = (query: string) => {
    vscode.postMessage({ type: "requestFileCompletion", query });
  };

  const handleClear = () => {
    dispatch({ type: "CLEAR_CHAT" });
    vscode.postMessage({ type: "clearChat" });
  };

  const handleNewSession = () => {
    vscode.postMessage({ type: "newSession" });
  };

  const handleGetSessions = () => {
    vscode.postMessage({ type: "getSessions" });
  };

  const handleLoadSession = (sessionId: string) => {
    vscode.postMessage({ type: "loadSession", sessionId });
  };

  const handleDeleteSession = (sessionId: string) => {
    vscode.postMessage({ type: "deleteSession", sessionId });
  };

  const handleSetApiKey = (key: string) => {
    vscode.postMessage({ type: "setApiKey", key });
  };

  const handleGetFileChanges = () => {
    vscode.postMessage({ type: "getFileChanges" });
  };

  const handleOpenFileChange = (filePath: string) => {
    vscode.postMessage({ type: "openFileChange", filePath });
  };

  const handleAcceptFileChange = (filePath: string) => {
    vscode.postMessage({ type: "acceptFileChange", filePath });
  };

  const handleRejectFileChange = (filePath: string) => {
    vscode.postMessage({ type: "rejectFileChange", filePath });
  };

  const handleAcceptAllChanges = () => {
    vscode.postMessage({ type: "acceptAllChanges" });
  };

  const handleRejectAllChanges = () => {
    vscode.postMessage({ type: "rejectAllChanges" });
  };

  const handleCompact = useCallback(() => {
    dispatch({ type: "COMPACT_START" });
    vscode.postMessage({ type: "compactContext" });
  }, []);

  const handleRestoreCheckpoint = useCallback((checkpointId: string) => {
    vscode.postMessage({ type: "restoreCheckpoint", checkpointId });
  }, []);

  const handleDismissWhatsNew = useCallback(() => {
    dispatch({ type: "DISMISS_WHATS_NEW" });
    vscode.postMessage({ type: "dismissWhatsNew" });
  }, []);

  return (
    <div className="app" data-theme={state.theme}>
      <ChatView
        messages={state.messages}
        isLoading={state.isLoading}
        model={state.model}
        mode={state.mode}
        theme={state.theme}
        totalTokens={state.totalTokens}
        promptTokens={state.promptTokens}
        maxContextTokens={state.maxContextTokens}
        isCompacting={state.isCompacting}
        quota={state.quota}
        sessions={state.sessions}
        hasApiKey={state.hasApiKey}
        fileCompletions={state.fileCompletions}
        onSend={handleSend}
        onCancel={handleCancel}
        onModeChange={handleModeChange}
        onModelChange={handleModelChange}
        onNewSession={handleNewSession}
        onGetSessions={handleGetSessions}
        onLoadSession={handleLoadSession}
        onDeleteSession={handleDeleteSession}
        onSetApiKey={handleSetApiKey}
        onRequestFileCompletion={handleRequestFileCompletion}
        onClear={handleClear}
        onCompact={handleCompact}
        fileChanges={state.fileChanges}
        onGetFileChanges={handleGetFileChanges}
        onOpenFileChange={handleOpenFileChange}
        onAcceptFileChange={handleAcceptFileChange}
        onRejectFileChange={handleRejectFileChange}
        onAcceptAllChanges={handleAcceptAllChanges}
        onRejectAllChanges={handleRejectAllChanges}
        checkpoints={state.checkpoints}
        onRestoreCheckpoint={handleRestoreCheckpoint}
        subAgentTasks={state.subAgentTasks}
        showWhatsNew={state.showWhatsNew}
        whatsNewVersion={state.whatsNewVersion}
        onDismissWhatsNew={handleDismissWhatsNew}
      />
    </div>
  );
}
