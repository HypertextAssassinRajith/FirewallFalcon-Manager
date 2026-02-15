<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

## Project

- This workspace contains a Vite + React + TypeScript web UI.
- A lightweight local Express API lives under `server/` and exposes a small, allowlisted set of firewall-related actions.

## Guidelines

- Do not allow arbitrary command execution.
- All server endpoints must validate input with Zod.
- Map UI actions to fixed commands per-platform (Windows PowerShell vs Linux shell).
- Keep the API read-only by default unless the user explicitly requests rule modification flows.
- Prefer clear error messages and safe defaults.
