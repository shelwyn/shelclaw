# Activepieces Integration Plan

Status: proposed. This document describes how Shelclaw will integrate the self-hosted Activepieces engine without embedding the Activepieces builder UI or using Activepieces as the orchestration engine.

## 1. Responsibilities

| Layer | Responsibility |
| --- | --- |
| OpenCode | Agent execution |
| Shelclaw Orchestrator | Multi-agent coordination, routing, reports |
| Memory graph | Agent knowledge and relationships |
| PGVector | Semantic retrieval (future retrieval service) |
| Activepieces | External integrations, connected apps and workflow automation |
| MCP | Tool communication between agents and Activepieces |

Shelclaw owns intelligence and conversation state. Activepieces owns external actions, connections and durable automation.

## 2. Licensing boundaries

- Community Edition core is MIT licensed and can be self-hosted, modified and used commercially.
- Enterprise-only features require a commercial licence.
- The official embedded builder is an enterprise capability. Shelclaw will **not** embed it.
- Shelclaw will link out to the self-hosted Activepieces UI for building flows and OAuth connections.
- Shelclaw will communicate through documented APIs and MCP only.

## 3. Architecture

```text
Browser
  ├─ Shelclaw UI (our frontend)
  │    ├─ settings/Activepieces
  │    ├─ flow picker + per-flow instructions
  │    └─ chat + tool-call status
  │
  ├─ Shelclaw server
  │    ├─ existing orchestrator + agents
  │    ├─ Activepieces client (API + MCP)
  │    ├─ encrypted integration vault (existing)
  │    └─ approval/audit hooks
  │
  └─ Activepieces (self-hosted)
       ├─ app/UI + API       :8080
       ├─ worker             internal
       ├─ postgres+pgvector  internal
       └─ redis              internal
```

## 4. Services and ports

| Service | Host port | Internal port | Purpose |
| --- | ---: | ---: | --- |
| Shelclaw app | 8787 | 8787 | UI, API, SSE, orchestrator |
| Activepieces app/API | 8080 | 80 | Builder UI, REST API, MCP endpoint |
| Activepieces worker | none | none | Flow execution |
| Activepieces PostgreSQL | none | 5432 | Flows, runs, connections, pgvector |
| Activepieces Redis | none | 6379 | Job queue/cache |
| OpenCode server | 4096 (host) | host.docker.internal:4096 | Agent harness |

`./selfhost.sh up` starts Shelclaw, Activepieces app/worker, PostgreSQL and Redis. Only 8787 and 8080 are exposed by default.

## 5. Settings → Activepieces

New settings tab, separate from MCP Servers.

Fields:

- **Activepieces URL** (for example `http://localhost:8080`)
- **API key / MCP credential** (encrypted; never returned by the API)
- **MCP endpoint URL** (for example `http://localhost:8080/mcp`)
- **Project ID** (optional; fetched from the API)
- **Test connection**
- **Open Activepieces** link
- **Sync flows**
- **Expose to agents** global toggle
- **Default approval policy** (future)

Reuse `integration_secrets` for encrypted credentials. Never put credentials in prompts or tool definitions.

## 6. Backend design

### Data model

```sql
activepieces_settings (
  id TEXT PRIMARY KEY,
  base_url TEXT NOT NULL,
  mcp_url TEXT NOT NULL,
  project_id TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0,
  last_status TEXT NOT NULL DEFAULT '',
  last_checked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

activepieces_flows (
  id TEXT PRIMARY KEY,
  remote_flow_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  folder TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  synced_at INTEGER NOT NULL
);
```

Credentials go into the existing `integration_secrets` table
(`owner_type='activepieces'`), encrypted with the existing AES-256-GCM vault.

### API endpoints

- `GET /api/activepieces` — safe settings, flow cache, status
- `PATCH /api/activepieces` — update URL/project/toggles; credentials optional
- `POST /api/activepieces/test` — health + authenticated API check
- `POST /api/activepieces/sync` — refresh projects/flows from Activepieces
- `PATCH /api/activepieces/flows/:id` — enable/disable, instructions
- `POST /api/activepieces/flows/:id/run` — manual run with optional input
- `GET /api/activepieces/runs/:id` — run status/output

All responses omit credential values. Errors are sanitized before display.

### Agent tools

Two possible modes, both backed by the same server-side client:

