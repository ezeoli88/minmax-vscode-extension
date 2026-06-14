# Changelog

## [0.2.8] - 2026-06-14

### Added

- Support for MiniMax M3 as the default model.
- Model-aware context limits, including MiniMax M3's 1M-token context window.

## [0.1.0] - 2026-02-21

### Added

- Initial release of MiniMax AI Assistant
- Builder and Plan agent modes
- Built-in tools: bash, read/write/edit files, glob, grep, list directory
- Inline diff viewer for code changes
- Session history with automatic persistence
- Token and quota tracking
- MCP (Model Context Protocol) server support
- Three built-in themes: Tokyo Night, Rose Pine, Gruvbox
- Project-specific instructions via `agent.md`
- File context support with `@filename` syntax
- Support for MiniMax M2.5 and M2.1 models
