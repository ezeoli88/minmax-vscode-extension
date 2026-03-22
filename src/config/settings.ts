import * as vscode from "vscode";
import type { AgentMode } from "../shared/protocol";

export interface MiniMaxConfig {
  model: string;
  theme: string;
  defaultMode: AgentMode;
  mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
}

export function loadConfig(): MiniMaxConfig {
  const config = vscode.workspace.getConfiguration("minimax");
  return {
    model: config.get<string>("model", "MiniMax-M2.7"),
    theme: config.get<string>("theme", "tokyo-night"),
    defaultMode: config.get<AgentMode>("defaultMode", "BUILDER"),
    mcpServers: config.get<MiniMaxConfig["mcpServers"]>("mcpServers", {}),
  };
}

export async function updateConfig(key: string, value: any): Promise<void> {
  const config = vscode.workspace.getConfiguration("minimax");
  await config.update(key, value, vscode.ConfigurationTarget.Global);
}

export async function getApiKey(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get("minimax.apiKey");
}

export async function setApiKey(secrets: vscode.SecretStorage, key: string): Promise<void> {
  await secrets.store("minimax.apiKey", key);
}
