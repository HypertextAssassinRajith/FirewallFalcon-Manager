import { useEffect, useMemo, useState } from 'react'
import './App.css'

type ApiResult = {
  action: string
  exitCode: number
  stdout: string
  stderr: string
}

type ActionItem = {
  id: string
  title: string
}

type Page = 'login' | 'dashboard'

type DashboardStatus = {
  os: string
  uptime: string
  memoryUsed: string
  onlineSessions: string
  usersManaged: string
  sysLoad1m: string
}

const API_BASE = 'http://localhost:8787'

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      'x-api-token': token,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
  }
  return (await res.json()) as T
}

async function runAction(action: string, token: string): Promise<ApiResult> {
  return await apiFetch<ApiResult>('/api/run', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  })
}

function groupSections(actions: ActionItem[]) {
  // Dashboard layout mirroring the terminal menu screenshot.
  // If an action isn't provided by the API allowlist, the button is disabled.
  const byId = new Map(actions.map((a) => [a.id, a] as const))
  const has = (id: string) => byId.has(id)

  const mk = (id: string, fallbackTitle: string): ActionItem => byId.get(id) ?? { id, title: fallbackTitle }

  return {
    user: {
      title: 'User Management',
      items: [
        mk('user-create', 'Create New User'),
        mk('user-delete', 'Delete User'),
        mk('user-renew', 'Renew User Account'),
        mk('user-lock', 'Lock User Account'),
        mk('user-unlock', 'Unlock User Account'),
        mk('user-edit', 'Edit User Details'),
        mk('user-list', 'List Managed Users'),
        mk('client-config-generate', 'Generate Client Config'),
      ].map((a) => ({ ...a, enabled: has(a.id) })),
    },
    vpn: {
      title: 'VPN & Protocols',
      items: [
        mk('protocol-manager', 'Protocol Manager'),
        mk('dt-proxy-manager', 'DT Proxy Manager'),
        mk('traffic-monitor', 'Traffic Monitor (Lite)'),
        mk('block-torrent', 'Block Torrent (Anti-P2P)'),
      ].map((a) => ({ ...a, enabled: has(a.id) })),
    },
    system: {
      title: 'System Settings',
      items: [
        mk('cloudflare-domain', 'CloudFlare Free Domain'),
        mk('ssh-banner', 'SSH Banner Config'),
        mk('auto-reboot', 'Auto-Reboot Task'),
        mk('backup-users', 'Backup User Data'),
        mk('restore-users', 'Restore User Data'),
        mk('cleanup-expired', 'Cleanup Expired Users'),
      ].map((a) => ({ ...a, enabled: has(a.id) })),
    },
    danger: {
      title: 'Danger Zone',
      items: [mk('uninstall', 'Uninstall Script')].map((a) => ({ ...a, enabled: has(a.id) })),
    },
    debug: {
      title: 'Diagnostics',
      items: [
        mk('health', 'Test connection'),
        mk('status', 'Firewall status'),
        mk('list-rules', 'List rules (sample)'),
        mk('menu-version', 'Menu version (from menu.sh)'),
      ].map((a) => ({ ...a, enabled: has(a.id) || ['status', 'list-rules'].includes(a.id) })),
    },
  }
}

