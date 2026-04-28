/**
 * Block Builder — Local Dev Server
 *
 * Auth flow:
 *   1. On startup (and on config save), login to portal via:
 *      GET /auth/login?api_key=KEY&user_id=USER_ID
 *      This sets a JWT session cookie.
 *   2. All /api/proxy/* requests forward that cookie to the portal.
 *   3. Cookie is refreshed automatically on 401.
 */

const express   = require('express');
const cors      = require('cors');
const fs        = require('fs');
const path      = require('path');
const https     = require('https');
const http      = require('http');

const app         = express();
const PORT        = 3131;
const CONFIG_PATH = path.join(__dirname, 'config.json');
const SKILLS_DIR  = path.join(__dirname, 'skills');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Session cookie cache ───────────────────────────────────────────────────────
let sessionCookie  = null;   // e.g. "session=abc123; ..."
let sessionPortal  = null;   // which portal URL this session belongs to
let sessionVersion = null;   // detected portal version: '1.17' | '1.18' | 'unknown'

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// ── Probe a path on the connected portal (returns { status, body }) ──────────
function portalProbe(portalUrl, path, cookie) {
  return new Promise((resolve) => {
    const parsed  = new URL(portalUrl + path);
    const isHttps = parsed.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const headers = { 'Accept': 'application/json' };
    if (cookie) headers['Cookie'] = cookie;
    const req = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers,
    }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.setTimeout(8000, () => { try { req.destroy(); } catch(e){} resolve({ status: 0, body: '' }); });
    req.end();
  });
}

// ── Detect portal version ─────────────────────────────────────────────────────
// Strategy:
//   1. Try GET /api/version — 1.18 has this endpoint and returns version info
//   2. Try GET /api/queries — 1.18-only (UserQuery API). If exists → 1.18.
//   3. If /api/datasources works → 1.17. Otherwise 'unknown'.
// Returns { version, raw } where raw is the version string from /api/version (if available).
async function detectPortalVersion(portalUrl, cookie) {
  const portal = portalUrl.replace(/\/$/, '');
  let raw = null;

  // 1. /api/version — most reliable when available
  const ver = await portalProbe(portal, '/api/version', cookie);
  if (ver.status >= 200 && ver.status < 300) {
    try {
      const parsed = JSON.parse(ver.body);
      raw = parsed.version || parsed.api_version || parsed.value || JSON.stringify(parsed);
      const s = String(raw);
      // Match leading "1.NN" pattern
      const m = s.match(/^(\d+)\.(\d+)/);
      if (m) {
        const major = parseInt(m[1], 10);
        const minor = parseInt(m[2], 10);
        if (major > 1 || (major === 1 && minor >= 18)) return { version: '1.18', raw: s };
        if (major === 1 && minor >= 17) return { version: '1.17', raw: s };
      }
    } catch (e) { /* fall through to feature probing */ }
  }

  // 2. /api/queries — 1.18-only feature probe
  const queries = await portalProbe(portal, '/api/queries', cookie);
  if (queries.status >= 200 && queries.status < 300) return { version: '1.18', raw };
  if (queries.status === 401 || queries.status === 403) return { version: '1.18', raw };
  if (queries.status === 422 || queries.status === 400) return { version: '1.18', raw };

  // 3. /api/datasources — exists in both, but if /queries 404'd this is 1.17
  const ds = await portalProbe(portal, '/api/datasources', cookie);
  if (ds.status >= 200 && ds.status < 300) return { version: '1.17', raw };

  return { version: 'unknown', raw };
}

