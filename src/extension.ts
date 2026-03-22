import * as vscode from "vscode";
import { ChatViewProvider } from "./panels/ChatViewProvider";
import { loadConfig, setApiKey } from "./config/settings";
import { initMCPServers, shutdownMCPServers } from "./core/mcp";
import { processManager } from "./core/process-manager";

let provider: ChatViewProvider | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const config = loadConfig();

  // Initialize MCP servers
  if (Object.keys(config.mcpServers).length > 0) {
    try {
      const tools = await initMCPServers(config.mcpServers);
      if (tools.length > 0) {
        vscode.window.showInformationMessage(`MiniMax: Connected ${tools.length} MCP tools`);
      }
    } catch (err: any) {
      console.error("MCP init error:", err);
    }
  }

  provider = new ChatViewProvider(context.extensionUri, context.secrets, context.globalState);

  // Register webview view provider for the sidebar
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("minimax.openChat", () => {
      provider?.revealView();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("minimax.setApiKey", async () => {
      const key = await vscode.window.showInputBox({
        prompt: "Enter your MiniMax API key",
        password: true,
        placeHolder: "sk-...",
      });
      if (key) {
        await setApiKey(context.secrets, key);
        vscode.window.showInformationMessage("MiniMax API key saved.");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("minimax.cancelStream", () => {
      provider?.cancelStream();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("minimax.toggleMode", () => {
      provider?.toggleMode();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("minimax.clearChat", () => {
      provider?.clearChat();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("minimax.resetWhatsNew", () => {
      context.globalState.update("minimax.lastSeenWhatsNewVersion", undefined);
      vscode.window.showInformationMessage("MiniMax: What's New reset. Reload to see it again.");
    })
  );

  // Status bar
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(comment-discussion) MiniMax";
  statusBarItem.command = "minimax.openChat";
  statusBarItem.tooltip = "Open MiniMax Chat";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

export function deactivate() {
  processManager.stopAll();
  shutdownMCPServers();
  provider?.dispose();
}