1. **MCP mode (preferred)**
   - Connect the self-hosted Activepieces MCP endpoint through the existing MCP subsystem.
   - Discover its tools (`ap_list_flows`, `ap_run_action`, `ap_test_flow`, etc.).
   - Add per-tool instructions in Settings → MCP Servers.
   - Credentials remain in the MCP vault/OAuth store.

2. **Direct API mode**
   - Expose a narrow `activepieces_run_flow` tool plus a flow catalog from the synced cache.
   - Use this when the self-hosted MCP endpoint is unavailable.

Agents see only flow names, descriptions, instructions and input schemas.

## 7. Chat behavior

- Orchestrator routes external-action requests to the appropriate agent (existing routing).
- Agent calls Activepieces through MCP/API.
- Live status in the composer shows `Calling <flow/action> · Activepieces`.
- Tool result is returned to the agent for synthesis.
- The memory graph records the outcome.
- Sensitive actions can require an approval gate before execution.

Example:

1. Research agent identifies a customer issue.
2. Analysis agent investigates.
3. Orchestrator decides the next action.
4. Activepieces creates a Jira ticket, sends email and updates a sheet.
5. Memory graph records the outcome.

## 8. Self-hosting and GitHub workflow

Files added:

- `selfhost.sh` — generates secrets/config if missing, builds and starts the stack.
- `docker-compose.selfhost.yml` — Shelclaw + Activepieces app/worker + PostgreSQL/Redis.
- `.selfhost/*.env` — generated, gitignored secrets.
- `backups/` — gitignored backup output.

Commands:

```bash
git pull
./selfhost.sh              # first run creates config and starts everything
./selfhost.sh status
./selfhost.sh logs
./selfhost.sh backup
./selfhost.sh down
```

All services are one repository and one compose project. The app still builds from the existing Dockerfile.

## 9. Implementation phases

### Phase 1 — deployment foundation (this change)

- [x] Self-host compose stack.
- [x] `selfhost.sh` with up/down/logs/status/backup/reset.
- [x] Document services and ports.
- [ ] Verify Activepieces version resolution on the target machine.

### Phase 2 — connection settings

- [ ] Add Settings → Activepieces tab.
- [ ] Store URL/project/credentials encrypted.
- [ ] Test connection and health.
- [ ] Open Activepieces link.

### Phase 3 — flow catalog

- [ ] Sync flows via API.
- [ ] Cache flows locally.
- [ ] Enable/disable and per-flow instructions.
- [ ] Expose instructions to agents.

### Phase 4 — agent execution

- [ ] MCP endpoint integration and OAuth/credential handling.
- [ ] `activepieces_run_flow` / `activepieces_run_action`.
- [ ] Live status, result rendering, run links.
- [ ] Per-flow approval policy.

### Phase 5 — enterprise controls

- [ ] Audit log for external actions.
- [ ] Approval inbox.
- [ ] Role-based permissions.
- [ ] Secret-manager adapter.
- [ ] PGVector retrieval integration.

## 10. Security requirements

- Activepieces credentials and OAuth tokens encrypted at rest.
- Credentials never enter prompts, tool descriptions, chat messages or logs.
- API responses return only flags/key names.
- Tool outputs are untrusted data.
- Approval gates for destructive or customer-facing actions.
- Activepieces stays on a private network; only its UI port is exposed intentionally.
- Back up `.selfhost/*.env`, `secret.key`, Shelclaw data volume and Activepieces PostgreSQL volume.

## 11. Risks

- Activepieces API-key availability may depend on edition; MCP may be the primary path.
- MCP OAuth may require a browser flow; server-side token storage must be designed carefully.
- Activepieces image/version drift and env changes.
- Sandboxed execution requires Docker resources; Activepieces recommends at least 2 vCPU / 4 GB RAM.
- Licensing: keep enterprise-only features out unless a licence is present.

## 12. Acceptance criteria

- `git pull && ./selfhost.sh` starts Shelclaw and Activepieces with persistent data.
- Settings → Activepieces tests the connection without exposing credentials.
- Flows can be synced, enabled, and given agent instructions.
- A chat request can trigger an Activepieces action/flow and show its result.
- Credentials never appear in prompts, API responses or logs.
- Restarting containers preserves settings, flows, credentials and Shelclaw data.
