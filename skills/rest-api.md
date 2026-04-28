# Zuar Portal REST API Reference

Two API services are available in Zuar Portal:

- **Portal API** — base path `/api` — content, data, and configuration
- **Auth API** — base path `/auth` — users, groups, authentication, and access control

Authentication is handled automatically via the JWT session cookie for same-origin requests.

---

## Portal API (`/api`)

### Blocks — `/api/blocks`

HTML blocks and other block types on portal pages.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/blocks` | List all blocks (filter by `block_ids[]`, `only_names`) |
| POST | `/api/blocks` | Create a block |
| GET | `/api/blocks/{block_id}` | Get a block by UUID |
| PUT | `/api/blocks/{block_id}` | Update a block |
| DELETE | `/api/blocks/{block_id}` | Delete a block |

**Block Request body:**
```json
{
  "name": "My Block",
  "type": "html",
  "data": { "__source__": "<datasource-uuid>", "columns": ["*"], "limit": 500 },
  "css": [],
  "json_data": {},
  "tags": ["tag1"],
  "access": { "groups": ["group-name"] }
}
```

**Block types:** `html`, `data-table`, `amchart`, `multiselect`, `date-time`, `clear-filters-button`, `tableau-dashboard`, `user-menu`

---

### Datasources — `/api/datasources`

Datasources define SQL queries against a database connection.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/datasources` | List all datasources |
| POST | `/api/datasources` | Create a datasource |
| GET | `/api/datasources/{datasource_id}` | Get datasource by UUID |
| PUT | `/api/datasources/{datasource_id}` | Update datasource |
| DELETE | `/api/datasources/{datasource_id}` | Delete datasource |
| GET | `/api/datasources/{datasource_id}/data` | Fetch datasource data (GET, supports `:limit`, `:offset`, `:order_by`, `:count_results`) |
| POST | `/api/datasources/{datasource_id}/data` | Fetch datasource data with filters (POST body) |

**Datasource Request body:**
```json
{
  "name": "Sales by State",
  "sql": "SELECT state, SUM(amount) as total FROM sales GROUP BY state",
  "tags": ["sales"],
  "database_connection": { "type": "stored", "id": "<credentials-uuid>" }
}
```

**Data Request body (POST /data):**
```json
{
  "filters": { "state": ["CA", "TX"] },
  "filters_params": {
    "state": { "matching_pattern": "strict" }
  },
  "queries": [
    {
      "columns": ["state", "total"],
      "limit": 500,
      "offset": 0,
      "order_by": "total DESC",
      "where": "total > 0",
      "group_by": "state",
      "distinct": false,
      "count_results": true
    }
  ]
}
```

**Data Response shape:**
```json
{
  "results": [
    {
      "sql": "...",
      "columns": [{ "name": "state" }, { "name": "total" }],
      "data": [["CA", 12000], ["TX", 9500]],
      "count": 2,
      "offset": 0,
      "limit": 500,
      "execution_time": 0.034
    }
  ]
}
```

`filters_params.matching_pattern` options: `strict` (default), `like`, `ilike`

---

### DB Modifications — `/api/db_modifications`

Pre-defined SQL write templates that blocks can execute at runtime.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/db_modifications` | List modifications (filter by `db_modification_ids[]`, `db_modification_names[]`) |
| POST | `/api/db_modifications` | Create a modification |
| GET | `/api/db_modifications/{id_or_name}` | Get by UUID or name |
| PUT | `/api/db_modifications/{id}` | Update by UUID |
| DELETE | `/api/db_modifications/{id}` | Delete by UUID |
| **POST** | **`/api/db_modifications/run`** | **Execute one or more modifications** |

**Create Request body:**
```json
{
  "name": "log_feedback",
  "sql": "INSERT INTO feedback (user_id, message, created_at) VALUES (:user_id, :message, NOW())",
  "credentials_id": "<credentials-uuid>",
  "default_params": { "user_id": null },
  "access": { "groups": ["editors"] }
}
```

**Run Request body (used from HTML blocks):**
```json
{
  "db_modifications": [
    {
      "name": "log_feedback",
      "params": { "user_id": "abc123", "message": "Great dashboard!" }
    }
  ],
  "autocommit": false,
  "ignore_sql_errors": false
}
```

For bulk inserts, use `params_list` instead of `params`:
```json
{
  "db_modifications": [
    {
      "name": "log_feedback",
      "params_list": [
        { "user_id": "abc123", "message": "Great!" },
        { "user_id": "def456", "message": "Helpful!" }
      ]
    }
  ]
}
```

---

### Layouts — `/api/layouts`

Portal pages/layouts that contain blocks.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/layouts` | List all layouts |
| POST | `/api/layouts` | Create a layout |
| GET | `/api/layouts/{layout_id}` | Get layout by UUID |
| PUT | `/api/layouts/{layout_id}` | Update layout |
| DELETE | `/api/layouts/{layout_id}` | Delete layout |

