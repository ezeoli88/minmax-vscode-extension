import { EventEmitter } from "events";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { streamChat } from "../core/api";
import { getReadOnlyToolDefinitions, executeTool } from "../core/tools";

const MAX_TURNS = 3;
const MAX_EXPLORERS = 3;

export interface ExplorerTask {
  id: string;
  description: string;
  instruction: string;
}

export interface ExplorerResult {
  taskId: string;
  description: string;
  summary: string;
  toolsUsed: string[];
  status: "completed" | "error" | "cancelled";
}

/**
 * Manages exploratory sub-agents that run read-only tools in parallel.
 * Only used in PLAN mode.
 *
 * Events:
 *  - "explorer:start"    (taskId, description)
 *  - "explorer:tool"     (taskId, toolName)
 *  - "explorer:done"     (taskId, summary)
 *  - "explorer:error"    (taskId, error)
 */
export class SubAgentManager extends EventEmitter {
  private client: OpenAI;
  private model: string;
  private cwd: string;

  constructor(client: OpenAI, model: string, cwd: string) {
    super();
    this.client = client;
    this.model = model;
    this.cwd = cwd;
  }

  async runExplorers(tasks: ExplorerTask[], parentSignal?: AbortSignal): Promise<ExplorerResult[]> {
    // Limit to MAX_EXPLORERS
    const limited = tasks.slice(0, MAX_EXPLORERS);

    const promises = limited.map((task) => this.runSingleExplorer(task, parentSignal));
    const settled = await Promise.allSettled(promises);

    return settled.map((result, i) => {
      const task = limited[i];
      if (result.status === "fulfilled") {
        return result.value;
      }
      return {
        taskId: task.id,
        description: task.description,
        summary: `Error: ${result.reason?.message || String(result.reason)}`,
        toolsUsed: [],
        status: "error" as const,
      };
    });
  }

  private async runSingleExplorer(task: ExplorerTask, parentSignal?: AbortSignal): Promise<ExplorerResult> {
    this.emit("explorer:start", task.id, task.description);

    const toolsUsed: string[] = [];
    const abortController = new AbortController();

    // Forward parent abort signal so user cancel stops sub-agents immediately
    if (parentSignal) {
      if (parentSignal.aborted) {
        abortController.abort();
      } else {
        parentSignal.addEventListener("abort", () => abortController.abort(), { once: true });
      }
    }

    try {
      const systemPrompt = `You are a code explorer sub-agent. Your ONLY job is to investigate a specific aspect of the codebase and produce a concise summary.

Working directory: ${this.cwd}

Your task: ${task.instruction}

Rules:
- Use the available read-only tools (read_file, glob, grep, list_directory) to investigate
- Be efficient — use glob/grep to find relevant files first, then read the important ones
- After investigating, produce a clear, concise summary of your findings
- Focus on facts: file paths, function names, patterns found, structure
- Do NOT suggest changes or improvements — just report what you find
- Keep your final summary under 500 words`;

      const history: ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: task.instruction },
      ];

      const tools = getReadOnlyToolDefinitions();
      let turns = 0;

      while (turns < MAX_TURNS) {
        if (abortController.signal.aborted) break;
        turns++;

        const result = await streamChat(
          this.client,
          this.model,
          history,
          tools,
          {}, // no streaming callbacks needed for sub-agents
          abortController.signal,
        );

        // Push assistant message to history
        const assistantMsg: any = {
          role: "assistant" as const,
          content: result.content || "",
        };
        if (result.toolCalls.length > 0) {
          assistantMsg.tool_calls = result.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.function.name, arguments: tc.function.arguments },
          }));
        }
        history.push(assistantMsg);

        // No tool calls — agent is done
        if (result.toolCalls.length === 0) break;

        // Execute tool calls
        for (const tc of result.toolCalls) {
          const toolName = tc.function.name;
          if (!toolsUsed.includes(toolName)) toolsUsed.push(toolName);
          this.emit("explorer:tool", task.id, toolName);

          let args: Record<string, any> = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {
            args = {};
          }

          let toolResult: string;
          try {
            toolResult = await executeTool(toolName, args, abortController.signal);
          } catch (err: any) {
            toolResult = `Error: ${err.message}`;
          }

          history.push({
            role: "tool" as const,
            content: toolResult,
            tool_call_id: tc.id,
          });
        }
      }

      // Extract the last assistant content as the summary
      let summary = "";
      for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        if (msg.role === "assistant" && typeof msg.content === "string" && msg.content.trim()) {
          summary = msg.content.trim();
          break;
        }
      }

      if (!summary) {
        summary = "(Explorer finished without producing a summary)";
      }

      const wasCancelled = abortController.signal.aborted;
      this.emit("explorer:done", task.id, summary);

      return {
        taskId: task.id,
        description: task.description,
        summary,
        toolsUsed,
        status: wasCancelled ? "cancelled" : "completed",
      };
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      this.emit("explorer:error", task.id, errorMsg);
      return {
        taskId: task.id,
        description: task.description,
        summary: `Error: ${errorMsg}`,
        toolsUsed,
        status: "error",
      };
    } finally {
      // cleanup complete
    }
  }
}
