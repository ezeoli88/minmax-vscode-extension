import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { themes } from "../config/themes";
import { MODEL_IDS } from "./api";

export type CommandResult =
  | { type: "message"; text: string }
  | { type: "new_session" }
  | { type: "clear" }
  | { type: "sessions" }
  | { type: "config" }
  | { type: "set_model"; model: string }
  | { type: "set_theme"; theme: string }
  | { type: "none" };

export function handleCommand(input: string): CommandResult {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return { type: "none" };

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(" ");

  switch (cmd) {
    case "/new":
      return { type: "new_session" };

    case "/clear":
      return { type: "clear" };

    case "/sessions":
      return { type: "sessions" };

    case "/config":
      return { type: "config" };

    case "/model": {
      if (!arg) {
        const list = MODEL_IDS.map((m) => `  - ${m}`).join("\n");
        return { type: "message", text: `Available models:\n${list}\n\nUsage: /model <name>` };
      }
      const match = MODEL_IDS.find(
        (m) => m.toLowerCase() === arg.toLowerCase()
      );
      if (!match) {
        return {
          type: "message",
          text: `Unknown model "${arg}". Available: ${MODEL_IDS.join(", ")}`,
        };
      }
      return { type: "set_model", model: match };
    }

    case "/theme": {
      if (!arg) {
        const list = Object.keys(themes)
          .map((t) => `  - ${t}`)
          .join("\n");
        return { type: "message", text: `Available themes:\n${list}\n\nUsage: /theme <name>` };
      }
      if (!themes[arg.toLowerCase()]) {
        return {
          type: "message",
          text: `Unknown theme "${arg}". Available: ${Object.keys(themes).join(", ")}`,
        };
      }
      return { type: "set_theme", theme: arg.toLowerCase() };
    }

    case "/init": {
      const agentPath = join(process.cwd(), "agent.md");
      if (existsSync(agentPath)) {
        return { type: "message", text: "agent.md already exists in this directory." };
      }
      const template = `# Agent Instructions

## Project Description
Describe your project here.

## Tech Stack
- Language:
- Framework:
- Database:

## Coding Conventions
-

## Important Files
-

## Notes
-
`;
      writeFileSync(agentPath, template, "utf-8");
      return { type: "message", text: "Created agent.md in current directory." };
    }

    case "/help": {
      const help = `Available commands:
  /new        - Start a new session
  /sessions   - Browse previous sessions
  /config     - Open configuration (API key, theme, model)
  /model      - Change or list models
  /theme      - Change or list themes
  /init       - Create agent.md template
  /clear      - Clear current chat
  /help       - Show this help`;
      return { type: "message", text: help };
    }

    default:
      return { type: "message", text: `Unknown command: ${cmd}. Type /help for available commands.` };
  }
}
