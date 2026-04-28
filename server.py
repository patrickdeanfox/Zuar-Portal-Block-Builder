#!/usr/bin/env python3
"""
zPortal Block Manager - Local Proxy Server v3
Assembles a rich AI system prompt from skill files at startup.
"""

import json
import urllib.request
import urllib.parse
import urllib.error
import http.server
import http.cookiejar
import threading
import webbrowser
from pathlib import Path

PORT        = 8765
CONFIG_FILE = Path(__file__).parent / "config.json"
SCRIPT_DIR  = Path(__file__).parent

# Skill files live in a skills/ folder beside server.py
# so they work on any machine without /mnt/skills being present.
SKILL_PATHS = {
    "zportal":   SCRIPT_DIR / "skills" / "zportal.md",
    "amcharts5": SCRIPT_DIR / "skills" / "amcharts5.md",
    "rest_api":  SCRIPT_DIR / "skills" / "rest-api.md",
}

# ── Global state ──────────────────────────────────────────────────────────────
portal_session_cookie = None
portal_base_url       = None
SYSTEM_PROMPT         = ""   # assembled at startup


# ── System prompt assembly ────────────────────────────────────────────────────
import re as _re

def trim_skill(text, max_code_lines=8):
    """
    Trim a skill markdown file to reduce token count:
    - Strip YAML front matter
    - Truncate fenced code blocks longer than max_code_lines
    - Keep all prose, headings, tables, bullet points intact
    """
    # Strip YAML front matter
    text = _re.sub(r"^---\n.*?\n---\n", "", text, flags=_re.DOTALL)
    lines, out = text.split("\n"), []
    in_code, code_lines, code_lang = False, [], ""
    fence = _re.compile(r"^```")
    for line in lines:
        if not in_code and fence.match(line):
            in_code, code_lang, code_lines = True, line, []
        elif in_code:
            if fence.match(line):
                kept    = code_lines[:max_code_lines]
                trimmed = len(code_lines) - len(kept)
                out.append(code_lang)
                out.extend(kept)
                if trimmed > 0:
                    out.append(f"// ... ({trimmed} lines trimmed)")
                out.append("```")
                in_code, code_lines = False, []
            else:
                code_lines.append(line)
        else:
            out.append(line)
    return "\n".join(out)


def read_skill(key, max_code_lines=8):
    """Read and trim a skill file. Returns content string or empty string."""
    path = SKILL_PATHS.get(key)
    if path and path.exists():
        try:
            raw     = path.read_text(encoding="utf-8")
            trimmed = trim_skill(raw, max_code_lines)
            pct     = int((1 - len(trimmed)/len(raw)) * 100)
            print(f"  [skills] {key}: {len(raw):,} -> {len(trimmed):,} chars (-{pct}%) (~{len(trimmed)//4:,} tokens)")
            return trimmed
        except Exception as e:
            print(f"  [skills] Failed to read {key}: {e}")
    else:
        print(f"  [skills] Not found: {key} ({path})")
    return ""


