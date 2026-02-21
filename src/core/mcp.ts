import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type OpenAI from "openai";

interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface MCPConnection {
  client: Client;
  transport: StdioClientTransport;
  tools: Map<string, { serverName: string; toolName: string; inputSchema: any }>;
}

const connections = new Map<string, MCPConnection>();

export async function initMCPServers(
  servers: Record<string, MCPServerConfig>
): Promise<string[]> {
  const connectedTools: string[] = [];

  for (const [serverName, config] of Object.entries(servers)) {
    try {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: config.env
          ? { ...process.env, ...config.env } as Record<string, string>
          : undefined,
      });

      const client = new Client(
        { name: "minmax-vscode", version: "0.1.0" },
        { capabilities: {} }
      );

      await client.connect(transport);

      const { tools } = await client.listTools();
      const toolMap = new Map<string, { serverName: string; toolName: string; inputSchema: any }>();

      for (const tool of tools) {
        const prefixed = `mcp__${serverName}__${tool.name}`;
        toolMap.set(prefixed, {
          serverName,
          toolName: tool.name,
          inputSchema: tool.inputSchema,
        });
        connectedTools.push(prefixed);
      }

      connections.set(serverName, { client, transport, tools: toolMap });
    } catch (err: any) {
      console.error(`Failed to connect MCP server "${serverName}": ${err.message}`);
    }
  }

  return connectedTools;
}

export function getMCPToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const defs: OpenAI.Chat.Completions.ChatCompletionTool[] = [];

  for (const conn of connections.values()) {
    for (const [prefixed, info] of conn.tools) {
      defs.push({
        type: "function",
        function: {
          name: prefixed,
          description: `[MCP:${info.serverName}] ${info.toolName}`,
          parameters: info.inputSchema || { type: "object", properties: {} },
        },
      });
    }
  }

  return defs;
}

export async function callMCPTool(
  prefixedName: string,
  args: Record<string, any>
): Promise<string> {
  for (const conn of connections.values()) {
    const toolInfo = conn.tools.get(prefixedName);
    if (toolInfo) {
      try {
        const result = await conn.client.callTool({
          name: toolInfo.toolName,
          arguments: args,
        });
        if (result.content && Array.isArray(result.content)) {
          return result.content
            .map((c: any) => (c.type === "text" ? c.text : JSON.stringify(c)))
            .join("\n");
        }
        return JSON.stringify(result);
      } catch (err: any) {
        return `MCP Error: ${err.message}`;
      }
    }
  }
  return `Error: MCP tool "${prefixedName}" not found`;
}

export async function shutdownMCPServers(): Promise<void> {
  for (const [name, conn] of connections) {
    try {
      await conn.client.close();
    } catch {
      // ignore shutdown errors
    }
  }
  connections.clear();
}
