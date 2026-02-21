import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { getCwd } from "./cwd";

export const definition = {
  type: "function" as const,
  function: {
    name: "grep",
    description:
      "Search file contents by regex. Returns 'path:line: content' per match. Max 200 matches. Skips node_modules and dotfiles. Use 'include' to filter by extension, e.g., include='*.ts'. Use context_lines for surrounding context.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regex pattern to search for",
        },
        path: {
          type: "string",
          description: "File or directory to search in. Defaults to current directory.",
        },
        include: {
          type: "string",
          description: 'File extension filter (e.g., "*.ts", "*.tsx")',
        },
        context_lines: {
          type: "number",
          description: "Number of context lines before and after each match. Default 0.",
        },
      },
      required: ["pattern"],
    },
  },
};

function walkDir(dir: string, include?: string, results: string[] = []): string[] {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(full, include, results);
      } else if (entry.isFile()) {
        if (include) {
          const ext = include.replace("*", "");
          if (!entry.name.endsWith(ext)) continue;
        }
        results.push(full);
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return results;
}

export async function execute(args: {
  pattern: string;
  path?: string;
  include?: string;
  context_lines?: number;
}): Promise<string> {
  try {
    const regex = new RegExp(args.pattern, "gi");
    const base = args.path || getCwd();
    const contextLines = args.context_lines || 0;
    const results: string[] = [];
    let matchCount = 0;

    let files: string[];
    try {
      const stat = statSync(base);
      files = stat.isDirectory() ? walkDir(base, args.include) : [base];
    } catch {
      return `Error: Path not found: ${base}`;
    }

    for (const filePath of files) {
      try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            matchCount++;
            if (matchCount > 200) {
              results.push("...(truncated at 200 matches)");
              return results.join("\n");
            }

            const rel = relative(getCwd(), filePath);
            const start = Math.max(0, i - contextLines);
            const end = Math.min(lines.length - 1, i + contextLines);

            if (contextLines > 0) {
              results.push(`--- ${rel} ---`);
              for (let j = start; j <= end; j++) {
                const prefix = j === i ? ">" : " ";
                results.push(`${prefix} ${j + 1}: ${lines[j]}`);
              }
              results.push("");
            } else {
              results.push(`${rel}:${i + 1}: ${lines[i]}`);
            }

            regex.lastIndex = 0;
          }
          regex.lastIndex = 0;
        }
      } catch {
        // skip binary / unreadable files
      }
    }

    if (results.length === 0) {
      return "No matches found.";
    }
    return results.join("\n");
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}