def build_system_prompt():
    """Assemble trimmed system prompt from skill files."""
    zportal   = read_skill("zportal",   max_code_lines=8)
    amcharts5 = read_skill("amcharts5", max_code_lines=6)
    rest_api  = read_skill("rest_api",  max_code_lines=4)

    # Extract only Block Types + Blocks sections from rest_api
    block_types_section = ""
    if rest_api:
        marker = "## Block Types Reference"
        if marker in rest_api:
            start = rest_api.index(marker)
            chunk = rest_api[start:]
            next_section = chunk.find("\n## ", 10)
            block_types_section = chunk[:next_section] if next_section != -1 else chunk

    parts = []

    # ── Role ──────────────────────────────────────────────────────────────────
    parts.append("""# ROLE
You are an expert developer for Zuar Portal (zPortal). Your job is to help users create and edit HTML blocks for zPortal pages. You have deep knowledge of the zPortal block system, the zPortal JavaScript API, amCharts 5, and the REST API.

Always produce complete, working code. Never produce partial snippets unless explicitly asked.
""")

    # ── zPortal skill ─────────────────────────────────────────────────────────
    if zportal:
        parts.append("# ZPORTAL SKILL — READ AND FOLLOW ALL PATTERNS BELOW\n")
        parts.append(zportal)
    else:
        parts.append("""# ZPORTAL BLOCK RULES (fallback — skill file not found)

HTML blocks have TWO separate sections:

**Section 1 — HTML + JS**
Only content between <body> tags. No <html>/<head>/<body>/<!DOCTYPE> tags.
JavaScript in <script> tags inline.

**Section 2 — CSS**
Only raw CSS rules. No <style> tags.

currentBlock data access:
  const cols = currentBlock?.data?.columns?.map(c => c.name) || [];
  const rows = currentBlock?.data?.data || [];
  const records = rows.map(row => Object.fromEntries(cols.map((c,i) => [c, row[i]])));

Theme CSS variables: --color-primary, --color-text, --body-bg-color,
  --header-bg-color, --color-success, --color-danger
""")

    # ── amCharts 5 skill ──────────────────────────────────────────────────────
    if amcharts5:
        parts.append("\n# AMCHARTS 5 SKILL — READ AND FOLLOW ALL PATTERNS BELOW\n")
        parts.append(amcharts5)
    else:
        parts.append("""
# AMCHARTS 5 (fallback — skill file not found)
Always wrap chart code in:
  window.AMCHARTS_LOADER.load().then(function() { /* am5 code here */ });
Never load amCharts scripts directly in a chart block.
""")

    # ── Block types reference ─────────────────────────────────────────────────
    if block_types_section:
        parts.append("\n# BLOCK TYPES REFERENCE\n")
        parts.append(block_types_section)
    else:
        parts.append("""
# BLOCK TYPES REFERENCE (fallback)
Block types: html, data-table, amchart, multiselect, date-time,
  clear-filters-button, tableau-dashboard, user-menu

Use type "html" for all custom blocks (99.9% of cases).
""")

    # ── Output format rules ───────────────────────────────────────────────────
    parts.append("""
# OUTPUT FORMAT — CRITICAL — ALWAYS FOLLOW

You MUST always output code in exactly two fenced blocks:

1. HTML + JS block (tagged "html"):
```html
<!-- your HTML and JS here -->
```

2. CSS block (tagged "css"):
```css
/* your CSS here */
```

- If only changing one section, still output BOTH sections completely.
- Never wrap the CSS block in <style> tags.
- Never include <html>, <head>, <body>, or <!DOCTYPE> in the HTML block.
- Keep explanations brief — the user can see the code. Say what changed and why.
- If the user asks for a chart, always use the AMCHARTS_LOADER pattern.
- Always use CSS variables (--color-primary etc.) instead of hardcoded colors.
""")

    full_prompt = "\n".join(parts)
    char_count  = len(full_prompt)
    print(f"  [skills] System prompt assembled: {char_count:,} chars (~{char_count//4:,} tokens)")
    return full_prompt


# ── Config ────────────────────────────────────────────────────────────────────
def load_config():
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text())
        except Exception:
            pass
    return {}

def save_config(data):
    CONFIG_FILE.write_text(json.dumps(data, indent=2))


# ── Portal login ──────────────────────────────────────────────────────────────
def portal_login(base_url, api_key, user_id):
    global portal_session_cookie, portal_base_url
    login_url = (
        f"{base_url.rstrip('/')}/login"
        f"?api_key={urllib.parse.quote(api_key)}"
        f"&user_id={urllib.parse.quote(str(user_id))}"
    )
    cj     = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    try:
        with opener.open(urllib.request.Request(login_url), timeout=15) as resp:
            resp.read()
        cookies = "; ".join(f"{c.name}={c.value}" for c in cj)
        if not cookies:
            return False, "Login succeeded but no cookie was returned"
        portal_session_cookie = cookies
        portal_base_url       = base_url.rstrip("/")
        return True, "Login successful"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.reason}"
    except Exception as e:
        return False, str(e)


