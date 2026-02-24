import type OpenAI from "openai";
import * as bashTool from "../tools/bash";
import * as readFileTool from "../tools/read-file";
import * as writeFileTool from "../tools/write-file";
import * as editFileTool from "../tools/edit-file";
import * as globTool from "../tools/glob";
import * as grepTool from "../tools/grep";
import * as listDirTool from "../tools/list-dir";
import * as bashBgTool from "../tools/bash-bg";
import * as openBrowserTool from "../tools/open-browser";
import * as stopServerTool from "../tools/stop-server";
import * as listServersTool from "../tools/list-servers";
import { callMCPTool, getMCPToolDefinitions } from "./mcp";

interface ToolModule {
  definition: OpenAI.Chat.Completions.ChatCompletionTool;
  execute: (args: any) => Promise<any>;
}

const builtinTools: ToolModule[] = [
  bashTool,
  readFileTool,
  writeFileTool,
  editFileTool,
  globTool,
  grepTool,
  listDirTool,
  bashBgTool,
  openBrowserTool,
  stopServerTool,
  listServersTool,
];

const TOOL_REGISTRY = new Map<string, (args: any) => Promise<any>>();

for (const tool of builtinTools) {
  TOOL_REGISTRY.set(tool.definition.function.name, tool.execute);
}

export const READ_ONLY_TOOL_NAMES = new Set(["read_file", "glob", "grep", "list_directory"]);

export function getToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const builtinDefs = builtinTools.map((t) => t.definition);
  const mcpDefs = getMCPToolDefinitions();
  return [...builtinDefs, ...mcpDefs];
}

export function getReadOnlyToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return builtinTools
    .filter((t) => READ_ONLY_TOOL_NAMES.has(t.definition.function.name))
    .map((t) => t.definition);
}

export async function executeTool(
  name: string,
  args: Record<string, any>,
  signal?: AbortSignal
): Promise<string> {
  // Check built-in tools first
  const builtinFn = TOOL_REGISTRY.get(name);
  if (builtinFn) {
    // Pass signal to bash tool for cancellation support
    const result = name === "bash"
      ? await builtinFn(args, signal)
      : await builtinFn(args);
    if (typeof result === "string") return result;
    return JSON.stringify(result, null, 2);
  }

  // Check MCP tools (prefixed with mcp__)
  if (name.startsWith("mcp__")) {
    return await callMCPTool(name, args);
  }

  return `Error: Unknown tool "${name}"`;
}
