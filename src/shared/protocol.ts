// Shared types for postMessage protocol between extension host and webview.
// No imports from "vscode" or Node.js — pure types only.

export type AgentMode = "PLAN" | "BUILDER";

export interface SerializedToolCall {
  id: string;
  function: { name: string; arguments: string };
  type: "function";
}

// --- Webview → Extension ---

export interface SessionSummaryData {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export type WebviewToExtension =
  | { type: "sendMessage"; text: string; fileContext?: string }
  | { type: "cancelStream" }
  | { type: "setMode"; mode: AgentMode }
  | { type: "setModel"; model: string }
  | { type: "setTheme"; theme: string }
  | { type: "newSession" }
  | { type: "loadSession"; sessionId: string }
  | { type: "deleteSession"; sessionId: string }
  | { type: "getSessions" }
  | { type: "setApiKey"; key: string }
  | { type: "clearChat" }
  | { type: "syncMessages"; messages: any[] }
  | { type: "requestFileCompletion"; query: string }
  | { type: "openFileChange"; filePath: string }
  | { type: "getFileChanges" }
  | { type: "acceptFileChange"; filePath: string }
  | { type: "rejectFileChange"; filePath: string }
  | { type: "acceptAllChanges" }
  | { type: "rejectAllChanges" }
  | { type: "ready" };

// --- Diff types for inline file change visualization ---

export interface DiffLine {
  type: "added" | "removed" | "context";
  content: string;
}

export interface FileChangeData {
  filePath: string;
  isNewFile: boolean;
  diffLines: DiffLine[];
  language: string;
  oldContent: string;
}

// --- File change summary for "View Changes" panel ---

export interface FileChangeSummary {
  filePath: string;
  isNewFile: boolean;
  addedLines: number;
  removedLines: number;
  language: string;
}

// --- Extension → Webview ---

// --- Quota types ---

export interface QuotaData {
  used: number;
  total: number;
  remaining: number;
  resetMinutes: number;
}

// --- Extension → Webview ---

export type ExtensionToWebview =
  | { type: "contentDelta"; delta: string }
  | { type: "reasoningDelta"; delta: string }
  | { type: "toolCallsDelta"; toolCalls: SerializedToolCall[] }
  | { type: "messageComplete"; content: string; reasoning?: string; toolCalls?: SerializedToolCall[] }
  | { type: "toolStart"; toolCallId: string; toolName: string; args: string }
  | { type: "toolEnd"; toolCallId: string; result: string; fileChange?: FileChangeData }
  | { type: "tokensUpdate"; total: number }
  | { type: "quotaUpdate"; quota: QuotaData }
  | { type: "error"; message: string }
  | { type: "done" }
  | { type: "configUpdate"; model: string; theme: string; mode: AgentMode }
  | { type: "sessionsList"; sessions: SessionSummaryData[] }
  | { type: "sessionLoaded"; messages: any[] }
  | { type: "apiKeyStatus"; hasKey: boolean }
  | { type: "fileCompletions"; files: string[] }
  | { type: "fileChangesList"; changes: FileChangeSummary[] };
