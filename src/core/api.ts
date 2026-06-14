import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { AVAILABLE_MODELS, MODEL_IDS } from "../shared/models";

export { AVAILABLE_MODELS, MODEL_IDS };

export function createClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: "https://api.minimax.io/v1",
  });
}

export interface QuotaInfo {
  used: number;
  total: number;
  remaining: number;
  resetMinutes: number;
}

interface CodingPlanRemainsResponse {
  model_remains?: Array<{
    current_interval_total_count?: number;
    current_interval_usage_count?: number;
    remains_time?: number;
  }>;
}

export async function fetchCodingPlanRemains(apiKey: string): Promise<QuotaInfo | null> {
  try {
    const res = await fetch("https://api.minimax.io/v1/coding_plan/remains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CodingPlanRemainsResponse;

    const entry = data.model_remains?.[0];
    if (!entry) return null;

    const total = entry.current_interval_total_count ?? 0;
    const used = entry.current_interval_usage_count ?? 0;
    const remaining = total - used;
    const resetMinutes = Math.ceil((entry.remains_time ?? 0) / 60_000);

    return { used, total, remaining, resetMinutes };
  } catch {
    return null;
  }
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

export interface AccumulatedToolCall {
  id: string;
  function: { name: string; arguments: string };
  type: "function";
}

export interface StreamCallbacks {
  onReasoningChunk?: (chunk: string) => void;
  onContentChunk?: (chunk: string) => void;
  onToolCallDelta?: (toolCalls: AccumulatedToolCall[]) => void;
  onDone?: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => void;
  onError?: (error: Error) => void;
}

export interface StreamResult {
  content: string;
  reasoningDetails: Array<{ type: "text"; text: string }>;
  toolCalls: AccumulatedToolCall[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  finishReason: string;
}

export async function streamChat(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<StreamResult> {
  let content = "";
  const reasoningDetails: Array<{ type: "text"; text: string }> = [];
  const toolCallsMap = new Map<number, AccumulatedToolCall>();
  let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let finishReason = "";
  let chunkCount = 0;

  try {
    const hasTools = tools && tools.length > 0;
    const createParams: any = {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 1.0,
    };
    if (hasTools) {
      createParams.tools = tools;
      createParams.tool_choice = "auto";
    }

    const stream: any = await client.chat.completions.create(
      createParams,
      { signal, headers: { "X-Reasoning-Split": "true" } }
    );

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      chunkCount++;

      // Capture usage from any chunk
      if (chunk.usage) {
        usage = {
          prompt_tokens: chunk.usage.prompt_tokens ?? 0,
          completion_tokens: chunk.usage.completion_tokens ?? 0,
          total_tokens: chunk.usage.total_tokens ?? 0,
        };
      }

      // Check for API-level errors embedded in the chunk
      if ((chunk as any).error) {
        const errMsg = (chunk as any).error?.message || JSON.stringify((chunk as any).error);
        callbacks.onError?.(new Error(`API error: ${errMsg}`));
        break;
      }

      const choice = chunk.choices?.[0];
      if (!choice) continue;

      // Track finish reason
      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      const delta = choice.delta;
      if (!delta) continue;

      // Handle reasoning_details from MiniMax (array of {text} objects)
      const chunkReasoningDetails = (delta as any).reasoning_details;
      if (chunkReasoningDetails && Array.isArray(chunkReasoningDetails)) {
        for (const item of chunkReasoningDetails) {
          if (item?.text) {
            reasoningDetails.push({ type: "text", text: item.text });
            callbacks.onReasoningChunk?.(item.text);
          }
        }
      }
      // Also handle reasoning_content for compatibility
      const reasoningContent = (delta as any).reasoning_content;
      if (reasoningContent) {
        reasoningDetails.push({ type: "text", text: reasoningContent });
        callbacks.onReasoningChunk?.(reasoningContent);
      }

      // Handle regular content
      if (delta.content) {
        content += delta.content;
        callbacks.onContentChunk?.(delta.content);
      }

      // Handle tool call deltas
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallsMap.has(idx)) {
            toolCallsMap.set(idx, {
              id: tc.id || "",
              function: { name: tc.function?.name || "", arguments: "" },
              type: "function",
            });
          }
          const accumulated = toolCallsMap.get(idx)!;
          if (tc.id) accumulated.id = tc.id;
          if (tc.function?.name) accumulated.function.name = tc.function.name;
          if (tc.function?.arguments) {
            accumulated.function.arguments += tc.function.arguments;
          }
        }
        callbacks.onToolCallDelta?.(Array.from(toolCallsMap.values()));
      }
    }
  } catch (err: any) {
    if (err.name === "AbortError") {
      // Cancelled by user
    } else {
      callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  // Detect completely empty responses
  if (chunkCount === 0 && !content && toolCallsMap.size === 0) {
    callbacks.onError?.(new Error("No response received from API (0 chunks)"));
  }

  const toolCalls = Array.from(toolCallsMap.values());
  callbacks.onDone?.(usage);
  return { content, reasoningDetails, toolCalls, usage, finishReason };
}
