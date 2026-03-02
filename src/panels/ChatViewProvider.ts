import * as vscode from "vscode";
import { writeFile, unlink, readFile } from "fs/promises";
import { existsSync } from "fs";
import { basename } from "path";
import type OpenAI from "openai";
import { createClient, fetchCodingPlanRemains } from "../core/api";
import { AgentRunner } from "../agent/AgentRunner";
import { loadConfig, getApiKey, setApiKey, updateConfig } from "../config/settings";
import { themes } from "../config/themes";
import { SessionManager } from "../core/sessions";
import type { AgentMode, CheckpointData, CheckpointSummary, ExtensionToWebview, FileChangeData, FileChangeSummary, WebviewToExtension } from "../shared/protocol";
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
  private sessionFileChanges = new Map<string, FileChangeData>();
  private checkpoints: CheckpointData[] = [];
  private originalFileContents = new Map<string, { content: string; existed: boolean }>();

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
        this.trackFileChange(fileChange);
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

    this.agent.on("context:update", (promptTokens: number, maxTokens: number) => {
      this.postMessage({ type: "contextUpdate", promptTokens, maxTokens });
    });

    this.agent.on("error", (message: string) => {
      this.postMessage({ type: "error", message });
    });

    this.agent.on("done", () => {
      this.postMessage({ type: "done" });
      vscode.commands.executeCommand("setContext", "minimax.isStreaming", false);
      this.refreshQuota();
      this.autoSaveSession();
      this.sendFileChangesList();
    });

    // Sub-agent events
    this.agent.on("subagent:start", (taskId: string, description: string) => {
      this.postMessage({ type: "subAgentStart", taskId, description });
    });

    this.agent.on("subagent:progress", (taskId: string, toolName: string) => {
      this.postMessage({ type: "subAgentProgress", taskId, toolName });
    });

    this.agent.on("subagent:done", (taskId: string, summary: string) => {
      this.postMessage({ type: "subAgentDone", taskId, summary });
    });

    this.agent.on("subagent:error", (taskId: string, error: string) => {
      this.postMessage({ type: "subAgentError", taskId, error });
    });
  }

  private trackFileChange(fileChange: FileChangeData): void {
    // Track original file content for checkpoint restore
    if (!this.originalFileContents.has(fileChange.filePath)) {
      this.originalFileContents.set(fileChange.filePath, {
        content: fileChange.oldContent,
        existed: !fileChange.isNewFile,
      });
    }

    const existing = this.sessionFileChanges.get(fileChange.filePath);
    if (existing) {
      // Preserve the original oldContent, update the rest
      this.sessionFileChanges.set(fileChange.filePath, {
        ...fileChange,
        oldContent: existing.oldContent,
      });
    } else {
      this.sessionFileChanges.set(fileChange.filePath, fileChange);
    }
  }

  private async openDiffEditor(fileChange: FileChangeData): Promise<void> {
    const key = `${this.currentSessionId}-${fileChange.filePath}`;
    const oldUri = this.oldContentProvider.set(key, fileChange.oldContent);
    const newUri = vscode.Uri.file(fileChange.filePath);
    const fileName = basename(fileChange.filePath);
    const title = fileChange.isNewFile
      ? `${fileName} (new file)`
      : `${fileName} (before ↔ after)`;

    await vscode.commands.executeCommand("vscode.diff", oldUri, newUri, title);
    await vscode.commands.executeCommand("workbench.action.keepEditor");
  }

  private async reopenDiffEditor(filePath: string): Promise<void> {
    const fileChange = this.sessionFileChanges.get(filePath);
    if (!fileChange) return;

    const key = `${this.currentSessionId}-${filePath}`;
    const oldUri = this.oldContentProvider.set(key, fileChange.oldContent);
    const newUri = vscode.Uri.file(filePath);
    const fileName = basename(filePath);
    const title = fileChange.isNewFile
      ? `${fileName} (new file)`
      : `${fileName} (before ↔ after)`;

    await vscode.commands.executeCommand("vscode.diff", oldUri, newUri, title);
    await vscode.commands.executeCommand("workbench.action.keepEditor");
  }

  private sendFileChangesList(): void {
    const changes: FileChangeSummary[] = [];
    for (const [filePath, fc] of this.sessionFileChanges) {
      const addedLines = fc.diffLines.filter((l) => l.type === "added").length;
      const removedLines = fc.diffLines.filter((l) => l.type === "removed").length;
      changes.push({
        filePath,
        isNewFile: fc.isNewFile,
        addedLines,
        removedLines,
        language: fc.language,
      });
    }
    this.postMessage({ type: "fileChangesList", changes });
  }

  private async acceptFileChange(filePath: string): Promise<void> {
    this.sessionFileChanges.delete(filePath);
    this.oldContentProvider.delete(`${this.currentSessionId}-${filePath}`);
    this.sendFileChangesList();
  }

  private async rejectFileChange(filePath: string): Promise<void> {
    const fc = this.sessionFileChanges.get(filePath);
    if (!fc) return;
    if (fc.isNewFile) {
      await unlink(filePath);
    } else {
      await writeFile(filePath, fc.oldContent, "utf-8");
    }
    this.sessionFileChanges.delete(filePath);
    this.oldContentProvider.delete(`${this.currentSessionId}-${filePath}`);
    this.sendFileChangesList();
  }

  private async acceptAllChanges(): Promise<void> {
    for (const filePath of this.sessionFileChanges.keys()) {
      await this.acceptFileChange(filePath);
    }
  }

  private async rejectAllChanges(): Promise<void> {
    for (const filePath of Array.from(this.sessionFileChanges.keys())) {
      await this.rejectFileChange(filePath);
    }
  }

  private async createCheckpoint(userMessage: string): Promise<void> {
    const label = userMessage.length <= 40
      ? `Before: "${userMessage}"`
      : `Before: "${userMessage.slice(0, 37)}..."`;

    const fileSnapshots: CheckpointData["fileSnapshots"] = [];

    // Snapshot current on-disk content for every file the agent has touched
    for (const filePath of this.originalFileContents.keys()) {
      try {
        if (existsSync(filePath)) {
          const content = await readFile(filePath, "utf-8");
          fileSnapshots.push({ filePath, content, existed: true });
        } else {
          fileSnapshots.push({ filePath, content: null, existed: false });
        }
      } catch {
        // Skip files we can't read
      }
    }

    const checkpoint: CheckpointData = {
      id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      messageIndex: this.webviewMessages.length,
      apiHistoryLength: this.agent?.getHistory().length ?? 0,
      fileSnapshots,
      promptTokens: this.agent?.getPromptTokens() ?? 0,
      label,
    };

    this.checkpoints.push(checkpoint);

    // Limit to 20 checkpoints, keep the first one (initial state)
    if (this.checkpoints.length > 20) {
      this.checkpoints.splice(1, 1);
    }

    this.sendCheckpointsUpdate();
  }

  private async restoreCheckpoint(checkpointId: string): Promise<void> {
    const cpIndex = this.checkpoints.findIndex(cp => cp.id === checkpointId);
    if (cpIndex < 0) return;
    const checkpoint = this.checkpoints[cpIndex];

    // Build a set of file paths in the checkpoint snapshot
    const snapshotPaths = new Set(checkpoint.fileSnapshots.map(s => s.filePath));

    // 1. Restore files from checkpoint snapshot
    for (const snapshot of checkpoint.fileSnapshots) {
      try {
        if (snapshot.existed && snapshot.content !== null) {
          await writeFile(snapshot.filePath, snapshot.content, "utf-8");
        } else if (!snapshot.existed) {
          // File should not exist at this checkpoint
          if (existsSync(snapshot.filePath)) {
            await unlink(snapshot.filePath);
          }
        }
      } catch {
        // Skip files we can't restore
      }
    }

    // 2. Revert files touched AFTER this checkpoint (not in snapshot) to original state
    for (const [filePath, original] of this.originalFileContents) {
      if (snapshotPaths.has(filePath)) continue;
      try {
        if (original.existed) {
          await writeFile(filePath, original.content, "utf-8");
        } else {
          if (existsSync(filePath)) {
            await unlink(filePath);
          }
        }
      } catch {
        // Skip
      }
    }

    // 3. Truncate agent history
    if (this.agent) {
      this.agent.truncateHistory(checkpoint.apiHistoryLength);
      this.agent.setPromptTokens(checkpoint.promptTokens);
    }

    // 4. Truncate webview messages
    this.webviewMessages = this.webviewMessages.slice(0, checkpoint.messageIndex);

    // 5. Remove checkpoints after this one (and the restored one itself to avoid messageIndex collision)
    this.checkpoints = this.checkpoints.slice(0, cpIndex);

    // 6. Clear file change tracking
    this.sessionFileChanges.clear();
    this.oldContentProvider.clearAll();

    // 7. Rebuild originalFileContents from remaining checkpoint snapshots
    // Keep only files that were tracked up to this checkpoint
    const stillTrackedFiles = new Set<string>();
    for (const cp of this.checkpoints) {
      for (const s of cp.fileSnapshots) {
        stillTrackedFiles.add(s.filePath);
      }
    }
    for (const filePath of Array.from(this.originalFileContents.keys())) {
      if (!stillTrackedFiles.has(filePath)) {
        this.originalFileContents.delete(filePath);
      }
    }

    // 8. Notify webview
    this.postMessage({
      type: "checkpointRestored",
      messages: this.webviewMessages,
      checkpoints: this.getCheckpointSummaries(),
      promptTokens: checkpoint.promptTokens,
      maxTokens: 200_000,
    });

    this.sendFileChangesList();

    // 9. Save session
    await this.autoSaveSession();
  }

  private getCheckpointSummaries(): CheckpointSummary[] {
    return this.checkpoints.map(cp => ({
      id: cp.id,
      createdAt: cp.createdAt,
      messageIndex: cp.messageIndex,
      label: cp.label,
    }));
  }

  private sendCheckpointsUpdate(): void {
    this.postMessage({
      type: "checkpointsUpdate",
      checkpoints: this.getCheckpointSummaries(),
    });
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
          await this.createCheckpoint(msg.text);
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
        this.sessionFileChanges.clear();
        this.oldContentProvider.clearAll();
        this.checkpoints = [];
        this.originalFileContents.clear();
        this.sendCheckpointsUpdate();
        break;

      case "compactContext":
        if (this.agent) {
          const result = await this.agent.compactContext();
          this.postMessage({ type: "compactResult", success: result.success, promptTokens: result.promptTokens });
        }
        break;

      case "syncMessages":
        this.webviewMessages = msg.messages;
        break;

      case "requestFileCompletion":
        await this.getFileCompletions(msg.query);
        break;

      case "openFileChange":
        await this.reopenDiffEditor(msg.filePath);
        break;

      case "getFileChanges":
        this.sendFileChangesList();
        break;

      case "acceptFileChange":
        await this.acceptFileChange(msg.filePath);
        break;

      case "rejectFileChange":
        await this.rejectFileChange(msg.filePath);
        break;

      case "acceptAllChanges":
        await this.acceptAllChanges();
        break;

      case "rejectAllChanges":
        await this.rejectAllChanges();
        break;

      case "restoreCheckpoint":
        await this.restoreCheckpoint(msg.checkpointId);
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
    this.sessionFileChanges.clear();
    this.oldContentProvider.clearAll();
    this.checkpoints = [];
    this.originalFileContents.clear();
    this.agent?.clearHistory();
    this.postMessage({ type: "sessionLoaded", messages: [], promptTokens: 0, maxTokens: 200_000 });
    this.sendCheckpointsUpdate();
  }

  private async handleLoadSession(sessionId: string): Promise<void> {
    // Save current first
    await this.autoSaveSession();

    const session = this.sessionManager.getSession(sessionId);
    if (!session) return;

    this.currentSessionId = session.id;
    this.webviewMessages = session.webviewMessages;
    this.sessionFileChanges.clear();
    this.oldContentProvider.clearAll();
    this.checkpoints = [];
    this.originalFileContents.clear();

    // Restore agent history
    if (this.agent) {
      this.agent.clearHistory();
      this.agent.loadHistory(session.apiHistory, session.promptTokens);
    }

    this.postMessage({
      type: "sessionLoaded",
      messages: session.webviewMessages,
      promptTokens: session.promptTokens ?? 0,
      maxTokens: 200_000,
    });
    this.sendCheckpointsUpdate();
  }

  private async autoSaveSession(): Promise<void> {
    if (!this.agent || this.webviewMessages.length === 0) return;
    await this.sessionManager.saveSession(
      this.currentSessionId,
      this.agent.getHistory(),
      this.webviewMessages,
      this.agent.getPromptTokens()
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
    this.sessionFileChanges.clear();
    this.oldContentProvider.clearAll();
    this.checkpoints = [];
    this.originalFileContents.clear();
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
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
