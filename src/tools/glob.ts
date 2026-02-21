import fg from "fast-glob";
import { getCwd } from "./cwd";

export const definition = {
  type: "function" as const,
  function: {
    name: "glob",
    description:
      "Find files by glob pattern. Returns one path per line. Max 500 results. Ignores dotfiles. Examples: '**/*.ts' for all TypeScript files, 'src/**/*.test.ts' for test files in src.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: 'Glob pattern to match (e.g., "**/*.ts", "src/**/*.tsx")',
        },
        cwd: {
          type: "string",
          description: "Directory to search in. Defaults to current working directory.",
        },
      },
      required: ["pattern"],
    },
  },
};

export async function execute(args: { pattern: string; cwd?: string }): Promise<string> {
  try {
    const cwd = args.cwd || getCwd();
    const results = await fg(args.pattern, {
      cwd,
      dot: false,
      onlyFiles: true,
      suppressErrors: true,
    });

    if (results.length === 0) {
      return "No files matched the pattern.";
    }

    if (results.length > 500) {
      return results.slice(0, 500).join("\n") + "\n...(truncated at 500 results)";
    }

    return results.join("\n");
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}
