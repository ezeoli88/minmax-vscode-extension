import * as vscode from "vscode";
import { basename } from "path";
import type OpenAI from "openai";
import { createClient, fetchCodingPlanRemains } from "../core/api";
import { AgentRunner } from "../agent/AgentRunner";
import { loadConfig, getApiKey, setApiKey, updateConfig } from "../config/settings";
import { themes } from "../config/themes";
import { SessionManager } from "../core/sessions";
import type { AgentMode, ExtensionToWebview, FileChangeData, WebviewToExtension } from "../shared/protocol";
import { setCwd } from "../tools/cwd";
import { setOpenBrowserHandler } from "../tools/vscode-bridge";
import { processManager } from "../core/process-manager";
import { OldContentProvider } from "./OldContentProvider";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "minimaxChat";

  private view: vscode.WebviewView | undefined;
  private agent: AgentRunner | undefined;
  private client: OpenAI | undefined;
  private extensionUri: vscode.Uri;
  private secrets: vscode.SecretStorage;
  private mode: AgentMode;
  private model: string;
  private theme: string;
  private apiKey: string | undefined;
  private quotaTimer: ReturnType<typeof setInterval> | undefined;
  private sessionManager: SessionManager;
  private currentSessionId: string;
  private webviewMessages: any[] = [];
  private disposables: vscode.Disposable[] = [];
  private oldContentProvider = new OldContentProvider();

  constructor(extensionUri: vscode.Uri, secrets: vscode.SecretStorage, globalState: vscode.Memento) {
    this.extensionUri = extensionUri;
    this.secrets = secrets;
    this.sessionManager = new SessionManager(globalState);
    this.currentSessionId = this.sessionManager.generateId();
    const config = loadConfig();
    this.mode = config.defaultMode;
    this.model = config.model;
    this.theme = config.theme;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "out", "webview"),
      ],
    };

    webviewView.webview.html = this.getWebviewHtml(webviewView.webview);

    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider(
        OldContentProvider.scheme,
        this.oldContentProvider
      )
    );

    webviewView.webview.onDidReceiveMessage(
      (msg: WebviewToExtension) => this.handleWebviewMessage(msg),
      undefined,
      this.disposables
    );

    webviewView.onDidDispose(() => {
      this.stopQuotaPolling();
      this.view = undefined;
      this.agent = undefined;
      this.client = undefined;
      this.disposables.forEach((d) => d.dispose());
      this.disposables = [];
    });

    this.initializeClient();
  }

  revealView(): void {
    vscode.commands.executeCommand("minimaxChat.focus");
  }

  private async initializeClient(): Promise<void> {
    const apiKey = await getApiKey(this.secrets);
    if (!apiKey) {
      this.postMessage({ type: "error", message: "No API key set. Use 'MiniMax: Set API Key' command." });
      return;
    }

    this.apiKey = apiKey;
    this.client = createClient(apiKey);
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    setCwd(cwd);
    setOpenBrowserHandler(async (url: string) => {
      await vscode.commands.executeCommand("simpleBrowser.api.open", vscode.Uri.parse(url));
    });

    this.agent = new AgentRunner({
      client: this.client,
      model: this.model,
      mode: this.mode,
      cwd,
    });

    this.wireAgentEvents();
    this.startQuotaPolling();
  }

  private wireAgentEvents(): void {
    if (!this.agent) return;

    this.agent.on("content:delta", (delta: string) => {
      this.postMessage({ type: "contentDelta", delta });
    });

    this.agent.on("reasoning:delta", (delta: string) => {
      this.postMessage({ type: "reasoningDelta", delta });
    });

    this.agent.on("toolcalls:delta", (toolCalls: any[]) => {
      this.postMessage({ type: "toolCallsDelta", toolCalls });
    });

    this.agent.on("message:complete", (content: string, reasoning?: string, toolCalls?: any[]) => {
      this.postMessage({ type: "messageComplete", content, reasoning, toolCalls });
    });

    this.agent.on("tool:start", (toolCallId: string, toolName: string, args: string) => {
      this.postMessage({ type: "toolStart", toolCallId, toolName, args });
      vscode.commands.executeCommand("setContext", "minimax.isStreaming", true);
    });

    this.agent.on("tool:end", (toolCallId: string, result: string, fileChange?: FileChangeData) => {
      if (fileChange) {
        this.openDiffEditor(fileChange);
        const { oldContent: _, ...webviewFileChange } = fileChange;
        this.postMessage({ type: "toolEnd", toolCallId, result, fileChange: webviewFileChange as any });
      } else {
        this.postMessage({ type: "toolEnd", toolCallId, result });
      }
    });

    this.agent.on("tokens:update", (total: number) => {
      this.postMessage({ type: "tokensUpdate", total });
    });

    this.agent.on("error", (message: string) => {
      this.postMessage({ type: "error", message });
    });

    this.agent.on("done", () => {
      this.postMessage({ type: "done" });
      vscode.commands.executeCommand("setContext", "minimax.isStreaming", false);
      this.refreshQuota();
      this.autoSaveSession();
    });
  }

  private openDiffEditor(fileChange: FileChangeData): void {
    const key = `${Date.now()}-${fileChange.filePath}`;
    const oldUri = this.oldContentProvider.set(key, fileChange.oldContent);
    const newUri = vscode.Uri.file(fileChange.filePath);
    const fileName = basename(fileChange.filePath);
    const title = fileChange.isNewFile
      ? `${fileName} (new file)`
      : `${fileName} (before ↔ after)`;

    vscode.commands.executeCommand("vscode.diff", oldUri, newUri, title);

    setTimeout(() => this.oldContentProvider.delete(key), 5_000);
  }

  private async handleWebviewMessage(msg: WebviewToExtension): Promise<void> {
    switch (msg.type) {
      case "ready": {
        this.postMessage({
          type: "configUpdate",
          model: this.model,
          theme: this.theme,
          mode: this.mode,
        });
        const hasKey = !!(await getApiKey(this.secrets));
        this.postMessage({ type: "apiKeyStatus", hasKey });
        break;
      }

      case "sendMessage":
        if (!this.agent) {
          await this.initializeClient();
        }
        if (this.agent) {
          vscode.commands.executeCommand("setContext", "minimax.isStreaming", true);
          await this.agent.sendMessage(msg.text, msg.fileContext);
        }
        break;

      case "cancelStream":
        this.agent?.cancel();
        break;

      case "setMode":
        this.mode = msg.mode;
        this.agent?.setMode(msg.mode);
        this.postMessage({ type: "configUpdate", model: this.model, theme: this.theme, mode: this.mode });
        break;

      case "setModel":
        this.model = msg.model;
        this.agent?.setModel(msg.model);
        await updateConfig("model", msg.model);
        this.postMessage({ type: "configUpdate", model: this.model, theme: this.theme, mode: this.mode });
        break;

      case "setTheme":
        this.theme = msg.theme;
        await updateConfig("theme", msg.theme);
        this.postMessage({ type: "configUpdate", model: this.model, theme: this.theme, mode: this.mode });
        break;

      case "newSession":
        await this.handleNewSession();
        break;

      case "loadSession":
        await this.handleLoadSession(msg.sessionId);
        break;

      case "deleteSession":
        await this.sessionManager.deleteSession(msg.sessionId);
        this.postMessage({ type: "sessionsList", sessions: this.sessionManager.getSummaries() });
        break;

      case "getSessions":
        this.postMessage({ type: "sessionsList", sessions: this.sessionManager.getSummaries() });
        break;

      case "setApiKey":
        await setApiKey(this.secrets, msg.key);
        this.postMessage({ type: "apiKeyStatus", hasKey: true });
        // Re-initialize client with new key
        await this.initializeClient();
        break;

      case "clearChat":
        this.agent?.clearHistory();
        break;

      case "syncMessages":
        this.webviewMessages = msg.messages;
        break;

      case "requestFileCompletion":
        await this.getFileCompletions(msg.query);
        break;
    }
  }

  private async getFileCompletions(query: string): Promise<void> {
    try {
      const pattern = query ? `**/*${query}*` : "**/*";
      const uris = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 20);
      const files = uris.map((u) => vscode.workspace.asRelativePath(u));
      this.postMessage({ type: "fileCompletions", files });
    } catch {
      this.postMessage({ type: "fileCompletions", files: [] });
    }
  }

  private async handleNewSession(): Promise<void> {
    // Save current session if it has messages
    await this.autoSaveSession();
    processManager.stopAll();
    // Start fresh
    this.currentSessionId = this.sessionManager.generateId();
    this.webviewMessages = [];
    this.agent?.clearHistory();
    this.postMessage({ type: "sessionLoaded", messages: [] });
  }

  private async handleLoadSession(sessionId: string): Promise<void> {
    // Save current first
    await this.autoSaveSession();

    const session = this.sessionManager.getSession(sessionId);
    if (!session) return;

    this.currentSessionId = session.id;
    this.webviewMessages = session.webviewMessages;

    // Restore agent history
    if (this.agent) {
      this.agent.clearHistory();
      this.agent.loadHistory(session.apiHistory);
    }

    this.postMessage({ type: "sessionLoaded", messages: session.webviewMessages });
  }

  private async autoSaveSession(): Promise<void> {
    if (!this.agent || this.webviewMessages.length === 0) return;
    await this.sessionManager.saveSession(
      this.currentSessionId,
      this.agent.getHistory(),
      this.webviewMessages
    );
  }

  private startQuotaPolling(): void {
    this.refreshQuota();
    this.quotaTimer = setInterval(() => this.refreshQuota(), 60_000);
  }

  private stopQuotaPolling(): void {
    if (this.quotaTimer) {
      clearInterval(this.quotaTimer);
      this.quotaTimer = undefined;
    }
  }

  private async refreshQuota(): Promise<void> {
    if (!this.apiKey) return;
    const quota = await fetchCodingPlanRemains(this.apiKey);
    if (quota) {
      this.postMessage({ type: "quotaUpdate", quota });
    }
  }

  cancelStream(): void {
    this.agent?.cancel();
  }

  toggleMode(): void {
    this.mode = this.mode === "PLAN" ? "BUILDER" : "PLAN";
    this.agent?.setMode(this.mode);
    this.postMessage({ type: "configUpdate", model: this.model, theme: this.theme, mode: this.mode });
  }

  clearChat(): void {
    this.agent?.clearHistory();
  }

  private postMessage(msg: ExtensionToWebview): void {
    this.view?.webview.postMessage(msg);
  }

  private getWebviewHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "out", "webview", "index.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "out", "webview", "index.css")
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>MiniMax Chat</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    processManager.stopAll();
    this.stopQuotaPolling();
    this.disposables.forEach((d) => d.dispose());
  }
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