// ── Login to portal, grab session cookie ─────────────────────────────────────
function portalLogin(cfg) {
  return new Promise((resolve, reject) => {
    const portalUrl = (cfg.portal?.url || '').replace(/\/$/, '');
    const apiKey    = cfg.portal?.apiKey || '';
    const userId    = cfg.portal?.userId || '';

    if (!portalUrl || !apiKey || !userId) {
      reject(new Error('Portal URL, API key, and User ID are all required'));
      return;
    }

    const loginPath = `/auth/login?api_key=${encodeURIComponent(apiKey)}&user_id=${encodeURIComponent(userId)}`;
    const parsed    = new URL(portalUrl + loginPath);
    const isHttps   = parsed.protocol === 'https:';
    const lib       = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers:  { 'Accept': 'application/json' },
    };

    const stamp = () => new Date().toISOString().slice(11, 23);
    const mask  = k => !k ? '(none)' : (k.length < 14 ? k.slice(0,4)+'\u2026' : k.slice(0,8)+'\u2026'+k.slice(-4));
    console.log(`[${stamp()}] auth -> POST(GET) ${parsed.hostname}/auth/login api_key=${mask(apiKey)} user_id=${userId.slice(0,8)}\u2026`);

    const req = lib.request(options, res => {
      // Collect all Set-Cookie headers
      const cookies = res.headers['set-cookie'];
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 400 && cookies && cookies.length) {
          // Join cookies into a single Cookie header value (name=value pairs only)
          const cookieHeader = cookies
            .map(c => c.split(';')[0])  // strip path/expires/httponly etc
            .join('; ');
          sessionCookie  = cookieHeader;
          sessionPortal  = portalUrl;
          sessionVersion = null; // reset; will be detected lazily
          console.log(`[${stamp()}] auth <- ${res.statusCode} cookie OK (${cookies.length} Set-Cookie)`);
          resolve(cookieHeader);
        } else if (res.statusCode >= 200 && res.statusCode < 400) {
          // Login succeeded but no cookie — some portals redirect with cookie already set
          console.log(`[${stamp()}] auth <- ${res.statusCode} no Set-Cookie, body=${(body||'').slice(0, 200)}`);
          sessionCookie  = '';
          sessionPortal  = portalUrl;
          sessionVersion = null;
          resolve('');
        } else {
          console.log(`[${stamp()}] auth <- ${res.statusCode} FAIL body=${(body||'').slice(0, 300)}`);
          reject(new Error(`Login failed: HTTP ${res.statusCode} — ${body.slice(0, 200)}`));
        }
      });
    });

    req.on('error', err => reject(new Error('Login request failed: ' + err.message)));
    req.end();
  });
}