**Layout Request body:**
```json
{
  "name": "Sales Dashboard",
  "order": 10,
  "icon": "fa-chart-bar",
  "json_data": {},
  "tags": ["sales"],
  "access": { "groups": ["sales-team"] }
}
```

---

### Dashboards — `/api/dashboards`

Embedded iframe dashboards (Tableau, Looker, etc.) with optional filter panels.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboards` | List all dashboards |
| POST | `/api/dashboards` | Create a dashboard |
| GET | `/api/dashboards/{dashboard_id}` | Get by UUID |
| PUT | `/api/dashboards/{dashboard_id}` | Update |
| DELETE | `/api/dashboards/{dashboard_id}` | Delete |

**Dashboard Request body:**
```json
{
  "name": "Revenue Overview",
  "url": "https://tableau.example.com/views/Revenue/Overview",
  "order": 1000,
  "icon": "fa-dollar-sign"
}
```

---

### Themes — `/api/themes`

Visual themes applied to the portal.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/themes` | List all themes |
| POST | `/api/themes` | Create a theme |
| GET | `/api/themes/{theme_id}` | Get by UUID |
| PUT | `/api/themes/{theme_id}` | Update |
| DELETE | `/api/themes/{theme_id}` | Delete |

---

### Snippets — `/api/snippets`

Reusable code/text snippets.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/snippets` | List snippets |
| POST | `/api/snippets` | Create snippet |
| GET | `/api/snippets/{snippet_id}` | Get by UUID |
| PUT | `/api/snippets/{snippet_id}` | Update |
| DELETE | `/api/snippets/{snippet_id}` | Delete |

---

### Partials — `/api/partials`

Shared layout partials (headers, footers, etc.).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/partials` | List all partials |
| POST | `/api/partials` | Create partial |
| GET | `/api/partials/{partial_id}` | Get by UUID |
| PUT | `/api/partials/{partial_id}` | Update |
| DELETE | `/api/partials/{partial_id}` | Delete |

---

### Translations — `/api/translations`

Localization entries.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/translations` | List translations |
| POST | `/api/translations` | Create (requires `code` 2–5 chars, `name`) |
| GET | `/api/translations/{translation_id}` | Get by UUID |
| PUT | `/api/translations/{translation_id}` | Update |
| DELETE | `/api/translations/{translation_id}` | Delete |

---

### Credentials — `/api/credentials`

Database connection credentials stored in the portal.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/credentials` | List (filter by `credentials_ids[]`, `types[]`, `tags[]`) |
| POST | `/api/credentials` | Create |
| PUT | `/api/credentials/{credentials_id}` | Update |
| DELETE | `/api/credentials/{credentials_id}` | Delete |
| GET | `/api/credentials_types` | List available credential types |

**Credentials Request body:**
```json
{
  "name": "Production DB",
  "type": "postgresql",
  "data": { "host": "db.example.com", "port": 5432, "database": "prod", "user": "...", "password": "..." },
  "tags": ["production"]
}
```

---

### Tags — `/api/tags`

Tags for organizing blocks, datasources, layouts, etc.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tags` | List all tags |
| POST | `/api/tags` | Create tag (`name` required, 1–256 chars) |
| DELETE | `/api/tags/{name}` | Delete tag by name |

---

### System — `/api/system`

Key-value system settings.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/system` | List all system entries |
| POST | `/api/system` | Create entry |
| GET | `/api/system/{system_id}` | Get by UUID |
| PUT | `/api/system/{system_id}` | Update |
| DELETE | `/api/system/{system_id}` | Delete |

