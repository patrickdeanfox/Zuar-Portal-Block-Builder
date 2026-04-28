# Zuar Block Builder

A local desktop app for managing Zuar Portal blocks with full GitHub version control.

## Files

```
block-builder/
  server.js       ← Express local server (proxy + config read/write)
  index.html      ← Main app UI
  config.json     ← Your credentials (never commit this!)
  package.json
  .gitignore
  README.md
```

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create config.json
Copy the template and fill in your real credentials:
```bash
cp config.example.json config.json
```
Then edit `config.json`:
```json
{
  "portal": {
    "url": "https://your-portal.zuarbase.net",
    "apiKey": "your-portal-api-key"
  },
  "github": {
    "token": "ghp_your-github-token",
    "owner": "your-github-username",
    "repo": "zportal-blocks",
    "branch": "main"
  }
}
```

**Portal API Key:** Admin → Auth → API Keys in your portal.  
**GitHub Token:** github.com → Settings → Developer Settings → Personal Access Tokens → `repo` scope required.

### 3. Start the server
```bash
node server.js
```

### 4. Open in browser
```
http://localhost:3131
```

---

## Features

### Block Management (CRUD)
- Browse all portal blocks in a searchable card grid
- Filter by block type (html, amchart, multiselect, date-time, data-table)
- Create new blocks with a full editor drawer
- Edit existing blocks (HTML/JS, CSS, datasource config, tags)
- Delete blocks with confirmation

### GitHub Version Control (per-block)
Each block card has:
- **Push** — manually push a block to GitHub with a custom commit message
- **History** — view the commit history for that block's files inline
- **Restore** — select any past commit, view a live diff, and restore to portal

### Auto-push on Save
Every time you create or update a block, it is automatically pushed to GitHub  
with the commit message: `[created] Block Name` or `[updated] Block Name`.

Restore operations auto-push with: `[restored] Block Name from abc1234`

### GitHub File Structure
```
blocks/
  your-portal-zuarbase-net/
    my-block-name--<id-8chars>/
      meta.json     ← identity, timestamps, datasource config
      block.html    ← HTML+JS content (html blocks)
      block.css     ← CSS content
      config.json   ← widget config (non-html blocks)
```

---

## Settings
Click the **Settings** button (gear icon) or the GitHub pill in the header  
to update portal URL, API key, and GitHub credentials. Changes are saved  
back to `config.json` automatically.

Use **Test Connections** to verify both portal and GitHub connectivity  
before working.

---

## Security Notes
- `config.json` contains sensitive credentials. Add it to `.gitignore`.
- The server runs on `localhost:3131` only — it is not exposed externally.
- The portal proxy injects your API key server-side; credentials never touch the browser directly.
