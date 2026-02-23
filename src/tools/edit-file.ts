import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { isAbsolute, resolve } from "path";
import { getCwd } from "./cwd";

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
  const fullPath = isAbsolute(args.path) ? args.path : resolve(getCwd(), args.path);

  if (!existsSync(fullPath)) {
    return `Error: File not found: ${fullPath}`;
  }

  const content = await readFile(fullPath, "utf-8");

  const occurrences = content.split(args.old_str).length - 1;
  if (occurrences === 0) {
    return `Error: old_str not found in ${fullPath}`;
  }
  if (occurrences > 1) {
    return `Error: old_str found ${occurrences} times in ${fullPath}. It must be unique. Add more context to make it unique.`;
  }

  const newContent = content.replace(args.old_str, args.new_str);
  await writeFile(fullPath, newContent, "utf-8");
  return `File edited successfully: ${fullPath}`;
}
