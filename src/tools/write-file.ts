import { mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import { dirname } from "path";

export const definition = {
  type: "function" as const,
  function: {
    name: "write_file",
    description: "Create or overwrite a file with the given content. Creates parent directories automatically. WARNING: Completely replaces existing content. For partial edits use edit_file instead.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative path to the file",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  },
};

export async function execute(args: { path: string; content: string }): Promise<string> {
  try {
    const dir = dirname(args.path);
    mkdirSync(dir, { recursive: true });
    await writeFile(args.path, args.content, "utf-8");
    return `File written successfully: ${args.path}`;
  } catch (err: any) {
    return `Error writing file: ${err.message}`;
  }
}
