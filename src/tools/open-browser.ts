import { getOpenBrowserHandler } from "./vscode-bridge";

export const definition = {
  type: "function" as const,
  function: {
    name: "open_browser",
    description:
      "Open a URL in VSCode's built-in Simple Browser panel. Use for previewing frontend web apps " +
      "after starting a dev server with bash_bg. Works best with localhost URLs.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to open (e.g., 'http://localhost:3000')",
        },
      },
      required: ["url"],
    },
  },
};

export async function execute(args: { url: string }): Promise<string> {
  const handler = getOpenBrowserHandler();
  if (!handler) {
    return "Error: Browser preview not available (VSCode bridge not initialized).";
  }

  try {
    const url = new URL(args.url);
    await handler(url.toString());
    return `Opened browser preview: ${url.toString()}`;
  } catch (err: any) {
    return `Error opening browser: ${err.message}`;
  }
}
