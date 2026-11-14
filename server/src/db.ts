import { DatabaseSync } from 'node:sqlite'
import { config } from './config.js'
import { now } from './util.js'

export const db = new DatabaseSync(config.dbPath)

db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')
db.exec('PRAGMA busy_timeout = 5000')

db.exec(`
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  api_version TEXT NOT NULL DEFAULT '',
  default_model TEXT NOT NULL DEFAULT '',
  models TEXT NOT NULL DEFAULT '[]',
  config TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#6d5efc',
  pinned INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#6d5efc',
  provider_id TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  max_depth INTEGER NOT NULL DEFAULT 2,
  max_steps INTEGER NOT NULL DEFAULT 8,
  can_spawn INTEGER NOT NULL DEFAULT 1,
  builtin INTEGER NOT NULL DEFAULT 0,
  is_orchestrator INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT '',
  parent_chat_id TEXT NOT NULL DEFAULT '',
  root_chat_id TEXT NOT NULL DEFAULT '',
  agent_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT 'New chat',
  provider_id TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'root',
  status TEXT NOT NULL DEFAULT 'idle',
  metadata TEXT NOT NULL DEFAULT '{}',
  archived_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  reasoning TEXT NOT NULL DEFAULT '',
  tool_calls TEXT NOT NULL DEFAULT '[]',
  tool_call_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'complete',
  usage TEXT NOT NULL DEFAULT '{}',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  root_run_id TEXT NOT NULL DEFAULT '',
  parent_run_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT NOT NULL DEFAULT '',
  usage TEXT NOT NULL DEFAULT '{}',
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  root_run_id TEXT NOT NULL,
  root_chat_id TEXT NOT NULL DEFAULT '',
  chat_id TEXT NOT NULL,
  parent_chat_id TEXT NOT NULL DEFAULT '',
  parent_task_id TEXT NOT NULL DEFAULT '',
  agent_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  provider_id TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  depth INTEGER NOT NULL DEFAULT 1,
  error TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT '',
  usage TEXT NOT NULL DEFAULT '{}',
  started_at INTEGER,
  ended_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  agent_a TEXT NOT NULL,
  agent_b TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(project_id, agent_a, agent_b)
);

CREATE TABLE IF NOT EXISTS agent_memory (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'task',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_queue (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT '',
  chat_id TEXT NOT NULL,
  content TEXT NOT NULL,
  file_ids TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  agent_id TEXT NOT NULL DEFAULT '',
  chat_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  modified_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(project_id, path)
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  transport TEXT NOT NULL DEFAULT 'stdio',
  command TEXT NOT NULL DEFAULT '',
  args TEXT NOT NULL DEFAULT '[]',
  url TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_secrets (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_type, owner_id, name)
);

CREATE INDEX IF NOT EXISTS idx_chats_parent ON chats(parent_chat_id);
CREATE INDEX IF NOT EXISTS idx_chats_project ON chats(project_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_chat ON tasks(chat_id);
CREATE INDEX IF NOT EXISTS idx_tasks_root ON tasks(root_run_id);
CREATE INDEX IF NOT EXISTS idx_runs_chat ON runs(chat_id, started_at);
CREATE INDEX IF NOT EXISTS idx_agent_links_project ON agent_links(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent ON agent_memory(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_project ON agent_memory(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_files_chat ON chat_files(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_queue_chat ON chat_queue(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id, modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled, name);
CREATE INDEX IF NOT EXISTS idx_integration_secrets_owner ON integration_secrets(owner_type, owner_id);
`)

// Lightweight migrations for databases created by earlier releases.
function hasColumn(table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return columns.some((entry) => entry.name === column)
}

if (!hasColumn('chats', 'archived_at')) {
  db.exec('ALTER TABLE chats ADD COLUMN archived_at INTEGER NOT NULL DEFAULT 0')
}
if (!hasColumn('agents', 'project_id')) {
  db.exec("ALTER TABLE agents ADD COLUMN project_id TEXT NOT NULL DEFAULT ''")
}
if (!hasColumn('agents', 'is_orchestrator')) {
  db.exec('ALTER TABLE agents ADD COLUMN is_orchestrator INTEGER NOT NULL DEFAULT 0')
}
if (!hasColumn('messages', 'metadata')) {
  db.exec("ALTER TABLE messages ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'")
}
if (!hasColumn('projects', 'workspace_path')) {
  db.exec("ALTER TABLE projects ADD COLUMN workspace_path TEXT NOT NULL DEFAULT ''")
}
if (!hasColumn('projects', 'pinned')) {
  db.exec('ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0')
}
if (!hasColumn('projects', 'sort_order')) {
  db.exec('ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')
}
if (!hasColumn('mcp_servers', 'description')) {
  db.exec("ALTER TABLE mcp_servers ADD COLUMN description TEXT NOT NULL DEFAULT ''")
}
db.exec('CREATE INDEX IF NOT EXISTS idx_chats_archived ON chats(archived_at)')
db.exec('CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id, created_at)')
db.exec('CREATE INDEX IF NOT EXISTS idx_chats_project ON chats(project_id, last_message_at DESC)')

const defaultSettings: Record<string, string> = {
  defaultProviderId: '',
  defaultModel: '',
  maxDepth: '3',
  maxParallel: '4',
  maxAgents: '24',
  maxSteps: '8',
  workspaceName: 'OpenCodex',
  autoTitle: 'true',
}

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
for (const [key, value] of Object.entries(defaultSettings)) insertSetting.run(key, value)

export function closeDb() {
  try {
    db.close()
  } catch {
    // ignore
  }
}
