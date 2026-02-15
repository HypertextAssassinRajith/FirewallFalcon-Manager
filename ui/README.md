# FirewallFalcon Manager UI

Web UI for managing/inspecting firewall settings without using an interactive terminal menu.

## What’s included

- **UI**: Vite + React + TypeScript
- **Local API**: Express server (`server/`) that runs a _small allowlist_ of safe commands and returns stdout/stderr.

## Development

- The API requires an `API_TOKEN` env var and the UI sends it as `x-api-token`.
- On Windows, commands use PowerShell `Get-NetFirewall*` cmdlets.
- On Linux, examples use `ufw` or `iptables` if available.

> Note: Making firewall changes typically requires Administrator (Windows) or root (Linux). The included API actions are read-only examples.
