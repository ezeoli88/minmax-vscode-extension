import type * as vscode from "vscode";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface SessionData {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  apiHistory: ChatCompletionMessageParam[];
  webviewMessages: any[]; // ChatMessage from webview
  promptTokens?: number;
}

const SESSIONS_KEY = "minimax.sessions";
const MAX_SESSIONS = 50;

export class SessionManager {
  private globalState: vscode.Memento;
  private currentSessionId: string | null = null;

  constructor(globalState: vscode.Memento) {
    this.globalState = globalState;
  }

  generateId(): string {
    return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  setCurrentSessionId(id: string | null): void {
    this.currentSessionId = id;
  }

  private getAllSessions(): SessionData[] {
    return this.globalState.get<SessionData[]>(SESSIONS_KEY, []);
  }

  private async saveAllSessions(sessions: SessionData[]): Promise<void> {
    await this.globalState.update(SESSIONS_KEY, sessions);
  }

  getSummaries(): SessionSummary[] {
    return this.getAllSessions()
      .map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: s.webviewMessages.filter((m: any) => m.role === "user" || m.role === "assistant").length,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getSession(id: string): SessionData | undefined {
    return this.getAllSessions().find((s) => s.id === id);
  }

  async saveSession(
    id: string,
    apiHistory: ChatCompletionMessageParam[],
    webviewMessages: any[],
    promptTokens?: number
  ): Promise<void> {
    const userMessages = webviewMessages.filter((m: any) => m.role === "user");
    if (userMessages.length === 0) return; // don't save empty sessions

    const sessions = this.getAllSessions();
    const existing = sessions.findIndex((s) => s.id === id);

    const title = this.deriveTitle(webviewMessages);
    const now = Date.now();

    const session: SessionData = {
      id,
      title,
      createdAt: existing >= 0 ? sessions[existing].createdAt : now,
      updatedAt: now,
      apiHistory,
      webviewMessages,
      promptTokens: promptTokens ?? 0,
    };

    if (existing >= 0) {
      sessions[existing] = session;
    } else {
      sessions.unshift(session);
    }

    // Trim to max
    if (sessions.length > MAX_SESSIONS) {
      sessions.length = MAX_SESSIONS;
    }

    await this.saveAllSessions(sessions);
  }

  async deleteSession(id: string): Promise<void> {
    const sessions = this.getAllSessions().filter((s) => s.id !== id);
    await this.saveAllSessions(sessions);
  }

  private deriveTitle(webviewMessages: any[]): string {
    const first = webviewMessages.find((m: any) => m.role === "user");
    if (!first) return "New chat";
    const text = (first.content || "").trim();
    if (text.length <= 50) return text;
    return text.slice(0, 47) + "...";
  }
}
