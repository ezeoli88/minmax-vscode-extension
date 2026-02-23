import { processManager } from "../core/process-manager";

export const definition = {
  type: "function" as const,
  function: {
    name: "list_servers",
    description:
      "List all running background processes started with bash_bg. " +
      "Shows PID, port, command, and uptime for each.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

export async function execute(): Promise<string> {
  const processes = processManager.list();

  if (processes.length === 0) {
    return "No background processes running.";
  }

  const lines = processes.map((p) => {
    const uptime = Math.round((Date.now() - p.startTime) / 1000);
    const uptimeStr =
      uptime < 60
        ? `${uptime}s`
        : uptime < 3600
          ? `${Math.floor(uptime / 60)}m ${uptime % 60}s`
          : `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

    return `PID ${p.pid} | Port ${p.port ?? "N/A"} | ${uptimeStr} | ${p.command}`;
  });

  return `Running background processes:\n${lines.join("\n")}`;
}
