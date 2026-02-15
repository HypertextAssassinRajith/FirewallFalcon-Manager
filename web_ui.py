#!/usr/bin/env python3
import argparse
import json
import os
import pty
import select
import signal
import subprocess
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HTML = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>FirewallFalcon Manager Web UI</title>
  <style>
    body{font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:16px}
    .card{max-width:980px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:8px;padding:16px}
    #out{white-space:pre-wrap;background:#020617;color:#e5e7eb;border:1px solid #1f2937;border-radius:6px;padding:12px;height:60vh;overflow:auto}
    .row{display:flex;gap:8px;margin-top:12px}
    input{flex:1;padding:10px;border-radius:6px;border:1px solid #334155;background:#0b1220;color:#e2e8f0}
    button{padding:10px 14px;border:0;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer}
    button.stop{background:#dc2626}
    .hint{font-size:12px;color:#94a3b8;margin-top:8px}
  </style>
</head>
<body>
  <div class="card">
    <h2>FirewallFalcon Manager Web UI</h2>
    <div id="out"></div>
    <div class="row">
      <input id="in" placeholder="Type option/value, then press Enter">
      <button id="send">Send</button>
      <button id="enter">Enter</button>
      <button id="stop" class="stop">Stop</button>
    </div>
    <div class="hint">This UI controls the same interactive menu script, so all existing features remain available.</div>
  </div>
<script>
let sid = null;
const out = document.getElementById('out');
const inp = document.getElementById('in');
const stripAnsi = s => s.replace(/\\x1B\\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\\x1B\\][^\\x07]*\\x07/g, '');

async function api(path, method='GET', body=null){
  const r = await fetch(path, {method, headers:{'Content-Type':'application/json'}, body: body ? JSON.stringify(body) : null});
  return r.json();
}

async function start(){
  const res = await api('/start', 'POST');
  sid = res.sid;
}

async function poll(){
  if(!sid) return;
  const res = await api('/read?sid='+encodeURIComponent(sid));
  if(res.output){
    out.textContent += stripAnsi(res.output);
    out.scrollTop = out.scrollHeight;
  }
}

async function sendInput(value){
  if(!sid) return;
  await api('/write?sid='+encodeURIComponent(sid), 'POST', {input:value});
  inp.value = '';
}

document.getElementById('send').onclick = () => sendInput(inp.value + "\\n");
document.getElementById('enter').onclick = () => sendInput("\\n");
document.getElementById('stop').onclick = async () => { if(sid){ await api('/stop?sid='+encodeURIComponent(sid), 'POST'); sid = null; } };
inp.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); sendInput(inp.value + "\\n"); } });

start().then(() => setInterval(poll, 1000));
</script>
</body>
</html>
"""


class SessionManager:
    def __init__(self, menu_path: str):
        self.menu_path = menu_path
        self.lock = threading.Lock()
        self.sessions = {}

    def start(self):
        master, slave = pty.openpty()
        proc = subprocess.Popen([self.menu_path], stdin=slave, stdout=slave, stderr=slave, close_fds=True)
        os.close(slave)
        sid = uuid.uuid4().hex
        with self.lock:
            self.sessions[sid] = {"fd": master, "proc": proc}
        return sid

    def read(self, sid):
        with self.lock:
            s = self.sessions.get(sid)
        if not s:
            return ""
        fd = s["fd"]
        chunks = []
        while True:
            ready, _, _ = select.select([fd], [], [], 0)
            if not ready:
                break
            try:
                data = os.read(fd, 4096)
            except OSError:
                break
            if not data:
                break
            chunks.append(data.decode(errors="replace"))
        return "".join(chunks)

    def write(self, sid, data):
        with self.lock:
            s = self.sessions.get(sid)
        if not s:
            return
        os.write(s["fd"], data.encode())

    def stop(self, sid):
        with self.lock:
            s = self.sessions.pop(sid, None)
        if not s:
            return
        proc = s["proc"]
        fd = s["fd"]
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
        os.close(fd)


def make_handler(manager: SessionManager):
    class Handler(BaseHTTPRequestHandler):
        def _json(self, payload, code=200):
            data = json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path == "/":
                body = HTML.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if parsed.path == "/read":
                sid = parse_qs(parsed.query).get("sid", [""])[0]
                self._json({"output": manager.read(sid)})
                return
            self._json({"error": "not found"}, 404)

        def do_POST(self):
            parsed = urlparse(self.path)
            if parsed.path == "/start":
                self._json({"sid": manager.start()})
                return
            sid = parse_qs(parsed.query).get("sid", [""])[0]
            if parsed.path == "/write":
                size = int(self.headers.get("Content-Length", "0"))
                body = self.rfile.read(size) if size else b"{}"
                payload = json.loads(body.decode() or "{}")
                manager.write(sid, payload.get("input", ""))
                self._json({"ok": True})
                return
            if parsed.path == "/stop":
                manager.stop(sid)
                self._json({"ok": True})
                return
            self._json({"error": "not found"}, 404)

        def log_message(self, _format, *_args):
            return

    return Handler


def main():
    parser = argparse.ArgumentParser(description="FirewallFalcon web UI bridge")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8088)
    parser.add_argument("--menu-path", default="/usr/local/bin/menu")
    args = parser.parse_args()

    manager = SessionManager(args.menu_path)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(manager))
    print(f"FirewallFalcon Web UI running on http://{args.host}:{args.port}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        with manager.lock:
            active = list(manager.sessions.keys())
        for sid in active:
            manager.stop(sid)
        server.server_close()


if __name__ == "__main__":
    main()
