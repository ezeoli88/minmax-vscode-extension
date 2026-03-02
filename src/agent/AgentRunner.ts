import { EventEmitter } from "events";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { streamChat, type AccumulatedToolCall } from "../core/api";
import { getToolDefinitions, getReadOnlyToolDefinitions, getPlanToolDefinitions, executeTool, READ_ONLY_TOOL_NAMES } from "../core/tools";
import { SubAgentManager } from "./SubAgentManager";
import type { ExplorerTask } from "./SubAgentManager";
import { killActiveProcess } from "../tools/bash";
import { parseModelOutput, coerceArg, type ParsedToolCall } from "../core/parser";
import { existsSync, readFileSync } from "fs";
import { readFile } from "fs/promises";
import { join, extname, isAbsolute, resolve } from "path";
import { structuredPatch } from "diff";
import type { AgentMode, SerializedToolCall, DiffLine, FileChangeData } from "../shared/protocol";

export const MAX_CONTEXT_TOKENS = 200_000;

export class AgentRunner extends EventEmitter {
  private client: OpenAI;
  private model: string;
  private mode: AgentMode;
  private cwd: string;
  private history: ChatCompletionMessageParam[] = [];
  private totalTokens = 0;
  private promptTokens = 0;
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
    this.promptTokens = 0;
  }

  loadHistory(msgs: ChatCompletionMessageParam[], promptTokens?: number) {
    this.history = msgs;
    if (promptTokens !== undefined) {
      this.promptTokens = promptTokens;
    }
  }

  truncateHistory(length: number) {
    this.history = this.history.slice(0, length);
  }

  setPromptTokens(tokens: number) {
    this.promptTokens = tokens;
  }

  getHistory(): ChatCompletionMessageParam[] {
    return this.history;
  }

  getTotalTokens(): number {
    return this.totalTokens;
  }

  getPromptTokens(): number {
    return this.promptTokens;
  }

  private getSystemPrompt(): string {
    let systemPrompt: string;

    if (this.mode === "PLAN") {
      systemPrompt = `You are a coding assistant in VS Code (READ-ONLY mode).
Working directory: ${this.cwd}

Available tools: read_file, glob, grep, list_directory (read-only), and spawn_explorers (parallel research).
You CANNOT write, edit, or run commands. Do NOT attempt to call tools like edit_file, write_file, or bash.

PARALLEL EXPLORATION:
- Use spawn_explorers when you need to investigate multiple independent aspects of the codebase at once
- Each explorer runs in parallel with read-only tools and returns a summary
- Example: researching auth patterns + analyzing test structure + reading config files simultaneously
- Max 3 explorers at a time, each with a short description and detailed instruction

IMPORTANT: When the user asks you to implement, modify, create, or delete anything, you MUST:
1. Explain what changes would be needed
2. Explicitly tell the user to switch to BUILDER mode to apply the changes (they can press Tab in the input box or click the mode toggle in the status bar)

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
- NEVER start a server automatically. Always ASK the user first:
  - For frontend projects: ask "Do you want me to start the dev server and open the browser so you can see the result?"
  - For backend/API projects: ask "Do you want me to start the server and test the endpoints with curl?"
- Only after the user confirms, proceed with:
  - bash_bg to start the server: bash_bg({command: "npm run dev", port: 3000})
  - For frontend: open_browser to preview in VSCode
  - For backend: bash("curl http://localhost:PORT/...") to test endpoints
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
          : getPlanToolDefinitions();

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

        this.promptTokens = result.usage?.prompt_tokens || 0;
        this.emit("context:update", this.promptTokens, MAX_CONTEXT_TOKENS);

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
            // Stop executing tool calls if abort was signalled
            if (abort.signal.aborted) break;

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
              if (toolName === "spawn_explorers") {
                toolResult = await this.handleSpawnExplorers(args, abort.signal);
              } else if (this.mode === "PLAN" && !READ_ONLY_TOOL_NAMES.has(toolName)) {
                toolResult = `Error: Tool "${toolName}" is not available in PLAN mode. You MUST tell the user to switch to BUILDER mode (by pressing Tab or clicking the mode toggle) to apply these changes.`;
              } else {
                toolResult = await executeTool(toolName, args, abort.signal);
              }
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

          continueLoop = !abort.signal.aborted;
        }
      }
    } catch (err: any) {
      this.emit("error", err.message || String(err));
    } finally {
      this.abortController = null;
      this.emit("done");
    }
  }

  private async handleSpawnExplorers(args: Record<string, any>, signal?: AbortSignal): Promise<string> {
    const tasks: ExplorerTask[] = args.tasks || [];
    if (tasks.length === 0) {
      return "Error: No tasks provided to spawn_explorers.";
    }

    const manager = new SubAgentManager(this.client, this.model, this.cwd);

    // Forward sub-agent events through this AgentRunner
    manager.on("explorer:start", (taskId: string, description: string) => {
      this.emit("subagent:start", taskId, description);
    });
    manager.on("explorer:tool", (taskId: string, toolName: string) => {
      this.emit("subagent:progress", taskId, toolName);
    });
    manager.on("explorer:done", (taskId: string, summary: string) => {
      this.emit("subagent:done", taskId, summary);
    });
    manager.on("explorer:error", (taskId: string, error: string) => {
      this.emit("subagent:error", taskId, error);
    });

    const results = await manager.runExplorers(tasks, signal);

    // Format results as a readable tool_result
    const sections = results.map((r) => {
      const statusIcon = r.status === "completed" ? "[OK]" : r.status === "cancelled" ? "[CANCELLED]" : "[ERROR]";
      return `### ${statusIcon} ${r.description}\nTools used: ${r.toolsUsed.join(", ") || "none"}\n\n${r.summary}`;
    });

    return `## Explorer Results\n\n${sections.join("\n\n---\n\n")}`;
  }

  async compactContext(): Promise<{ success: boolean; promptTokens: number }> {
    if (this.history.length === 0) {
      return { success: true, promptTokens: this.promptTokens };
    }

    try {
      const summarySystemPrompt = `You are a conversation summarizer. Your task is to create a concise but comprehensive summary of the conversation that has taken place. This summary will replace the full conversation history to reduce context usage while preserving essential information.

Preserve:
- Key decisions and requirements discussed
- Current state of the task and what was accomplished
- Important file paths, code snippets, and technical details referenced
- Any pending actions or next steps
- Errors encountered and how they were resolved

Format as a structured summary that allows the assistant to continue the conversation seamlessly. Be concise but do not omit critical details.`;

      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: summarySystemPrompt },
        ...this.history,
        { role: "user", content: "Summarize the conversation above into a concise context document that preserves all essential information for continuing the work." },
      ];

      const result = await streamChat(
        this.client,
        this.model,
        messages,
        undefined,
        {},
      );

      const summary = result.content;
      if (!summary) {
        return { success: false, promptTokens: this.promptTokens };
      }

      // Replace history with the compacted summary
      this.history = [
        {
          role: "user",
          content: `[Previous conversation summary]\n\n${summary}\n\n[End of summary — the conversation continues from here]`,
        },
        {
          role: "assistant",
          content: "Understood. I have the context from our previous conversation. I'm ready to continue. What would you like to do next?",
        },
      ];

      // Update prompt tokens estimate based on the compression result
      this.promptTokens = result.usage?.prompt_tokens
        ? Math.round(result.usage.prompt_tokens * 0.15)
        : Math.round(this.promptTokens * 0.2);

      this.emit("context:update", this.promptTokens, MAX_CONTEXT_TOKENS);
      return { success: true, promptTokens: this.promptTokens };
    } catch (err: any) {
      this.emit("error", `Context compression failed: ${err.message}`);
      return { success: false, promptTokens: this.promptTokens };
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
