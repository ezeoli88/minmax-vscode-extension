import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";

export const definition = {
  type: "function" as const,
  function: {
    name: "edit_file",
    description:
      "Replace an exact string in a file. old_str must match exactly once (including whitespace/indentation). If old_str appears 0 or >1 times, the edit fails — add more surrounding context to make it unique. Preferred over write_file for modifying existing files.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to edit",
        },
        old_str: {
          type: "string",
          description: "The exact string to find and replace. Must be unique in the file.",
        },
        new_str: {
          type: "string",
          description: "The replacement string",
        },
      },
      required: ["path", "old_str", "new_str"],
    },
  },
};

export async function execute(args: {
  path: string;
  old_str: string;
  new_str: string;
}): Promise<string> {
  if (!existsSync(args.path)) {
    return `Error: File not found: ${args.path}`;
  }

  const content = await readFile(args.path, "utf-8");

  const occurrences = content.split(args.old_str).length - 1;
  if (occurrences === 0) {
    return `Error: old_str not found in ${args.path}`;
  }
  if (occurrences > 1) {
    return `Error: old_str found ${occurrences} times in ${args.path}. It must be unique. Add more context to make it unique.`;
  }

  const newContent = content.replace(args.old_str, args.new_str);
  await writeFile(args.path, newContent, "utf-8");
  return `File edited successfully: ${args.path}`;
}
