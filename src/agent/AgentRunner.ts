import { EventEmitter } from "events";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { streamChat, type AccumulatedToolCall } from "../core/api";
import { getToolDefinitions, getReadOnlyToolDefinitions, executeTool } from "../core/tools";
import { killActiveProcess } from "../tools/bash";
import { parseModelOutput, coerceArg, type ParsedToolCall } from "../core/parser";
import { existsSync, readFileSync } from "fs";
import { readFile } from "fs/promises";
import { join, extname, isAbsolute, resolve } from "path";
import { structuredPatch } from "diff";
import type { AgentMode, SerializedToolCall, DiffLine, FileChangeData } from "../shared/protocol";

export class AgentRunner extends EventEmitter {
  private client: OpenAI;
  private model: string;
  private mode: AgentMode;
  private cwd: string;
  private history: ChatCompletionMessageParam[] = [];
  private totalTokens = 0;
  private abortController: AbortController | null = null;

  constructor(opts: { client: OpenAI; model: string; mode: AgentMode; cwd: string }) {
    super();
    this.client = opts.client;
    this.model = opts.model;
    this.mode = opts.mode;
    this.cwd = opts.cwd;
  }

  setMode(mode: AgentMode) {
    this.mode = mode;
  }

  setModel(model: string) {
    this.model = model;
  }

  cancel() {
    killActiveProcess();
    this.abortController?.abort();
  }

  clearHistory() {
    this.history = [];
    this.totalTokens = 0;
  }

  loadHistory(msgs: ChatCompletionMessageParam[]) {
    this.history = msgs;
  }

  getHistory(): ChatCompletionMessageParam[] {
    return this.history;
  }

  getTotalTokens(): number {
    return this.totalTokens;
  }

  private getSystemPrompt(): string {
    let systemPrompt: string;

    if (this.mode === "PLAN") {
      systemPrompt = `You are a coding assistant in VS Code (READ-ONLY mode).
Working directory: ${this.cwd}

Available tools: read_file, glob, grep, list_directory (read-only).
You CANNOT write, edit, or run commands. Tell the user to switch to BUILDER mode for modifications.
Focus on: analysis, planning, explaining code, suggesting strategies.`;
    } else {
      systemPrompt = `You are a coding assistant in VS Code.
Working directory: ${this.cwd}

TOOL USAGE:
- Read before editing: always use read_file before edit_file to see current content
- Use edit_file for modifications to existing files, write_file only for new files
- Use glob/grep to find files before reading them
- Use bash for git, npm install, and other quick CLI operations
- Execute one logical step at a time, verify results, then proceed

BACKGROUND SERVERS:
- NEVER use bash for long-running processes (dev servers, watchers, etc.) — it blocks the assistant
- Use bash_bg to start dev servers: bash_bg({command: "npm run dev", port: 3000})
- For frontend: bash_bg to start server, then open_browser to preview in VSCode
- For backend/API: bash_bg to start server, then bash("curl http://localhost:PORT/...") to test endpoints
- Use list_servers to check running processes
- Always use stop_server when done testing or before starting a new server on the same port

Be concise. Show relevant code, skip obvious explanations.`;
    }

    const agentPath = join(this.cwd, "agent.md");
    if (existsSync(agentPath)) {
      try {
        const agentContent = readFileSync(agentPath, "utf-8");
        systemPrompt += `\n\n--- agent.md ---\n${agentContent}`;
      } catch {
        // ignore
      }
    }

    return systemPrompt;
  }

  private buildMessages(): ChatCompletionMessageParam[] {
    return [
      { role: "system" as const, content: this.getSystemPrompt() },
      ...this.history,
    ];
  }

