import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { isAbsolute, resolve } from "path";
import { getCwd } from "./cwd";

export const definition = {
  type: "function" as const,
  function: {
    name: "read_file",
    description:
      "Read a file's contents with line numbers. Returns numbered lines (format: '1\\tline content'). Files over 2000 lines are automatically truncated. Use start_line/end_line for large files, e.g., start_line=100, end_line=200.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative path to the file",
        },
        start_line: {
          type: "number",
          description: "Starting line number (1-based). Optional.",
        },
        end_line: {
          type: "number",
          description: "Ending line number (1-based, inclusive). Optional.",
        },
      },
      required: ["path"],
    },
  },
};

export async function execute(args: {
  path: string;
  start_line?: number;
  end_line?: number;
}): Promise<string> {
  const fullPath = isAbsolute(args.path) ? args.path : resolve(getCwd(), args.path);

  if (!existsSync(fullPath)) {
    return `Error: File not found: ${fullPath}`;
  }

  const text = await readFile(fullPath, "utf-8");

  if (args.start_line || args.end_line) {
    const lines = text.split("\n");
    const start = Math.max(1, args.start_line || 1) - 1;
    const end = args.end_line ? Math.min(args.end_line, lines.length) : lines.length;
    const slice = lines.slice(start, end);
    return slice.map((line, i) => `${start + i + 1}\t${line}`).join("\n");
  }

  const lines = text.split("\n");
  if (lines.length > 2000) {
    return (
      lines
        .slice(0, 2000)
        .map((line, i) => `${i + 1}\t${line}`)
        .join("\n") + `\n...(file has ${lines.length} lines, showing first 2000)`
    );
  }

  return lines.map((line, i) => `${i + 1}\t${line}`).join("\n");
}
