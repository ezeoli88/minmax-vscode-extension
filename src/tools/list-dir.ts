import { readdirSync, statSync } from "fs";
import { join } from "path";
import { getCwd } from "./cwd";

export const definition = {
  type: "function" as const,
  function: {
    name: "list_directory",
    description:
      "List directory contents with file sizes. Directories end with '/'. Default max_depth=1 (non-recursive). Set max_depth=2 or 3 to see nested structure.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path to list. Defaults to current directory.",
        },
        max_depth: {
          type: "number",
          description: "Maximum depth to recurse. Default 1 (non-recursive).",
        },
      },
      required: [],
    },
  },
};

function listRecursive(
  dir: string,
  maxDepth: number,
  currentDepth: number,
  results: string[]
): void {
  if (currentDepth > maxDepth) return;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && currentDepth === 0) continue;

      const indent = "  ".repeat(currentDepth);
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        results.push(`${indent}${entry.name}/`);
        if (currentDepth < maxDepth) {
          listRecursive(full, maxDepth, currentDepth + 1, results);
        }
      } else {
        try {
          const stat = statSync(full);
          const size = formatSize(stat.size);
          results.push(`${indent}${entry.name} (${size})`);
        } catch {
          results.push(`${indent}${entry.name}`);
        }
      }
    }
  } catch (err: any) {
    results.push(`Error reading ${dir}: ${err.message}`);
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export async function execute(args: {
  path?: string;
  max_depth?: number;
}): Promise<string> {
  const dir = args.path || getCwd();
  const maxDepth = args.max_depth ?? 1;
  const results: string[] = [];

  listRecursive(dir, maxDepth, 0, results);

  if (results.length === 0) {
    return "Directory is empty.";
  }
  return results.join("\n");
}
