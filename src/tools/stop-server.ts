import { processManager } from "../core/process-manager";

export const definition = {
  type: "function" as const,
  function: {
    name: "stop_server",
    description:
      "Stop a background process started with bash_bg. If port is given, stops that server. " +
      "If no port is given, stops ALL background servers. Always clean up after testing.",
    parameters: {
      type: "object",
      properties: {
        port: {
          type: "number",
          description: "Port number of the server to stop. Omit to stop all servers.",
        },
      },
      required: [],
    },
  },
};

export async function execute(args: { port?: number }): Promise<string> {
  if (args.port !== undefined) {
    return processManager.stop(args.port);
  }
  return processManager.stopAll();
}