  async sendMessage(userInput: string, fileContext?: string): Promise<void> {
    const apiContent = fileContext
      ? `${fileContext}\n\nUser request: ${userInput}`
      : userInput;

    this.history.push({ role: "user", content: apiContent });

    try {
      let continueLoop = true;
      while (continueLoop) {
        continueLoop = false;

        const abort = new AbortController();
        this.abortController = abort;

        let rawBuffer = "";
        let structuredReasoning = "";
        let streamErrorMsg = "";

        const tools = this.mode === "BUILDER"
          ? getToolDefinitions()
          : getReadOnlyToolDefinitions();

        const fullHistory = this.buildMessages();

        const result = await streamChat(
          this.client,
          this.model,
          fullHistory,
          tools,
          {
            onReasoningChunk: (chunk) => {
              structuredReasoning += chunk;
              this.emit("reasoning:delta", chunk);
            },
            onContentChunk: (chunk) => {
              rawBuffer += chunk;
              const parsed = parseModelOutput(rawBuffer);
              const combinedReasoning = [structuredReasoning, parsed.reasoning]
                .filter(Boolean)
                .join("\n");
              this.emit("content:delta", chunk, parsed.content, combinedReasoning);
            },
            onToolCallDelta: (tcs) => {
              this.emit("toolcalls:delta", tcs as SerializedToolCall[]);
            },
            onError: (err) => {
              streamErrorMsg = err.message || String(err);
            },
          },
          abort.signal
        );

        this.totalTokens += result.usage?.total_tokens || 0;
        this.emit("tokens:update", this.totalTokens);

        // Final parse
        const parsed = parseModelOutput(rawBuffer);
        const combinedReasoning = [structuredReasoning, parsed.reasoning]
          .filter(Boolean)
          .join("\n");

        // Merge structured tool_calls from API, fallback to XML-parsed
        let finalToolCalls = result.toolCalls;

        if (finalToolCalls.length === 0 && parsed.toolCalls.length > 0) {
          finalToolCalls = parsed.toolCalls.map((tc, i) => ({
            id: `xml_tc_${Date.now()}_${i}`,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(
                Object.fromEntries(
                  Object.entries(tc.arguments).map(([k, v]) => [k, coerceArg(v)])
                )
              ),
            },
          }));
        }

        // Build final content
        let finalContent = parsed.content;
        if (streamErrorMsg) {
          finalContent = finalContent
            ? `${finalContent}\n\n[Error: ${streamErrorMsg}]`
            : `Error: ${streamErrorMsg}`;
        } else if (!finalContent && finalToolCalls.length === 0 && rawBuffer.length > 0) {
          finalContent = "[Response truncated — the model's output was cut off mid-tool-call]\n\n"
            + rawBuffer.slice(0, 500)
            + (rawBuffer.length > 500 ? "..." : "");
        } else if (!finalContent && finalToolCalls.length === 0 && rawBuffer.length === 0) {
          finalContent = "[Empty response from API — the model returned nothing"
            + (result.finishReason ? ` (finish_reason: ${result.finishReason})` : "")
            + "]";
        }

        this.emit("message:complete", finalContent, combinedReasoning || undefined, finalToolCalls.length > 0 ? finalToolCalls : undefined);

        // Push to history
        const historyMsg: any = {
          role: "assistant" as const,
          content: result.content || "",
        };
        if (result.reasoningDetails.length > 0) {
          historyMsg.reasoning_details = result.reasoningDetails;
        }
        if (result.toolCalls.length > 0) {
          historyMsg.tool_calls = result.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.function.name, arguments: tc.function.arguments },
          }));
        }
        this.history.push(historyMsg);

        // Don't continue if stream error
        if (streamErrorMsg) break;

        // Execute tool calls
        if (finalToolCalls.length > 0) {
          for (const tc of finalToolCalls) {
            let args: Record<string, any> = {};
            try {
              args = JSON.parse(tc.function.arguments || "{}");
            } catch {
              args = {};
            }

            this.emit("tool:start", tc.id, tc.function.name, tc.function.arguments);

            // Capture old content before file-modifying tools
            const toolName = tc.function.name;
            const isFileModifyTool = toolName === "write_file" || toolName === "edit_file";
            let oldContent: string | null = null;
            let filePath: string | undefined;

            if (isFileModifyTool && args.path) {
              filePath = isAbsolute(args.path) ? args.path : resolve(this.cwd, args.path);
              try {
                oldContent = await readFile(filePath!, "utf-8");
              } catch {
                oldContent = null; // new file
              }
            }

            let toolResult: string;
            try {
              toolResult = await executeTool(toolName, args, abort.signal);
            } catch (err: any) {
              toolResult = `Error: ${err.message}`;
            }

            // Compute diff for file-modifying tools (only on success)
            let fileChange: FileChangeData | undefined;
            if (isFileModifyTool && filePath && !toolResult.startsWith("Error")) {
              fileChange = await this.computeFileChange(filePath, oldContent);
            }

            this.emit("tool:end", tc.id, toolResult, fileChange);

            this.history.push({
              role: "tool" as const,
              content: toolResult,
              tool_call_id: tc.id,
            });
          }

          continueLoop = true;
        }
      }
    } catch (err: any) {
      this.emit("error", err.message || String(err));
    } finally {
      this.abortController = null;
      this.emit("done");
    }
  }

  private async computeFileChange(filePath: string, oldContent: string | null): Promise<FileChangeData | undefined> {
    try {
      const newContent = await readFile(filePath, "utf-8");
      const isNewFile = oldContent === null;
      const old = oldContent ?? "";

      const patch = structuredPatch("a", "b", old, newContent, "", "", { context: 3 });

      const diffLines: DiffLine[] = [];
      for (const hunk of patch.hunks) {
        for (const line of hunk.lines) {
          if (line.startsWith("+")) {
            diffLines.push({ type: "added", content: line.slice(1) });
          } else if (line.startsWith("-")) {
            diffLines.push({ type: "removed", content: line.slice(1) });
          } else {
            diffLines.push({ type: "context", content: line.slice(1) });
          }
        }
      }

      const ext = extname(filePath).slice(1);
      const langMap: Record<string, string> = {
        ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
        py: "python", rs: "rust", go: "go", md: "markdown", json: "json",
        css: "css", html: "html", yml: "yaml", yaml: "yaml",
      };

      return {
        filePath,
        isNewFile,
        diffLines,
        language: langMap[ext] || ext || "text",
        oldContent: old,
      };
    } catch {
      return undefined;
    }
  }
}