---

### Config — `/api/config`

System configuration.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config` | Get config (`?new_config_structure=true` for new format) |
| PUT | `/api/config` | Update a config value at a path |

**Config update body:**
```json
{
  "path": ["app", "features", "datasources", "enabled"],
  "value": true,
  "merge": false,
  "config_collection": "local",
  "config_name": "00_local_config.yml"
}
```

---

### Other Portal Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/about` | Current user info (id, username, fullname, is_admin, groups) |
| GET | `/api/version` | Portal version |
| POST | `/api/events` | Track a page view event |
| POST | `/api/thoughtspot_ts` | Generate ThoughtSpot trusted token |

---

---

## Auth API (`/auth`)

### Users — `/auth/users`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/users` | List users (filter by `search`, `source`, `sort`, `limit`, `offset`) |
| POST | `/auth/users` | Create user |
| GET | `/auth/users/{user_id}` | Get by UUID |
| PUT | `/auth/users/{user_id}` | Update user |
| DELETE | `/auth/users/{user_id}` | Delete user |
| GET | `/auth/users/{user_id}/permissions` | List user permissions |
| POST | `/auth/users/{user_id}/permissions` | Grant permission to user |
| PUT | `/auth/users/{user_id}/permissions` | Replace all user permissions |
| DELETE | `/auth/users/{user_id}/permissions/{permission_id}` | Revoke permission |
| GET | `/auth/users/{user_id}/groups` | List user groups |
| POST | `/auth/users/{user_id}/groups` | Add user to group |
| PUT | `/auth/users/{user_id}/groups` | Set all groups for user |
| DELETE | `/auth/users/{user_id}/groups/{group_id}` | Remove user from group |

**Create User body:**
```json
{
  "username": "jsmith",
  "fullname": "John Smith",
  "password": "secret",
  "email": "jsmith@example.com",
  "admin": false,
  "source": "LOCAL"
}
```

**User sources:** `LOCAL`, `SAML`, `TABLEAU`, `SCIM`

**Sort fields:** `username`, `fullname`, `source`

---

### Groups — `/auth/groups`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/groups` | List groups (filter by `search`, `source`, `ids[]`, `sort`, `limit`, `offset`) |
| POST | `/auth/groups` | Create group |
| GET | `/auth/groups/{group_id}` | Get by UUID |
| PUT | `/auth/groups/{group_id}` | Update group |
| DELETE | `/auth/groups/{group_id}` | Delete group |
| GET | `/auth/groups/{group_id}/permissions` | List group permissions |
| POST | `/auth/groups/{group_id}/permissions` | Grant permission to group |
| DELETE | `/auth/groups/{group_id}/permissions/{permission_id}` | Revoke permission from group |

**Group sources:** `LOCAL`, `SAML`, `TABLEAU`

---

### Permissions — `/auth/permissions`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/permissions` | List all permissions |
| POST | `/auth/permissions` | Create permission |
| GET | `/auth/permissions/{permission_id}` | Get by UUID |
| PUT | `/auth/permissions/{permission_id}` | Update |
| DELETE | `/auth/permissions/{permission_id}` | Delete |

---

### Access Policies — `/auth/access_policies`

Fine-grained access rules (subject → resource → action → allow/deny).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/access_policies` | List policies (filter by `project`, `subjects[]`, `resources[]`, `resource_ids[]`, `actions[]`, `access_decisions[]`) |
| POST | `/auth/access_policies` | Create policy |
| GET | `/auth/access_policies/{id}` | Get by UUID |
| PUT | `/auth/access_policies/{id}` | Update |
| DELETE | `/auth/access_policies/{id}` | Delete |
| DELETE | `/auth/access_policies` | Bulk delete by conditions |

**Create Access Policy body:**
```json
{
  "data": {
    "project": "my-portal",
    "subject": "group",
    "subject_id": "<group-uuid>",
    "resource": "layout",
    "resource_id": "<layout-uuid>",
    "action": "view",
    "access_decision": "allow"
  }
}
```

---

### API Keys — `/auth/api_keys`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/api_keys` | List API keys |
| POST | `/auth/api_keys` | Create API key (body: `{ "data": { "user_id": "<uuid>", "name": "..." } }`) |
| DELETE | `/auth/api_keys/{api_key_id}` | Delete API key |