// ── GET /config ───────────────────────────────────────────────────────────────
app.get('/config', (req, res) => {
  try { res.json({ ok: true, config: readConfig() }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /config — save and re-login ─────────────────────────────────────────
app.post('/config', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object')
      return res.status(400).json({ ok: false, error: 'Invalid payload' });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(req.body, null, 2), 'utf8');
    console.log('[config] Saved');
    // Invalidate session so next proxy call re-logins with new creds
    sessionCookie = null;
    sessionPortal = null;
    // Try to login immediately with new config
    try {
      await portalLogin(req.body);
    } catch(e) {
      console.warn('[auth] Re-login after config save failed:', e.message);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /api/login — login with credentials from body or config ──────────────
app.post('/api/login', async (req, res) => {
  try {
    let cfg = readConfig();
    // If body contains portal credentials, use them directly
    if (req.body && req.body.portal_url) {
      cfg = {
        portal: {
          url:    req.body.portal_url,
          apiKey: req.body.api_key,
          userId: req.body.user_id,
        }
      };
    }
    await portalLogin(cfg);
    res.json({ ok: true, message: 'Logged in successfully' });
  } catch(err) {
    res.status(401).json({ ok: false, error: err.message });
  }
});

// ── GET /api/status — connection status ───────────────────────────────────────
app.get('/api/status', (req, res) => {
  if (sessionCookie !== null && sessionPortal) {
    res.json({ connected: true, portal_url: sessionPortal, version: sessionVersion });
  } else {
    res.json({ connected: false });
  }
});

// ── GET /api/portal-version — detect (or return cached) portal version ────────
app.get('/api/portal-version', async (req, res) => {
  if (!sessionPortal) return res.json({ ok: false, error: 'Not connected', version: null });
  if (req.query.refresh !== '1' && sessionVersion) {
    return res.json({ ok: true, version: sessionVersion, cached: true });
  }
  try {
    const result = await detectPortalVersion(sessionPortal, sessionCookie);
    sessionVersion = result.version;
    res.json({ ok: true, version: result.version, raw: result.raw, cached: false });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, version: null });
  }
});

// ── GET /api/skills ───────────────────────────────────────────────────────────
app.get('/api/skills', (req, res) => {
  try {
    const cfg = readConfig();
    const enabledMap = cfg.skills || {};
    const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.md'));
    const skills = files.map(filename => {
      const name    = filename.replace(/\.md$/, '');
      const content = fs.readFileSync(path.join(SKILLS_DIR, filename), 'utf8');
      const tokens  = Math.round(content.length / 4);
      return { name, filename, tokens, enabled: enabledMap[name] !== false };
    });
    res.json({ ok: true, skills });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── GET /api/skills/:name ─────────────────────────────────────────────────────
app.get('/api/skills/:name', (req, res) => {
  try {
    const filename = req.params.name.replace(/[^a-zA-Z0-9_\-]/g, '') + '.md';
    const filepath = path.join(SKILLS_DIR, filename);
    if (!fs.existsSync(filepath))
      return res.status(404).json({ ok: false, error: 'Skill not found' });
    const content = fs.readFileSync(filepath, 'utf8');
    res.json({ ok: true, content });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── Debug logging helpers ─────────────────────────────────────────────────────
let _reqCounter = 0;
const nextReqId = () => '#' + (++_reqCounter).toString().padStart(4, '0');
const ts        = () => new Date().toISOString().slice(11, 23);   // HH:MM:SS.mmm
function maskKey(k) {
  if (!k) return '(none)';
  if (k.length < 14) return k.slice(0, 4) + '\u2026';
  return k.slice(0, 8) + '\u2026' + k.slice(-4);
}
function snippet(s, n) {
  if (!s) return '';
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '\u2026' : s;
}

// ── POST /api/anthropic ───────────────────────────────────────────────────────
app.post('/api/anthropic', (req, res) => {
  const rid = nextReqId();
  let cfg;
  try { cfg = readConfig(); } catch (err) {
    console.log(`[${ts()}] anthropic ${rid} CONFIG ERR — ${err.message}`);
    return res.status(500).json({ ok: false, error: 'Cannot read config: ' + err.message });
  }
  const apiKey = cfg.anthropic?.apiKey || '';
  if (!apiKey || apiKey.startsWith('sk-ant-your-')) {
    console.log(`[${ts()}] anthropic ${rid} REJECTED — API key not configured`);
    return res.status(400).json({ ok: false, error: 'Anthropic API key not configured' });
  }

  const model   = cfg.anthropic?.model || 'claude-sonnet-4-6';
  const body    = { model, max_tokens: 8096, ...req.body };
  const bodyStr = JSON.stringify(body);

  console.log(`[${ts()}] anthropic ${rid} -> ${model} key=${maskKey(apiKey)} bytes=${bodyStr.length}`);

  const options = {
    hostname: 'api.anthropic.com', port: 443, path: '/v1/messages', method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'Content-Length':    Buffer.byteLength(bodyStr),
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
  };

  const proxyReq = https.request(options, proxyRes => {
    const status = proxyRes.statusCode;
    res.status(status);
    ['content-type', 'transfer-encoding'].forEach(h => {
      if (proxyRes.headers[h]) res.setHeader(h, proxyRes.headers[h]);
    });
    if (status >= 400) {
      // Buffer error responses so we can log the body
      let body = '';
      proxyRes.on('data', c => { body += c; });
      proxyRes.on('end', () => {
        console.log(`[${ts()}] anthropic ${rid} <- ${status}  ERR: ${snippet(body, 400)}`);
        res.send(body);
      });
    } else {
      console.log(`[${ts()}] anthropic ${rid} <- ${status}  OK`);
      proxyRes.pipe(res);
    }
  });
  proxyReq.on('error', err => {
    console.log(`[${ts()}] anthropic ${rid} NETWORK ERR — ${err.message}`);
    if (!res.headersSent) res.status(502).json({ ok: false, error: err.message });
  });
  proxyReq.write(bodyStr);
  proxyReq.end();
});

// ── ALL /api/proxy/* ──────────────────────────────────────────────────────────
app.all('/api/proxy/*', async (req, res) => {
  const rid = nextReqId();
  let cfg;
  try { cfg = readConfig(); } catch (err) {
    console.log(`[${ts()}] proxy ${rid} CONFIG ERR — ${err.message}`);
    return res.status(500).json({ ok: false, error: 'Cannot read config: ' + err.message });
  }

  const portalUrl = (cfg.portal?.url || '').replace(/\/$/, '');
  if (!portalUrl) {
    console.log(`[${ts()}] proxy ${rid} REJECTED — portal URL not configured`);
    return res.status(400).json({ ok: false, error: 'Portal URL not configured' });
  }

  // Login if we don't have a session yet, or if the portal URL changed
  if (!sessionCookie && sessionCookie !== '') {
    try {
      console.log(`[${ts()}] proxy ${rid} -> first login (no session) for ${portalUrl}`);
      await portalLogin(cfg);
    } catch(err) {
      console.log(`[${ts()}] proxy ${rid} LOGIN FAIL — ${err.message}`);
      return res.status(401).json({ ok: false, error: 'Portal login failed: ' + err.message });
    }
  }

  const portalApiKey = cfg.portal?.apiKey || '';

  const doRequest = (cookie) => new Promise((resolve, reject) => {
    const downstreamPath = req.path.replace(/^\/api\/proxy/, '') || '/';
    const query          = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const targetUrl      = `${portalUrl}${downstreamPath}${query}`;
    const parsed         = new URL(targetUrl);
    const isHttps        = parsed.protocol === 'https:';
    const lib            = isHttps ? https : http;

    const headers = {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    };
    if (cookie)         headers['Cookie']     = cookie;
    // Also send the portal API key as a header — some Zuar portal versions
    // require this in addition to (or instead of) the JWT session cookie. With
    // both present, cookie auth wins; if it expires, X-Api-Key takes over and
    // the portal stops returning "invalid x-api-key" errors.
    if (portalApiKey)   headers['X-Api-Key']  = portalApiKey;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   req.method,
      headers,
    };

    const proxyReq = lib.request(options, proxyRes => {
      let body = '';
      proxyRes.on('data', c => { body += c; });
      proxyRes.on('end', () => resolve({ status: proxyRes.statusCode, headers: proxyRes.headers, body }));
    });
    proxyReq.on('error', err => reject(err));
    if (['POST','PUT','PATCH'].includes(req.method) && req.body)
      proxyReq.write(JSON.stringify(req.body));
    proxyReq.end();
  });

  const downstreamPath = req.path.replace(/^\/api\/proxy/, '') || '/';
  console.log(`[${ts()}] proxy ${rid} -> ${req.method} ${downstreamPath}  cookie=${sessionCookie ? 'yes' : 'no'} xapikey=${portalApiKey ? maskKey(portalApiKey) : '(none)'}`);

  try {
    let result = await doRequest(sessionCookie);

    // If 401, re-login once and retry
    if (result.status === 401) {
      console.log(`[${ts()}] proxy ${rid} got 401 with session cookie, re-logging in\u2026`);
      try {
        const newCookie = await portalLogin(cfg);
        result = await doRequest(newCookie);
        console.log(`[${ts()}] proxy ${rid} retry after re-login -> ${result.status}`);
      } catch(loginErr) {
        console.log(`[${ts()}] proxy ${rid} RE-LOGIN FAIL — ${loginErr.message}`);
        return res.status(401).json({ ok: false, error: 'Re-login failed: ' + loginErr.message });
      }
    }

    if (result.status >= 400) {
      console.log(`[${ts()}] proxy ${rid} <- ${result.status}  ERR: ${snippet(result.body, 400)}`);
    } else {
      console.log(`[${ts()}] proxy ${rid} <- ${result.status}`);
    }

    res.status(result.status);
    ['content-type', 'content-length'].forEach(h => {
      if (result.headers[h]) res.setHeader(h, result.headers[h]);
    });
    res.send(result.body);

  } catch(err) {
    console.log(`[${ts()}] proxy ${rid} NETWORK ERR — ${err.message}`);
    if (!res.headersSent) res.status(502).json({ ok: false, error: err.message });
  }
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(__dirname));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  const cfg = (() => { try { return readConfig(); } catch { return {}; } })();
  const ghOk   = !!(cfg.github?.token && !cfg.github.token.includes('your-'));
  const aiOk   = !!(cfg.anthropic?.apiKey && !cfg.anthropic.apiKey.includes('your-'));
  const skills = (() => { try { return fs.readdirSync(SKILLS_DIR).filter(f=>f.endsWith('.md')).length; } catch { return 0; } })();

  console.log('');
  console.log('  ╔════════════════════════════════════════════╗');
  console.log('  ║    Zuar Block Builder — Dev Server         ║');
  console.log('  ╠════════════════════════════════════════════╣');
  console.log(`  ║   http://localhost:${PORT}                     ║`);
  console.log('  ╠════════════════════════════════════════════╣');

  // Attempt portal login on startup
  if (cfg.portal?.url && cfg.portal?.apiKey && cfg.portal?.userId) {
    try {
      await portalLogin(cfg);
      console.log(`  ║   Portal   ✓ logged in${' '.repeat(20)}║`);
    } catch(e) {
      console.log(`  ║   Portal   ✗ login failed${' '.repeat(17)}║`);
      console.log(`  ║   ${e.message.slice(0,40)}${' '.repeat(Math.max(0,40-e.message.length))}║`);
    }
  } else {
    console.log(`  ║   Portal   ✗ not configured${' '.repeat(15)}║`);
  }

  console.log(`  ║   GitHub   ${ghOk ? '✓ configured   ' : '✗ not configured'} ${' '.repeat(15)}║`);
  console.log(`  ║   Claude   ${aiOk ? '✓ configured   ' : '✗ not configured'} ${' '.repeat(15)}║`);
  console.log(`  ║   Skills   ${skills} file(s) found${' '.repeat(20)}║`);
  console.log('  ╚════════════════════════════════════════════╝');
  console.log('');
});