# ── Portal proxy ──────────────────────────────────────────────────────────────
def proxy_portal(path, method, body, extra_headers):
    if not portal_base_url or not portal_session_cookie:
        return 401, {}, b'{"error": "Not logged in to portal"}'
    url     = portal_base_url + path
    headers = {
        "Cookie":       portal_session_cookie,
        "Content-Type": "application/json",
        "Accept":       "application/json",
    }
    for k, v in extra_headers.items():
        if k.lower() not in ("host", "origin", "referer", "cookie", "content-length"):
            headers[k] = v
    req = urllib.request.Request(url, data=body if body else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, {}, e.read()
    except Exception as e:
        return 502, {}, json.dumps({"error": str(e)}).encode()


# ── Anthropic proxy ───────────────────────────────────────────────────────────
def proxy_anthropic(path, body_bytes):
    cfg     = load_config()
    # Support both flat anthropic_key and per-portal key stored in portals[]
    api_key = cfg.get("anthropic_key", "").strip()
    if not api_key:
        portals    = cfg.get("portals", [])
        active_idx = cfg.get("active_portal", -1)
        if 0 <= active_idx < len(portals):
            api_key = portals[active_idx].get("anthropic_key", "").strip()
    if not api_key:
        return 401, b'{"error": "Anthropic API key not configured. Add it in Settings."}'

    # Inject the server-side system prompt + any custom rules
    try:
        payload = json.loads(body_bytes)
        # Build final system prompt: base + custom rules
        cfg          = load_config()
        custom_rules = cfg.get("custom_rules", [])
        enabled      = [r["text"] for r in custom_rules if r.get("enabled") and r.get("text","").strip()]
        if enabled:
            rules_block = "\n# CUSTOM RULES — ALWAYS FOLLOW THESE ON EVERY BLOCK YOU GENERATE\n"
            rules_block += "\n".join("- " + r for r in enabled)
            payload["system"] = SYSTEM_PROMPT + "\n" + rules_block
        else:
            payload["system"] = SYSTEM_PROMPT
        body_bytes = json.dumps(payload).encode("utf-8")
    except Exception:
        pass  # If we can't parse, send as-is

    url     = f"https://api.anthropic.com{path}"
    headers = {
        "x-api-key":         api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type":      "application/json",
        "Accept":            "application/json",
    }
    req = urllib.request.Request(url, data=body_bytes, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return 502, json.dumps({"error": str(e)}).encode()


# ── Request handler ───────────────────────────────────────────────────────────
class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} — {fmt % args}")

    def send_json(self, status, data):
        body = json.dumps(data).encode()
        self._send(status, "application/json", body)

    def _send(self, status, content_type, body_bytes):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body_bytes)

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length) if length else b""

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):    self._route("GET")
    def do_POST(self):   self._route("POST")
    def do_PUT(self):    self._route("PUT")
    def do_DELETE(self): self._route("DELETE")

    def _route(self, method):
        full_path = self.path
        path      = full_path.split("?")[0]

        # Serve index.html
        if path in ("/", "/index.html"):
            f = SCRIPT_DIR / "index.html"
            self._send(200, "text/html; charset=utf-8", f.read_bytes() if f.exists() else b"Not found")
            return

        # Config
        if path == "/local/config":
            if method == "GET":
                self.send_json(200, load_config())
            elif method == "POST":
                try:
                    save_config(json.loads(self.read_body()))
                    self.send_json(200, {"ok": True})
                except Exception as e:
                    self.send_json(400, {"error": str(e)})
            return

        # Portal login
        if path == "/local/login" and method == "POST":
            try:
                d        = json.loads(self.read_body())
                base_url = d.get("portal_url", "").strip()
                api_key  = d.get("api_key",    "").strip()
                user_id  = str(d.get("user_id", "")).strip()
                if not all([base_url, api_key, user_id]):
                    self.send_json(400, {"error": "portal_url, api_key, and user_id are required"})
                    return
                ok, msg = portal_login(base_url, api_key, user_id)
                self.send_json(200 if ok else 401, {"ok": ok, "message": msg} if ok else {"error": msg})
            except Exception as e:
                self.send_json(500, {"error": str(e)})
            return

        # Status
        if path == "/local/status" and method == "GET":
            if portal_session_cookie and portal_base_url:
                self.send_json(200, {"connected": True, "portal_url": portal_base_url})
            else:
                self.send_json(200, {"connected": False})
            return

        # Expose prompt length for debugging (GET /local/prompt-info)
        if path == "/local/prompt-info" and method == "GET":
            self.send_json(200, {
                "chars":  len(SYSTEM_PROMPT),
                "tokens": len(SYSTEM_PROMPT) // 4,
                "skills": {k: SKILL_PATHS[k].exists() for k in SKILL_PATHS}
            })
            return

        # Anthropic proxy
        if path.startswith("/anthropic/"):
            anthropic_path = path[len("/anthropic"):]
            status, body   = proxy_anthropic(anthropic_path, self.read_body())
            self._send(status, "application/json", body)
            return

        # Portal proxy
        if path.startswith("/portal/"):
            portal_path = path[len("/portal"):]
            if "?" in full_path:
                portal_path += "?" + full_path.split("?", 1)[1]
            body                            = self.read_body()
            status, resp_headers, resp_body = proxy_portal(portal_path, method, body or None, dict(self.headers))
            ct = resp_headers.get("Content-Type", "application/json")
            self._send(status, ct, resp_body)
            return

        self.send_json(404, {"error": f"Unknown route: {path}"})


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    global SYSTEM_PROMPT

    print(f"\n  zPortal Block Manager v3")
    print(f"  ─────────────────────────")
    print(f"  Loading skill files...")
    SYSTEM_PROMPT = build_system_prompt()
    print(f"  Skills loaded.\n")

    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"  http://localhost:{PORT}")
    print(f"  Ctrl+C to stop\n")

    def _open():
        import time; time.sleep(0.8)
        webbrowser.open(f"http://localhost:{PORT}")

    threading.Thread(target=_open, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
        server.shutdown()

if __name__ == "__main__":
    main()
