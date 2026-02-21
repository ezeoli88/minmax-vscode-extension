# <img src="resources/minimax-code-icon.svg" width="28" align="top"> MiniMax AI Assistant for VS Code

An AI-powered coding assistant that lives in your sidebar. Chat with MiniMax models to write, edit, search, and understand your codebase — without leaving your editor.

![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue?logo=visual-studio-code)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

### Two Modes

| Mode | Description |
|------|-------------|
| **Builder** | Full access — reads, writes, edits files, runs CLI commands |
| **Plan** | Read-only — explores and analyzes code without making changes |

Toggle between modes with `Tab` in the input box or click the mode badge.

### Built-in Tools

The agent has access to 8 tools that operate directly on your workspace:

- **read_file** — Read file contents with optional line ranges
- **write_file** — Create or overwrite files (auto-creates directories)
- **edit_file** — Targeted find-and-replace within files
- **bash** — Run shell commands (git, npm, scripts, etc.)
- **glob** — Find files by pattern (`**/*.ts`, `src/**/index.*`)
- **grep** — Search file contents with regex and context lines
- **list_directory** — Browse directory structure with depth control
- **cwd** — Manage the working directory

### Inline Diff Viewer

File changes are displayed as color-coded diffs directly in the chat — see exactly what was added, removed, or modified before anything is saved.

### Session History

Conversations are auto-saved and persist across restarts. Resume any previous session from the history panel (up to 50 sessions).

### Quota Tracking

Real-time display of your MiniMax API usage with color-coded indicators and reset timers.

### MCP Tool Support

Extend the agent's capabilities by connecting [Model Context Protocol](https://modelcontextprotocol.io/) servers. Add custom tools for databases, APIs, or any external service.

---

## Getting Started

### 1. Install

Search for **MiniMax AI Assistant** in the VS Code Extensions marketplace, or install the `.vsix` file:

```
code --install-extension minmax-vscode-0.1.0.vsix
```

### 2. Set your API key

Run the command palette (`Ctrl+Shift+P`) and select:

```
MiniMax: Set API Key
```

Or click the gear icon in the chat header.

### 3. Start chatting

Click the MiniMax icon in the activity bar (left sidebar), or press `Ctrl+Shift+M` / `Cmd+Shift+M`.

---

## Models

| Model | Speed |
|-------|-------|
| MiniMax-M2.5 | ~60 tokens/s |
| MiniMax-M2.5-highspeed | ~100 tokens/s |
| MiniMax-M2.1 | ~60 tokens/s |
| MiniMax-M2.1-highspeed | ~100 tokens/s |

Switch models from the dropdown in the status bar.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+M` / `Cmd+Shift+M` | Open / focus chat |
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Tab` | Toggle Plan / Builder mode |
| `Escape` | Cancel streaming response |

---

## Settings

Configure via VS Code settings (`Ctrl+,`) under the **MiniMax** section:

| Setting | Default | Description |
|---------|---------|-------------|
| `minimax.model` | `MiniMax-M2.5` | Model to use |
| `minimax.theme` | `tokyo-night` | Chat theme (`tokyo-night`, `rose-pine`, `gruvbox`) |
| `minimax.defaultMode` | `BUILDER` | Starting mode (`BUILDER` or `PLAN`) |
| `minimax.mcpServers` | `{}` | MCP server configurations |

### MCP Server Configuration

Add MCP servers in your `settings.json`:

```json
{
  "minimax.mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@my/mcp-server"],
      "env": {
        "API_KEY": "..."
      }
    }
  }
}
```

---

## Themes

Three built-in themes optimized for dark environments:

- **Tokyo Night** — Cool blues and cyans
- **Rose Pine** — Muted pastels with mauve accents
- **Gruvbox** — Warm earthy tones

---

## Project-Specific Instructions

Drop an `agent.md` file in your workspace root to give the agent project-specific context, conventions, or guidelines. It will be loaded automatically into every conversation.

---

## Commands

| Command | Description |
|---------|-------------|
| `MiniMax: Open Chat` | Open the chat sidebar |
| `MiniMax: Set API Key` | Configure your API key |
| `MiniMax: Cancel Stream` | Stop the current response |
| `MiniMax: Toggle Plan/Builder Mode` | Switch agent mode |
| `MiniMax: Clear Chat` | Clear the current conversation |

---

## File Context

Mention files in your message using `@filename` to attach them as context. The agent will see the file contents along with your message.

---

## License

MIT