function App() {
  const [page, setPage] = useState<Page>('login')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ApiResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actions, setActions] = useState<ActionItem[]>([])
  const [status, setStatus] = useState<DashboardStatus | null>(null)

  const trimmedToken = token.trim()
  const hasToken = trimmedToken.length > 0
  const canCall = useMemo(() => hasToken && !busy, [hasToken, busy])

  const refreshStatus = async (t: string) => {
    // Temporary: we don't have a dedicated endpoint yet.
    // We'll show a formatted block, and later back it with /api/status.
    try {
      const r = await runAction('health', t)
      const os = r.stdout?.trim() || (r.stderr?.trim() ? 'Unknown' : 'Unknown')
      setStatus({
        os: os || 'Unknown',
        uptime: '—',
        memoryUsed: '—',
        onlineSessions: '—',
        usersManaged: '—',
        sysLoad1m: '—',
      })
    } catch {
      setStatus({
        os: 'Unknown',
        uptime: '—',
        memoryUsed: '—',
        onlineSessions: '—',
        usersManaged: '—',
        sysLoad1m: '—',
      })
    }
  }

  useEffect(() => {
    let cancelled = false

    const loadActions = async () => {
      if (!trimmedToken) {
        setActions([])
        return
      }
      try {
        const data = await apiFetch<{ actions: ActionItem[] }>('/api/actions', trimmedToken)
        if (!cancelled) setActions(data.actions)
      } catch (e) {
        if (!cancelled) {
          setActions([])
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    }

    loadActions()
    return () => {
      cancelled = true
    }
  }, [trimmedToken])

  useEffect(() => {
    if (page !== 'dashboard') return
    if (!trimmedToken) return
    refreshStatus(trimmedToken)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, trimmedToken])

  const onRun = async (actionId: string) => {
    setBusy(true)
    setError(null)
    try {
      const r = await runAction(actionId, trimmedToken)
      setResult(r)
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onSubmitToken = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!trimmedToken) {
      setError('Token is required')
      return
    }

    // Validate token by calling /api/actions. If it succeeds, move to dashboard.
    setBusy(true)
    try {
      const data = await apiFetch<{ actions: ActionItem[] }>('/api/actions', trimmedToken)
      setActions(data.actions)
      setPage('dashboard')
    } catch (err) {
      setPage('login')
      setActions([])
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const onLogout = () => {
    setPage('login')
    setToken('')
    setActions([])
    setResult(null)
    setError(null)
    setStatus(null)
  }

  const sections = useMemo(() => groupSections(actions), [actions])

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>FirewallFalcon Manager</h1>
        <span style={{ opacity: 0.7 }}>Web UI</span>
      </header>

      {page === 'login' && (
        <section className="card" style={{ textAlign: 'left' }}>
          <h2 style={{ marginTop: 0 }}>Login</h2>
          <p style={{ marginTop: 0, opacity: 0.8 }}>
            Paste the same <code>API_TOKEN</code> that is configured on the server.
          </p>

          <form onSubmit={onSubmitToken}>
            <label style={{ display: 'block', marginBottom: 8 }}>
              API Token
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="API_TOKEN"
                style={{ display: 'block', width: '100%', padding: 10, marginTop: 6 }}
              />
            </label>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              <button disabled={busy || !hasToken} type="submit">
                {busy ? 'Checking' : 'Submit'}
              </button>
            </div>
          </form>

          {error && (
            <pre style={{ marginTop: 12, color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre>
          )}
        </section>
      )}

      {page === 'dashboard' && (
        <section style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <div className="card" style={{ textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2 style={{ marginTop: 0, marginBottom: 6 }}>Dashboard</h2>
                <p style={{ marginTop: 0, opacity: 0.75 }}>
                  Buttons mirror your terminal menu. Disabled items are not yet implemented on the API allowlist.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => refreshStatus(trimmedToken)} disabled={busy}>
                  Refresh status
                </button>
                <button onClick={onLogout} disabled={busy}>
                  Logout
                </button>
              </div>
            </div>

            <div className="card" style={{ textAlign: 'left', marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>System Status</h3>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {`OS         ${status?.os ?? 'Loading...'}\n` +
                  `Memory     ${status?.memoryUsed ?? 'Loading...'}          | Online Sessions: ${
                    status?.onlineSessions ?? 'Loading...'
                  }\n` +
                  `Users      ${status?.usersManaged ?? 'Loading...'}   | Sys Load (1m): ${
                    status?.sysLoad1m ?? 'Loading...'
                  }\n` +
                  `Uptime: ${status?.uptime ?? 'Loading...'}\n`}
              </pre>
              <p style={{ marginTop: 10, opacity: 0.7 }}>
                Note: this is a placeholder layout. Next we should add a dedicated API endpoint (e.g. <code>/api/status</code>)
                on Linux to return real uptime/memory/users/load.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                gap: 12,
              }}
            >
              {Object.values(sections).map((sec) => (
                <div key={sec.title} className="card" style={{ textAlign: 'left' }}>
                  <h3 style={{ marginTop: 0 }}>{sec.title}</h3>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {sec.items.map((a: any) => (
                      <button
                        key={a.id}
                        disabled={!canCall || !a.enabled}
                        onClick={() => onRun(a.id)}
                        title={!a.enabled ? 'Not implemented on API yet' : a.id}
                      >
                        {a.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {busy && <p style={{ marginTop: 12 }}>Running</p>}
            {error && (
              <pre style={{ marginTop: 12, color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre>
            )}
          </div>
        </section>
      )}

      <section style={{ marginTop: 16 }}>
        <h2>Output</h2>
        {!result ? (
          <p style={{ opacity: 0.8 }}>Run an action to see stdout/stderr here.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="card" style={{ textAlign: 'left' }}>
              <strong>Action:</strong> {result.action} &nbsp; <strong>Exit code:</strong> {result.exitCode}
            </div>
            <div className="card" style={{ textAlign: 'left' }}>
              <h3 style={{ marginTop: 0 }}>stdout</h3>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{result.stdout || '(empty)'}</pre>
            </div>
            <div className="card" style={{ textAlign: 'left' }}>
              <h3 style={{ marginTop: 0 }}>stderr</h3>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{result.stderr || '(empty)'}</pre>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export default App
