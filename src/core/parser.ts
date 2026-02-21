/**
 * Parses MiniMax M2.5 raw model output which may contain:
 * - <think>...</think> reasoning blocks
 * - <minimax:tool_call>...</minimax:tool_call> tool call blocks
 * - Regular content between/around those blocks
 *
 * Works incrementally on partial content during streaming.
 */

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, string>;
}

export interface ParsedOutput {
  reasoning: string;
  content: string;
  toolCalls: ParsedToolCall[];
  /** True if content ends with an unclosed tag (still streaming) */
  pending: boolean;
}

export function parseModelOutput(raw: string): ParsedOutput {
  let reasoning = "";
  let content = "";
  const toolCalls: ParsedToolCall[] = [];
  let pending = false;

  // Extract all <think>...</think> blocks
  let working = raw;

  // Check for unclosed tags (streaming in progress)
  const hasUnclosedThink =
    working.includes("<think>") && !working.includes("</think>");
  const hasUnclosedToolCall =
    working.includes("<minimax:tool_call>") &&
    !working.includes("</minimax:tool_call>");

  if (hasUnclosedThink || hasUnclosedToolCall) {
    pending = true;
  }

  // Extract completed <think> blocks
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let match: RegExpExecArray | null;
  while ((match = thinkRegex.exec(working)) !== null) {
    reasoning += match[1].trim();
  }
  // Remove completed think blocks from working content
  working = working.replace(thinkRegex, "");

  // If there's an unclosed <think>, extract partial reasoning
  if (hasUnclosedThink) {
    const unclosedIdx = working.indexOf("<think>");
    if (unclosedIdx !== -1) {
      const partialReasoning = working.slice(unclosedIdx + 7);
      reasoning += (reasoning ? "\n" : "") + partialReasoning.trim();
      working = working.slice(0, unclosedIdx);
    }
  }

  // Extract completed <minimax:tool_call> blocks
  const toolRegex =
    /<minimax:tool_call>([\s\S]*?)<\/minimax:tool_call>/g;
  while ((match = toolRegex.exec(working)) !== null) {
    const block = match[1];
    const parsed = parseToolCallBlock(block);
    toolCalls.push(...parsed);
  }
  working = working.replace(toolRegex, "");

  // If there's an unclosed tool_call, remove the partial tag from content
  if (hasUnclosedToolCall) {
    const unclosedIdx = working.indexOf("<minimax:tool_call>");
    if (unclosedIdx !== -1) {
      working = working.slice(0, unclosedIdx);
    }
  }

  // Also handle stray opening tags that haven't completed yet
  // e.g., "<thi" at the end of streaming
  const partialTagMatch = working.match(/<[a-z/!][^>]*$/i);
  if (partialTagMatch) {
    working = working.slice(0, partialTagMatch.index);
    pending = true;
  }

  content = working.trim();

  return { reasoning, content, toolCalls, pending };
}

function parseToolCallBlock(block: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];

  const invokeRegex =
    /<invoke\s+name=["']?([^"'>\s]+)["']?\s*>([\s\S]*?)<\/invoke>/g;
  let match: RegExpExecArray | null;

  while ((match = invokeRegex.exec(block)) !== null) {
    const name = match[1];
    const paramsBlock = match[2];
    const args: Record<string, string> = {};

    const paramRegex =
      /<parameter\s+name=["']?([^"'>\s]+)["']?\s*>([\s\S]*?)<\/parameter>/g;
    let paramMatch: RegExpExecArray | null;

    while ((paramMatch = paramRegex.exec(paramsBlock)) !== null) {
      args[paramMatch[1]] = paramMatch[2].trim();
    }

    calls.push({ name, arguments: args });
  }

  return calls;
}

/**
 * Try to convert a parsed XML tool call argument value to the right JS type.
 */
export function coerceArg(value: string): any {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  // Try JSON parse for arrays/objects
  if (value.startsWith("[") || value.startsWith("{")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