---

### Authentication — `/auth/login`, `/auth/logout`, `/auth/me`

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/auth/login` | Login (form: `username`, `password`) |
| GET/POST | `/auth/logout` | Logout (redirects) |
| GET | `/auth/me` | Get current logged-in user |
| PATCH | `/auth/me` | Update current user (`fullname`, `email`) |
| POST | `/auth/passwd` | Change password (`old_password`, `new_password`) |
| POST | `/auth/forgot-password` | Request password reset email |
| POST | `/auth/reset-password` | Reset password with token |

---

### SSO / Auth Integrations

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/auth/saml/sso` | SAML SSO login |
| GET/POST | `/auth/saml/slo` | SAML Single Logout |
| GET | `/auth/openidc/redirect` | OpenID Connect redirect to provider |
| GET | `/auth/openidc/authorize` | OpenID Connect callback |
| POST | `/auth/vaulted` | Vault-based signed login |
| POST | `/auth/signed` | Signed request login |

---

### Tableau Integration

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/tableau/connected_app_jwt` | Generate Tableau Connected App JWT |
| POST | `/auth/tableau/rest_token` | Generate Tableau REST API token (`site` required) |
| GET/POST/PUT/DELETE/PATCH | `/auth/tableau/api_proxy/{path}` | Proxy requests to Tableau API |
| POST | `/auth/aad_token` | Generate Azure AD JWT token |

---

### Subscriptions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/subscriptions` | List subscriptions for current user |
| POST | `/auth/subscriptions` | Create subscription (legacy) |
| GET | `/auth/subscriptions/{id}` | Get by UUID |
| DELETE | `/auth/subscriptions/{id}` | Delete |
| GET | `/auth/subscriptions_ng` | List subscriptions (new, filter by `user_ids[]`) |
| POST | `/auth/subscriptions_ng` | Create subscription (new) |
| GET | `/auth/subscriptions_ng/{id}` | Get by UUID |
| DELETE | `/auth/subscriptions_ng/{id}` | Delete |

---

### Asset Manager

Serves, uploads, and manages static files (images, logos, attachments).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/asset_manager/files/{path}` | Retrieve/redirect to file |
| DELETE | `/auth/asset_manager/files/{path}` | Delete file |
| PUT | `/auth/asset_manager/files` | Upload or replace file (multipart) |
| POST | `/auth/asset_manager/files` | Upload file if not exists (multipart) |
| GET | `/auth/asset_manager/ls` | List files in a directory |
| GET | `/auth/asset_manager/ls/{dir}` | List files in a specific directory |
| POST | `/auth/asset_manager/copy` | Copy file (`source_path`, `destination_path`) |
| POST | `/auth/asset_manager/move` | Move file (`source_path`, `destination_path`) |
| GET | `/auth/asset_manager/search` | Search files (`query` min 3 chars, `directory_path`) |

`asset_manager_name` query param: `user` (default) or `system`

---

### SCIM (Provisioning)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/scim/v2/Users` | List SCIM users |
| POST | `/auth/scim/v2/Users` | Create SCIM user |
| GET | `/auth/scim/v2/Users/{id}` | Get SCIM user |
| PUT | `/auth/scim/v2/Users/{id}` | Replace SCIM user |
| PATCH | `/auth/scim/v2/Users/{id}` | Update SCIM user |
| DELETE | `/auth/scim/v2/Users/{id}` | Delete SCIM user |
| GET | `/auth/scim/v2/Groups` | List SCIM groups |
| POST | `/auth/scim/v2/Groups` | Create SCIM group |
| GET | `/auth/scim/v2/Groups/{id}` | Get SCIM group |
| PATCH | `/auth/scim/v2/Groups/{id}` | Update SCIM group |
| DELETE | `/auth/scim/v2/Groups/{id}` | Delete SCIM group |
| GET | `/auth/scim/v2/Schemas` | List SCIM schemas |

---

### Other Auth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/about` | Auth service info (payload, debug, token_expiry) |
| GET | `/auth/version` | Auth service version |
| GET | `/auth/config` | Get auth config |
| PUT | `/auth/config` | Update auth config |
