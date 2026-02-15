import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { execFile } from 'node:child_process';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

// Simple shared-secret auth. Set API_TOKEN in environment.
function requireToken(req, res, next) {
  const expected = process.env.API_TOKEN;
  if (!expected) return res.status(500).json({ error: 'API_TOKEN not configured' });
  const got = req.header('x-api-token');
  if (got !== expected) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ---- FirewallFalcon command mapping (SAFE allowlist) ----
// This UI/API should NEVER accept arbitrary shell commands from the browser.
// We only expose specific actions that map to a fixed command + args.
//
// For Linux installs, set:
//   API_TOKEN=... 
//   FALCON_MENU_PATH=/path/to/menu.sh   (optional)
//   FALCON_SUDO=1                      (optional)
//
// Note: any action that changes system config will generally require running
// this API with privileges (root) or enabling sudo for the specific script.
const MENU_SH = process.env.FALCON_MENU_PATH || '/root/menu.sh';
const USE_SUDO = process.env.FALCON_SUDO === '1' || process.env.FALCON_SUDO === 'true';

// Actions exposed to the UI. Add items here as you mirror functionality from menu.sh.
// For each action, define:
//   - title: button label
//   - cmd/args: fixed execution
//   - platform: 'linux' | 'win32' | 'any'
//
// IMPORTANT: Start with read-only actions, then add write actions deliberately.
const ACTIONS = {
  health: {
    title: 'Health',
    platform: 'any',
    cmd: process.platform === 'win32' ? 'powershell.exe' : 'sh',
    args: process.platform === 'win32'
      ? ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']
      : ['-lc', 'uname -a']
  },

  // Existing demo actions
  status: {
    title: 'Firewall status',
    platform: 'any'
  },
  'list-rules': {
    title: 'List rules (sample)',
    platform: 'any'
  },

  // Menu-backed launcher (Linux): opens the same bash menu in a non-interactive way
  // You can later change this to call specific functions by adding flags to menu.sh.
  'menu-version': {
    title: 'Menu version (from menu.sh)',
    platform: 'linux',
    cmd: 'bash',
    args: ['-lc', `test -f "${MENU_SH}" && head -n 5 "${MENU_SH}" || (echo "menu.sh not found at ${MENU_SH}" && exit 2)`]
  }
};

function resolveAction(action) {
  // Build mapped commands for a couple of dynamic cases.
  if (action === 'status') {
    if (process.platform === 'win32') {
      return {
        cmd: 'powershell.exe',
        args: ['-NoProfile', '-Command', 'Get-NetFirewallProfile | Select-Object Name, Enabled']
      };
    }
    return {
      cmd: 'sh',
      args: ['-lc', 'command -v ufw >/dev/null 2>&1 && ufw status || (command -v iptables >/dev/null 2>&1 && iptables -S)']
    };
  }

  if (action === 'list-rules') {
    if (process.platform === 'win32') {
      return {
        cmd: 'powershell.exe',
        args: ['-NoProfile', '-Command', 'Get-NetFirewallRule | Select-Object DisplayName, Enabled, Direction, Action | Select-Object -First 50']
      };
    }
    return {
      cmd: 'sh',
      args: ['-lc', 'command -v ufw >/dev/null 2>&1 && ufw status numbered || (command -v iptables >/dev/null 2>&1 && iptables -S)']
    };
  }

  const def = ACTIONS[action];
  if (!def) return null;

  // Enforce platform gating
  if (def.platform === 'linux' && process.platform === 'win32') return null;
  if (def.platform === 'win32' && process.platform !== 'win32') return null;

  if (!def.cmd) return null;
  return { cmd: def.cmd, args: def.args ?? [] };
}

function withOptionalSudo(cmd, args) {
  if (!USE_SUDO) return { cmd, args };
  if (process.platform === 'win32') return { cmd, args };
  // sudo only makes sense on unix. We still keep command fixed.
  return { cmd: 'sudo', args: ['-n', cmd, ...args] };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, platform: process.platform });
});

app.get('/api/actions', requireToken, (_req, res) => {
  // Only return actions valid for this OS.
  const items = Object.entries(ACTIONS)
    .filter(([, def]) => {
      if (def.platform === 'any') return true;
      if (def.platform === 'linux') return process.platform !== 'win32';
      if (def.platform === 'win32') return process.platform === 'win32';
      return false;
    })
    .map(([id, def]) => ({ id, title: def.title }));

  // Include the two demo actions.
  items.unshift({ id: 'status', title: 'Firewall status' });
  items.unshift({ id: 'list-rules', title: 'List rules (sample)' });

  // De-dup
  const seen = new Set();
  const deduped = items.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));

  res.json({ actions: deduped });
});

const actionSchema = z.object({
  action: z.string().min(1),
  // Optional extra parameters for future safe additions (NOT free-form commands)
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
});

app.post('/api/run', requireToken, (req, res) => {
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { action } = parsed.data;

  const resolved = resolveAction(action);
  if (!resolved) return res.status(400).json({ error: `Unsupported action on this platform: ${action}` });

  const { cmd, args } = withOptionalSudo(resolved.cmd, resolved.args);

  execFile(cmd, args, { timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
    const exitCode = err?.code ?? 0;
    res.json({
      action,
      exitCode,
      stdout: stdout?.toString?.() ?? '',
      stderr: stderr?.toString?.() ?? (err ? String(err) : '')
    });
  });
});

app.listen(PORT, () => {
  console.log(`FirewallFalcon API listening on http://localhost:${PORT}`);
});
