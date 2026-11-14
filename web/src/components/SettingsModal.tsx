import {
  Check,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  HelpCircle,
  KeyRound,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  Terminal,
  Trash2,
  Workflow,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useAppStore } from '../store'
import type { McpServer, Provider, ProviderKind } from '../types'
import { providerKindLabel, isHarnessKind } from '../lib/format'
import {
  Badge,
  Button,
  cn,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
  Toggle,
} from './ui'

interface ProviderTemplate {
  label: string
  kind: ProviderKind
  baseUrl?: string
  defaultModel?: string
  command?: string
  args?: string[]
  promptMode?: 'arg' | 'stdin'
  modelFlag?: string
  hint: string
}

const TEMPLATES: ProviderTemplate[] = [
  {
    label: 'OpenCode server',
    kind: 'opencode-server',
    baseUrl: 'http://127.0.0.1:4096',
    hint: 'Connect to a running `opencode serve` with its URL and password.',
  },
  {
    label: 'OpenCode CLI',
    kind: 'opencode',
    command: 'opencode',
    hint: 'Runs `opencode run` locally and uses your OpenCode configuration.',
  },
]

interface ProviderForm {
  name: string
  kind: ProviderKind
  baseUrl: string
  apiKey: string
  apiVersion: string
  defaultModel: string
  modelsText: string
  configText: string
  command: string
  argsText: string
  promptMode: 'arg' | 'stdin'
  modelFlag: string
  agent: string
  clearKey: boolean
}

const emptyForm = (): ProviderForm => ({
  name: '',
  kind: 'opencode-server',
  baseUrl: 'http://127.0.0.1:4096',
  apiKey: '',
  apiVersion: '',
  defaultModel: '',
  modelsText: '',
  configText: '{}',
  command: '',
  argsText: '',
  promptMode: 'arg',
  modelFlag: '',
  agent: 'build',
  clearKey: false,
})

function formFromProvider(provider: Provider): ProviderForm {
  const config = { ...(provider.config || {}) }
  const command = typeof config.command === 'string' ? config.command : ''
  const agent = typeof config.agent === 'string' ? config.agent : 'build'
  const args = Array.isArray(config.args) ? config.args.map(String) : []
  const promptMode = config.promptMode === 'stdin' ? 'stdin' : 'arg'
  const modelFlag = typeof config.modelFlag === 'string' ? config.modelFlag : ''
  delete config.command
  delete config.workdir
  delete config.agent
  delete config.args
  delete config.promptMode
  delete config.modelFlag
  return {
    name: provider.name,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    apiKey: '',
    apiVersion: provider.apiVersion,
    defaultModel: provider.defaultModel,
    modelsText: provider.models.join('\n'),
    configText: JSON.stringify(config, null, 2),
    command,
    argsText: args.join('\n'),
    promptMode,
    modelFlag,
    agent,
    clearKey: false,
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function isCli(kind: ProviderKind): boolean {
  return kind === 'opencode' || kind === 'claude-code'
}

function isLocalHarness(kind: ProviderKind): boolean {
  return kind === 'local-harness'
}

function isCommandHarness(kind: ProviderKind): boolean {
  return isCli(kind) || isLocalHarness(kind)
}

function isOpenCodeServer(kind: ProviderKind): boolean {
  return kind === 'opencode-server'
}

function kindIcon(kind: ProviderKind) {
  if (kind === 'opencode-server') return <Server className="h-3.5 w-3.5" />
  if (isCommandHarness(kind)) return <Terminal className="h-3.5 w-3.5" />
  return <Server className="h-3.5 w-3.5" />
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  const toast = useAppStore((state) => state.toast)
  return (
    <div className="mt-1 flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1.5">
      <code className="scroll-thin min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[10.5px] text-ink">
        {command}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch {
            toast('error', 'Clipboard is not available.')
          }
        }}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-faint hover:bg-panel2 hover:text-ink"
        aria-label="Copy command"
        title="Copy command"
      >
        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  )
}

function OpenCodeServerHelp() {
  return (
    <div className="rounded-xl border border-accent/25 bg-accent/5 p-3">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
        <Server className="h-3.5 w-3.5 text-accent" />
        Connect to a running OpenCode server
      </div>
      <ol className="mt-2 space-y-2.5 text-[10.5px] leading-relaxed text-muted">
        <li>
          <span className="font-medium text-ink">1. Start OpenCode</span> on the machine that has
          your models. Use <code className="font-mono">0.0.0.0</code> to expose it on your network,
          or <code className="font-mono">127.0.0.1</code> for this machine only:
          <CopyCommand command="opencode serve --hostname 0.0.0.0 --port 4096" />
          <div className="mt-1">
            It prints the complete URL and a generated password, for example{' '}
            <code className="font-mono">http://192.168.1.20:4096</code> and{' '}
            <code className="font-mono">server password …</code>.
          </div>
        </li>
        <li>
          <span className="font-medium text-ink">2. Paste both here.</span> Use the complete link
          with scheme, host and port, then the generated password.
        </li>
        <li>
          <span className="font-medium text-ink">3. Connect.</span> Use{' '}
          <span className="text-ink">Test connection</span>, then{' '}
          <span className="text-ink">Fetch models</span> (both work before saving). Models are
          listed as <code className="font-mono">provider/model</code>.
        </li>
      </ol>
      <div className="mt-2.5 border-t border-accent/15 pt-2 text-[10px] leading-relaxed text-muted">
        If OpenCode prints <code className="font-mono">0.0.0.0</code> in the URL, replace it with{' '}
        <code className="font-mono">127.0.0.1</code> for this machine or the machine&apos;s LAN IP
        for other devices. Remote host? Forward the port over SSH and keep{' '}
        <code className="font-mono">http://127.0.0.1:4096</code>. The generated password changes
        after a restart; set a fixed one with:
        <CopyCommand command="OPENCODE_PASSWORD='choose-a-password' opencode serve --hostname 0.0.0.0 --port 4096" />
      </div>
    </div>
  )
}

function ProviderFormView({
  provider,
  onDone,
  onCancel,
}: {
  provider: Provider | null
  onDone: () => void
  onCancel: () => void
}) {
  const refresh = useAppStore((state) => state.refresh)
  const toast = useAppStore((state) => state.toast)
  const [form, setForm] = useState<ProviderForm>(() =>
    provider ? formFromProvider(provider) : emptyForm(),
  )
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [savedProvider, setSavedProvider] = useState<Provider | null>(provider)
  const [advanced, setAdvanced] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const update = <K extends keyof ProviderForm>(key: K, value: ProviderForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const changeKind = (kind: ProviderKind) => {
    setForm((current) => {
      if (kind === 'opencode-server') {
        let host = ''
        try {
          host = new URL(current.baseUrl).hostname
        } catch {
          host = ''
        }
        const needsDefaultUrl = !current.baseUrl || !/^\d+\.\d+\.\d+\.\d+$/.test(host)
        return {
          ...current,
          kind,
          baseUrl: needsDefaultUrl ? 'http://127.0.0.1:4096' : current.baseUrl,
          agent: current.agent || 'build',
        }
      }
      if (kind === 'opencode') return { ...current, kind, command: current.command || 'opencode' }
      return { ...current, kind }
    })
  }

  const applyTemplate = (template: ProviderTemplate) => {
    setForm((current) => ({
      ...current,
      name: current.name || template.label,
      kind: template.kind,
      baseUrl: template.baseUrl ?? (isOpenCodeServer(template.kind) ? current.baseUrl : ''),
      apiVersion: '',
      defaultModel: template.defaultModel ?? '',
      command: template.command ?? '',
      argsText: (template.args || []).join('\n'),
      promptMode: template.promptMode || 'arg',
      modelFlag: template.modelFlag || '',
      agent: template.kind === 'opencode-server' ? 'build' : current.agent,
      configText: '{}',
    }))
  }

  const buildPayload = (): Record<string, unknown> | null => {
    let config: Record<string, unknown> = {}
    try {
      config = form.configText.trim() ? JSON.parse(form.configText) : {}
    } catch {
      toast('error', 'Advanced config must be valid JSON.')
      return null
    }
    if (isCommandHarness(form.kind)) {
      if (form.command.trim()) config.command = form.command.trim()
      const args = form.argsText
        .split('\n')
        .map((arg) => arg.trim())
        .filter(Boolean)
      if (args.length) config.args = args
      else delete config.args
    }
    if (isOpenCodeServer(form.kind)) {
      if (form.agent.trim()) config.agent = form.agent.trim()
    }
    delete config.workdir
    if (isLocalHarness(form.kind)) {
      config.promptMode = form.promptMode
      if (form.modelFlag.trim()) config.modelFlag = form.modelFlag.trim()
      else delete config.modelFlag
    }
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      kind: form.kind,
      baseUrl: form.baseUrl.trim(),
      apiVersion: form.apiVersion.trim(),
      defaultModel: form.defaultModel.trim(),
      models: form.modelsText
        .split(/[\n,]/)
        .map((model) => model.trim())
        .filter(Boolean),
      config,
    }
    if (form.apiKey) payload.apiKey = form.apiKey
    if (form.clearKey) payload.apiKey = ''
    if (savedProvider) payload.providerId = savedProvider.id
    return payload
  }

  const applyModels = (models: string[], count: number) => {
    setForm((current) => ({
      ...current,
      modelsText: models.join('\n'),
    }))
    toast('success', `Found ${count} model${count === 1 ? '' : 's'}.`)
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast('error', 'Give the harness a name.')
      return
    }
    const payload = buildPayload()
    if (!payload) return

    setSaving(true)
    try {
      const saved = savedProvider
        ? await api.updateProvider(savedProvider.id, payload as Partial<Provider>)
        : await api.createProvider(payload as Partial<Provider>)
      setSavedProvider(saved)
      toast('success', savedProvider ? 'Harness updated.' : 'Harness added.')
      await refresh()
      if (savedProvider) onDone()
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    const payload = buildPayload()
    if (!payload) return
    setTesting(true)
    try {
      const result = await api.probeProvider(payload)
      toast('success', result.message)
      if (isLocalHarness(form.kind)) return
      // Continue the connect flow: discover models immediately after a
      // successful test, without requiring the harness to be saved first.
      setFetching(true)
      try {
        const found = await api.discoverProviderModels(payload)
        applyModels(found.models, found.count)
      } catch (err) {
        toast('error', `Connected, but models could not be listed: ${errorText(err)}`)
      } finally {
        setFetching(false)
      }
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setTesting(false)
    }
  }

  const fetchModels = async () => {
    const payload = buildPayload()
    if (!payload) return
    setFetching(true)
    try {
      const result = await api.discoverProviderModels(payload)
      applyModels(result.models, result.count)
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setFetching(false)
    }
  }

  const remove = async () => {
    if (!savedProvider) return
    setDeleting(true)
    try {
      await api.deleteProvider(savedProvider.id)
      toast('success', 'Harness removed.')
      await refresh()
      setDeleteOpen(false)
      onDone()
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onCancel}
        className="text-[11.5px] font-medium text-muted hover:text-ink"
      >
        ← Back to harnesses
      </button>

      {!savedProvider ? (
        <div>
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-faint">
            Start from a template
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((template) => (
              <button
                key={template.label}
                type="button"
                onClick={() => applyTemplate(template)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10.5px] transition-colors',
                  form.kind === template.kind && form.name === template.label
                    ? 'border-accent/40 bg-accent-soft text-accent'
                    : 'border-line bg-panel text-muted hover:border-line-strong hover:text-ink',
                )}
              >
                {kindIcon(template.kind)}
                {template.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder="My harness"
          />
        </Field>
        <Field label="Type">
          <Select
            value={form.kind}
            onChange={(event) => changeKind(event.target.value as ProviderKind)}
          >
            {(
              [
                'opencode-server',
                'opencode',
              ] as ProviderKind[]
            ).map((kind) => (
              <option key={kind} value={kind}>
                {providerKindLabel(kind)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {isOpenCodeServer(form.kind) ? (
        <>
          <OpenCodeServerHelp />

          <Field
            label="Base URL"
            hint="Complete link printed by `opencode serve`, including scheme, host and port."
          >
            <Input
              value={form.baseUrl}
              onChange={(event) => update('baseUrl', event.target.value)}
              placeholder="http://192.168.1.20:4096"
              className="font-mono text-[12px]"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Server password"
              hint={
                savedProvider?.hasKey
                  ? 'A password is saved. Leave blank to keep it.'
                  : 'Paste the generated `server password` from the OpenCode CLI.'
              }
            >
              <Input
                type="password"
                value={form.apiKey}
                onChange={(event) => update('apiKey', event.target.value)}
                placeholder={savedProvider?.hasKey ? '••••••••••••' : 'generated password'}
                autoComplete="off"
              />
            </Field>
            <Field
              label="Default model"
              hint="Format: providerID/modelID. Leave blank to use the harness default."
            >
              <Input
                value={form.defaultModel}
                onChange={(event) => update('defaultModel', event.target.value)}
                placeholder="opencode-go/deepseek-v4.1-flash"
                className="font-mono text-[12px]"
              />
            </Field>
          </div>

          <Field label="OpenCode agent" hint="build, plan, general, or a custom agent id.">
            <Input
              value={form.agent}
              onChange={(event) => update('agent', event.target.value)}
              placeholder="build"
              className="font-mono text-[12px]"
            />
          </Field>

          {savedProvider?.hasKey ? (
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={form.clearKey}
                onChange={(event) => update('clearKey', event.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              Remove the saved password
            </label>
          ) : null}
        </>
      ) : (
        <>
          <Field label="Command" hint="Executable on the server host.">
            <Input
              value={form.command}
              onChange={(event) => update('command', event.target.value)}
              placeholder="opencode"
              className="font-mono text-[12px]"
            />
          </Field>

          <Field
            label="Arguments"
            hint="One argument per line. Placed before the prompt."
          >
            <Textarea
              value={form.argsText}
              onChange={(event) => update('argsText', event.target.value)}
              rows={3}
              placeholder={'-p\n--mode\ntext'}
              className="font-mono text-[11.5px]"
            />
          </Field>

          <Field label="Default model" hint="Optional. Empty uses the harness default.">
            <Input
              value={form.defaultModel}
              onChange={(event) => update('defaultModel', event.target.value)}
              placeholder="provider/model"
              className="font-mono text-[12px]"
            />
          </Field>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel2/40 px-3 py-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void test()}
          disabled={fetching}
          loading={testing}
        >
          <Zap className="h-3.5 w-3.5" />
          Test connection
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void fetchModels()}
          disabled={testing}
          loading={fetching}
        >
          <Download className="h-3.5 w-3.5" />
          Fetch models
        </Button>
        <span className="text-[10.5px] text-faint">
          Uses the values above — save after a successful test.
        </span>
      </div>

      <Field
        label="Models"
        hint="One per line. Fetch from OpenCode or enter model ids manually."
      >
        <Textarea
          value={form.modelsText}
          onChange={(event) => update('modelsText', event.target.value)}
          rows={4}
          placeholder="provider/model"
          className="font-mono text-[11.5px]"
        />
      </Field>

      <div className="rounded-lg border border-line bg-panel2/40">
        <button
          type="button"
          onClick={() => setAdvanced((value) => !value)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium text-muted hover:text-ink"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Advanced configuration
          <span className="flex-1" />
          <span className="text-[10px] text-faint">{advanced ? 'hide' : 'JSON'}</span>
        </button>
        {advanced ? (
          <div className="border-t border-line p-3">
            <Field
              label="Extra config"
              hint='Examples: {"maxTokens": 8192}, {"headers": {"x-api-key": "…"}}, {"chatPath": "/chat/completions"}'
            >
              <Textarea
                value={form.configText}
                onChange={(event) => update('configText', event.target.value)}
                rows={6}
                className="font-mono text-[11px]"
                spellCheck={false}
              />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-line pt-3">
        {savedProvider ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            className="mr-auto"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        ) : (
          <span className="mr-auto" />
        )}
        <Button variant="ghost" size="md" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="md" onClick={() => void save()} loading={saving}>
          {savedProvider ? 'Save changes' : 'Connect harness'}
        </Button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete harness?"
        message={`${savedProvider?.name || 'This harness'} will be removed. Agents that reference it fall back to the workspace default.`}
        loading={deleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void remove()}
      />
    </div>
  )
}

function ProviderList({ onAdd, onEdit }: { onAdd: () => void; onEdit: (provider: Provider) => void }) {
  const allProviders = useAppStore((state) => state.providers)
  const providers = allProviders.filter((provider) => isHarnessKind(provider.kind))
  const refresh = useAppStore((state) => state.refresh)
  const toast = useAppStore((state) => state.toast)
  const [busy, setBusy] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null)
  const [deleting, setDeleting] = useState(false)

  const remove = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteProvider(deleteTarget.id)
      toast('success', 'Harness disconnected.')
      setDeleteTarget(null)
      await refresh()
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setDeleting(false)
    }
  }

  const run = async (provider: Provider, action: 'test' | 'models') => {
    setBusy((current) => ({ ...current, [provider.id]: action }))
    try {
      if (action === 'test') {
        const result = await api.testProvider(provider.id)
        toast('success', `${provider.name}: ${result.message}`)
      } else {
        const result = await api.fetchModels(provider.id)
        toast('success', `${provider.name}: found ${result.count} model${result.count === 1 ? '' : 's'}.`)
        await refresh()
      }
    } catch (err) {
      toast('error', `${provider.name}: ${errorText(err)}`)
    } finally {
      setBusy((current) => {
        const next = { ...current }
        delete next[provider.id]
        return next
      })
    }
  }

  if (providers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-6 py-9 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-panel2 text-muted">
          <Terminal className="h-4 w-4" />
        </div>
        <div className="mt-3 text-[13px] font-medium text-ink">Connect OpenCode</div>
        <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-relaxed text-muted">
          Connect an OpenCode server or the local OpenCode CLI. Connections are saved in the
          SQLite database and persist across restarts.
        </p>
        <Button variant="primary" size="md" className="mt-4" onClick={onAdd}>
          <Plus className="h-4 w-4" /> Connect harness
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11.5px] leading-relaxed text-muted">
          Harness connections are stored in this server's SQLite database and survive restarts.
        </p>
        <Button variant="secondary" size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Add harness
        </Button>
      </div>
      {providers.map((provider) => {
        const working = busy[provider.id]
        return (
          <div
            key={provider.id}
            className="rounded-xl border border-line bg-panel px-3 py-2.5 transition-colors hover:border-line-strong"
          >
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-panel2 text-muted">
                {kindIcon(provider.kind)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12.5px] font-semibold text-ink">{provider.name}</span>
                  <Badge>{providerKindLabel(provider.kind)}</Badge>
                  {provider.hasKey ? (
                    <span className="inline-flex items-center gap-1 text-[9.5px] text-success">
                      <KeyRound className="h-2.5 w-2.5" /> password set
                    </span>
                  ) : isOpenCodeServer(provider.kind) ? (
                    <span className="text-[9.5px] text-warn">no password</span>
                  ) : isCommandHarness(provider.kind) ? (
                    <span className="inline-flex items-center gap-1 text-[9.5px] text-accent">
                      <Terminal className="h-2.5 w-2.5" /> local
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-faint">
                  {provider.baseUrl
                    ? provider.baseUrl
                    : [provider.config.command, ...(Array.isArray(provider.config.args) ? provider.config.args : [])]
                        .filter(Boolean)
                        .join(' ') || 'local CLI'}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9.5px] text-faint">
                  <span>{provider.models.length} models</span>
                  {provider.defaultModel ? <span>default: {provider.defaultModel}</span> : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => void run(provider, 'test')}
                  disabled={Boolean(working)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-panel2 hover:text-ink disabled:opacity-40"
                  title="Test connection"
                >
                  {working === 'test' ? <Spinner className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
                </button>
                {!isLocalHarness(provider.kind) ? (
                  <button
                    type="button"
                    onClick={() => void run(provider, 'models')}
                    disabled={Boolean(working)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-panel2 hover:text-ink disabled:opacity-40"
                    title="Fetch models"
                  >
                    {working === 'models' ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onEdit(provider)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-panel2 hover:text-ink"
                  title="Edit harness"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(provider)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-danger/10 hover:text-danger"
                  title="Disconnect harness"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )
      })}
      <p className="pt-1 text-[10px] leading-relaxed text-faint">
        OpenCode server and OpenCode CLI are supported. OpenCode delegates through Shelclaw's prompt
        protocol, so recursive orchestration works without any cloud LLM connection.
      </p>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Disconnect harness?"
        message={`${deleteTarget?.name || 'This harness'} will be removed. Existing chats keep their history; agents that reference it fall back to the workspace default.`}
        confirmLabel="Disconnect"
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
      />
    </div>
  )
}

function WorkspaceSettings() {
  const settings = useAppStore((state) => state.settings)
  const providers = useAppStore((state) => state.providers).filter((provider) =>
    isHarnessKind(provider.kind),
  )
  const refresh = useAppStore((state) => state.refresh)
  const toast = useAppStore((state) => state.toast)
  const [form, setForm] = useState({
    workspaceName: settings.workspaceName,
    defaultProviderId: settings.defaultProviderId,
    defaultModel: settings.defaultModel,
    maxDepth: settings.maxDepth,
    maxParallel: settings.maxParallel,
    maxAgents: settings.maxAgents,
    maxSteps: settings.maxSteps,
    autoTitle: settings.autoTitle,
  })
  const [saving, setSaving] = useState(false)

  const provider = providers.find((entry) => entry.id === form.defaultProviderId)
  const modelOptions = useMemo(
    () => [...new Set([provider?.defaultModel, ...(provider?.models || [])].filter(Boolean))] as string[],
    [provider],
  )

  const save = async () => {
    setSaving(true)
    try {
      await api.updateSettings(form)
      await refresh()
      toast('success', 'Workspace settings saved.')
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <Field label="Workspace name">
        <Input
          value={form.workspaceName}
          onChange={(event) => setForm((current) => ({ ...current, workspaceName: event.target.value }))}
          placeholder="Shelclaw"
        />
      </Field>

      <div className="rounded-xl border border-line bg-panel2/40 p-3">
        <div className="text-[11.5px] font-semibold text-ink">Default model</div>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
          Used when a chat or agent does not specify a harness and model. Leave blank to use the
          harness default.
        </p>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          <Select
            value={form.defaultProviderId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                defaultProviderId: event.target.value,
                defaultModel: '',
              }))
            }
          >
            <option value="">Auto-select a harness</option>
            {providers.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </Select>
          <Input
            list="workspace-model-options"
            value={form.defaultModel}
            onChange={(event) => setForm((current) => ({ ...current, defaultModel: event.target.value }))}
            placeholder={provider?.defaultModel || 'model id'}
            className="font-mono text-[12px]"
          />
          <datalist id="workspace-model-options">
            {modelOptions.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-panel2/40 p-3">
        <div className="text-[11.5px] font-semibold text-ink">Orchestration limits</div>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
          Global guardrails for recursive delegation. Individual agents can set tighter limits.
        </p>
        <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
          <Field label="Max depth" hint="0 disables delegation.">
            <Input
              type="number"
              min={0}
              max={6}
              value={form.maxDepth}
              onChange={(event) =>
                setForm((current) => ({ ...current, maxDepth: Number(event.target.value) }))
              }
            />
          </Field>
          <Field label="Parallel agents" hint="Agents running at once per delegation round.">
            <Input
              type="number"
              min={1}
              max={8}
              value={form.maxParallel}
              onChange={(event) =>
                setForm((current) => ({ ...current, maxParallel: Number(event.target.value) }))
              }
            />
          </Field>
          <Field label="Max agents per run" hint="Hard cap across the whole agent tree.">
            <Input
              type="number"
              min={1}
              max={64}
              value={form.maxAgents}
              onChange={(event) =>
                setForm((current) => ({ ...current, maxAgents: Number(event.target.value) }))
              }
            />
          </Field>
          <Field label="Max steps" hint="LLM/tool rounds per agent.">
            <Input
              type="number"
              min={1}
              max={30}
              value={form.maxSteps}
              onChange={(event) =>
                setForm((current) => ({ ...current, maxSteps: Number(event.target.value) }))
              }
            />
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-line bg-panel2/40 px-3 py-2.5">
        <div>
          <div className="text-[11.5px] font-medium text-ink">Auto-title chats</div>
          <div className="mt-0.5 text-[10.5px] text-muted">
            Name a chat from its first message instead of “New chat”.
          </div>
        </div>
        <Toggle
          checked={form.autoTitle}
          onChange={(value) => setForm((current) => ({ ...current, autoTitle: value }))}
          label="Auto-title chats"
        />
      </div>

      <div className="flex justify-end border-t border-line pt-3">
        <Button variant="primary" size="md" onClick={() => void save()} loading={saving}>
          Save settings
        </Button>
      </div>
    </div>
  )
}

interface McpFormState {
  id: string
  name: string
  description: string
  transport: 'stdio' | 'http'
  command: string
  argsText: string
  url: string
  enabled: boolean
  envText: string
  headersText: string
  toolInstructions: Record<string, string>
  clearCredentials: boolean
}

const emptyMcpForm = (): McpFormState => ({
  id: '',
  name: '',
  description: '',
  transport: 'stdio',
  command: '',
  argsText: '',
  url: '',
  enabled: true,
  envText: '',
  headersText: '',
  toolInstructions: {},
  clearCredentials: false,
})

function formFromMcp(server: McpServer): McpFormState {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    transport: server.transport,
    command: server.command,
    argsText: server.args.join('\n'),
    url: server.url,
    enabled: server.enabled,
    envText: '',
    headersText: '',
    toolInstructions: { ...server.toolInstructions },
    clearCredentials: false,
  }
}

function parseCredentialLines(text: string): Record<string, string> | null {
  const result: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const equal = line.indexOf('=')
    const colon = line.indexOf(':')
    let index = -1
    if (equal >= 0 && (colon < 0 || equal < colon)) index = equal
    else if (colon >= 0) index = colon
    if (index <= 0) return null
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    if (!key) return null
    result[key] = value
  }
  return result
}

function McpSettings() {
  const toast = useAppStore((state) => state.toast)
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<McpServer | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState<McpFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingTool, setSavingTool] = useState(false)
  const [selectedTool, setSelectedTool] = useState('')
  const [toolsByServer, setToolsByServer] = useState<Record<string, string[]>>({})
  const editingServer = editing?.id ? servers.find((server) => server.id === editing.id) : undefined
  const editingTools = editingServer?.tools || []
  const selectedToolInfo = editingTools.find((tool) => tool.name === selectedTool)

  useEffect(() => {
    setSelectedTool('')
  }, [editing?.id])

  const load = async () => {
    setLoading(true)
    try {
      const result = await api.mcpServers()
      setServers(result.servers)
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async () => {
    if (!editing) return
    const env = parseCredentialLines(editing.envText)
    const headers = parseCredentialLines(editing.headersText)
    if (!env || !headers) {
      toast('error', 'Credentials must use one KEY=value pair per line.')
      return
    }
    const args = editing.argsText
      .split('\n')
      .map((arg) => arg.trim())
      .filter(Boolean)
    setSaving(true)
    try {
      if (editing.id) {
        await api.updateMcpServer(editing.id, {
          name: editing.name,
          description: editing.description,
          transport: editing.transport,
          command: editing.command,
          args,
          url: editing.url,
          enabled: editing.enabled,
          toolInstructions: editing.toolInstructions,
          ...(editing.envText.trim() ? { env } : {}),
          ...(editing.headersText.trim() ? { headers } : {}),
          clearCredentials: editing.clearCredentials,
        })
        toast('success', 'MCP server updated.')
      } else {
        await api.createMcpServer({
          name: editing.name,
          description: editing.description,
          transport: editing.transport,
          command: editing.command,
          args,
          url: editing.url,
          enabled: editing.enabled,
          toolInstructions: editing.toolInstructions,
          env,
          headers,
        })
        toast('success', 'MCP server connected.')
      }
      setEditing(null)
      await load()
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const runTest = async (server: McpServer) => {
    setTesting(server.id)
    try {
      const result = await api.testMcpServer(server.id)
      const names = result.tools.map((tool) => tool.name)
      setToolsByServer((current) => ({ ...current, [server.id]: names }))
      await load()
      toast(
        'success',
        `${server.name}: connected · ${names.length} tool${names.length === 1 ? '' : 's'}${
          names.length ? ` (${names.slice(0, 5).join(', ')})` : ''
        }`,
      )
    } catch (err) {
      toast('error', `${server.name}: ${errorText(err)}`)
    } finally {
      setTesting('')
    }
  }

  const discoverEditingTools = async () => {
    const server = editingServer
    if (!server) return
    await runTest(server)
  }

  const saveToolInstruction = async () => {
    if (!editing?.id || !selectedTool) return
    setSavingTool(true)
    try {
      const next = {
        ...(editingServer?.toolInstructions || {}),
        [selectedTool]: editing.toolInstructions[selectedTool] || '',
      }
      await api.updateMcpServer(editing.id, { toolInstructions: next })
      setEditing((current) =>
        current ? { ...current, toolInstructions: next } : current,
      )
      await load()
      toast('success', `Instruction saved for ${selectedTool}.`)
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setSavingTool(false)
    }
  }

  const remove = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteMcpServer(deleteTarget.id)
      setDeleteTarget(null)
      await load()
      toast('success', 'MCP server removed.')
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-line bg-panel2/40 px-3 py-2.5 text-[10.5px] leading-relaxed text-muted">
        <div className="flex items-center gap-1.5 font-medium text-ink">
          <KeyRound className="h-3.5 w-3.5" /> Credentials stay on this server
        </div>
        MCP credentials are encrypted at rest with AES-256-GCM using a local key. They are decrypted
        only when Shelclaw connects to the MCP server, are never returned by the API, and are never
        included in any model prompt.
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11.5px] text-muted">
          Connect stdio or HTTP MCP servers. Disabled servers are not used by agents.
        </p>
        <Button variant="secondary" size="sm" onClick={() => setEditing(emptyMcpForm())}>
          <Plus className="h-3.5 w-3.5" /> Add MCP server
        </Button>
      </div>

      {loading && !servers.length ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-4 w-4 text-ink" />
        </div>
      ) : servers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center">
          <Plug className="mx-auto h-5 w-5 text-faint" />
          <div className="mt-2 text-[12.5px] font-medium text-ink">No MCP servers connected</div>
          <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-muted">
            Add a stdio command or an HTTP endpoint. Credentials are stored encrypted and used only
            server-side.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map((server) => (
            <div
              key={server.id}
              className="rounded-xl border border-line bg-panel px-3 py-2.5 transition-colors hover:border-line-strong"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-panel2 text-muted">
                  <Plug className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12.5px] font-semibold text-ink">{server.name}</span>
                    <Badge>{server.transport === 'stdio' ? 'stdio' : 'HTTP'}</Badge>
                    <span className={server.enabled ? 'text-[9.5px] text-ink' : 'text-[9.5px] text-faint'}>
                      {server.enabled ? 'enabled' : 'disabled'}
                    </span>
                    {server.hasEnv || server.hasHeaders ? (
                      <span className="inline-flex items-center gap-1 text-[9.5px] text-ink">
                        <KeyRound className="h-2.5 w-2.5" /> encrypted credentials
                      </span>
                    ) : (
                      <span className="text-[9.5px] text-faint">no credentials</span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-faint">
                    {server.transport === 'stdio'
                      ? [server.command, ...server.args].filter(Boolean).join(' ')
                      : server.url}
                  </div>
                  {server.description ? (
                    <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted">
                      {server.description}
                    </div>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-x-2 text-[9.5px] text-faint">
                    <span>{server.tools.length} tools discovered</span>
                    <span>
                      {Object.values(server.toolInstructions).filter((value) => value.trim()).length}{' '}
                      tool instructions
                    </span>
                  </div>
                  {server.envKeys.length || server.headerKeys.length ? (
                    <div className="mt-1 truncate text-[9.5px] text-faint">
                      Keys: {[...server.envKeys, ...server.headerKeys].join(', ')}
                    </div>
                  ) : null}
                  {toolsByServer[server.id]?.length ? (
                    <div className="mt-1 text-[9.5px] text-muted">
                      Tools: {toolsByServer[server.id].join(', ')}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Toggle
                    checked={server.enabled}
                    onChange={(value) =>
                      void api
                        .updateMcpServer(server.id, { enabled: value })
                        .then(() => load())
                        .catch((err) => toast('error', errorText(err)))
                    }
                    label={`${server.enabled ? 'Disable' : 'Enable'} ${server.name}`}
                  />
                  <button
                    type="button"
                    onClick={() => void runTest(server)}
                    disabled={testing === server.id}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-panel2 hover:text-ink disabled:opacity-40"
                    title="Test connection and list tools"
                  >
                    {testing === server.id ? (
                      <Spinner className="h-3.5 w-3.5" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(formFromMcp(server))}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-panel2 hover:text-ink"
                    title="Edit MCP server"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(server)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-panel2 hover:text-danger"
                    title="Remove MCP server"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? 'Edit MCP server' : 'Connect MCP server'}
          subtitle="Credentials are encrypted at rest and never sent to a model."
          size="md"
          footer={
            <>
              <Button variant="ghost" size="md" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={saving}
                disabled={!editing.name.trim()}
                onClick={() => void save()}
              >
                {editing.id ? 'Save changes' : 'Connect server'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input
                  value={editing.name}
                  onChange={(event) =>
                    setEditing((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  placeholder="e.g. GitHub MCP"
                />
              </Field>
              <Field label="Transport">
                <Select
                  value={editing.transport}
                  onChange={(event) =>
                    setEditing((current) =>
                      current
                        ? { ...current, transport: event.target.value as 'stdio' | 'http' }
                        : current,
                    )
                  }
                >
                  <option value="stdio">stdio (local command)</option>
                  <option value="http">HTTP / SSE endpoint</option>
                </Select>
              </Field>
            </div>

            <Field
              label="Instructions for agents"
              hint="Injected into the Orchestrator and every agent so they know when and how to use this server. Do not put credentials here."
            >
              <Textarea
                value={editing.description}
                onChange={(event) =>
                  setEditing((current) =>
                    current ? { ...current, description: event.target.value } : current,
                  )
                }
                rows={3}
                placeholder="Use this server to send transactional emails, list drafts, and check delivery status. Prefer these tools over terminal workarounds."
                className="text-[12px]"
              />
            </Field>

            {editing.transport === 'stdio' ? (
              <>
                <Field label="Command" hint="Executable on the server host.">
                  <Input
                    value={editing.command}
                    onChange={(event) =>
                      setEditing((current) =>
                        current ? { ...current, command: event.target.value } : current,
                      )
                    }
                    placeholder="npx"
                    className="font-mono text-[12px]"
                  />
                </Field>
                <Field label="Arguments" hint="One argument per line.">
                  <Textarea
                    value={editing.argsText}
                    onChange={(event) =>
                      setEditing((current) =>
                        current ? { ...current, argsText: event.target.value } : current,
                      )
                    }
                    rows={3}
                    placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/path'}
                    className="font-mono text-[11.5px]"
                  />
                </Field>
              </>
            ) : (
              <Field label="URL" hint="HTTP endpoint exposed by the MCP server.">
                <Input
                  value={editing.url}
                  onChange={(event) =>
                    setEditing((current) =>
                      current ? { ...current, url: event.target.value } : current,
                    )
                  }
                  placeholder="https://mcp.example.com/mcp"
                  className="font-mono text-[12px]"
                />
              </Field>
            )}

            {editing.transport === 'stdio' ? (
              <Field
                label="Environment variables"
                hint={
                  editing.id
                    ? 'Leave blank to keep the stored values. One KEY=value per line. Stored encrypted.'
                    : 'One KEY=value per line. Stored encrypted.'
                }
              >
                <Textarea
                  value={editing.envText}
                  onChange={(event) =>
                    setEditing((current) =>
                      current ? { ...current, envText: event.target.value } : current,
                    )
                  }
                  rows={3}
                  placeholder="API_KEY=your-key"
                  className="font-mono text-[11.5px]"
                />
              </Field>
            ) : (
              <Field
                label="HTTP headers"
                hint={
                  editing.id
                    ? 'Leave blank to keep the stored values. One Header: value per line. Stored encrypted.'
                    : 'One Header: value per line. Stored encrypted. Use this for API keys and auth tokens.'
                }
              >
                <Textarea
                  value={editing.headersText}
                  onChange={(event) =>
                    setEditing((current) =>
                      current ? { ...current, headersText: event.target.value } : current,
                    )
                  }
                  rows={3}
                  placeholder="x-api-key: your-key"
                  className="font-mono text-[11.5px]"
                />
              </Field>
            )}

            {editing.id ? (
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted">
                <input
                  type="checkbox"
                  checked={editing.clearCredentials}
                  onChange={(event) =>
                    setEditing((current) =>
                      current ? { ...current, clearCredentials: event.target.checked } : current,
                    )
                  }
                  className="h-3.5 w-3.5 accent-[var(--ink)]"
                />
                Remove all stored credentials for this server
              </label>
            ) : null}

            <div className="rounded-lg border border-line bg-panel2/30 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11.5px] font-medium text-ink">Tool instructions</div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-faint">
                    Discover the tools first, then tell the Orchestrator and agents what each tool
                    should be used for.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => void discoverEditingTools()}
                  disabled={!editing.id || Boolean(testing)}
                  loading={Boolean(testing) && testing === editing.id}
                  title="Discover tools"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', testing === editing.id && 'hidden')} />
                </Button>
              </div>

              {editingTools.length ? (
                <div className="mt-2.5 space-y-2">
                  <Select
                    value={selectedTool}
                    onChange={(event) => setSelectedTool(event.target.value)}
                  >
                    <option value="">Select Tool</option>
                    {editingTools.map((tool) => (
                      <option key={tool.name} value={tool.name}>
                        {tool.name}
                      </option>
                    ))}
                  </Select>
                  {selectedToolInfo?.description ? (
                    <div className="text-[10px] leading-relaxed text-faint">
                      {selectedToolInfo.description}
                    </div>
                  ) : null}
                  <div className="flex items-start gap-2">
                    <Textarea
                      value={selectedTool ? editing.toolInstructions[selectedTool] || '' : ''}
                      onChange={(event) => {
                        if (!selectedTool) return
                        const value = event.target.value
                        setEditing((current) =>
                          current
                            ? {
                                ...current,
                                toolInstructions: {
                                  ...current.toolInstructions,
                                  [selectedTool]: value,
                                },
                              }
                            : current,
                        )
                      }}
                      disabled={!selectedTool}
                      rows={3}
                      placeholder={
                        selectedTool
                          ? `Use ${selectedTool} when…`
                          : 'Select a tool first, then write its instruction.'
                      }
                      className="text-[11.5px]"
                    />
                    <button
                      type="button"
                      onClick={() => void saveToolInstruction()}
                      disabled={!editing.id || !selectedTool || savingTool}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-panel2 text-ink transition-colors hover:border-line-strong disabled:opacity-40"
                      title={
                        selectedTool
                          ? `Save instruction for ${selectedTool}`
                          : 'Select a tool first'
                      }
                      aria-label={
                        selectedTool
                          ? `Save instruction for ${selectedTool}`
                          : 'Save tool instruction'
                      }
                    >
                      {savingTool ? (
                        <Spinner className="h-3.5 w-3.5" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <Select disabled>
                    <option>No Tools Found</option>
                  </Select>
                  <div className="rounded-md border border-dashed border-line px-3 py-3 text-[10.5px] text-faint">
                    {editing.id
                      ? 'No tools discovered yet. Click Discover tools.'
                      : 'Save this server first, then reopen it to discover tools.'}
                  </div>
                </div>
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(event) =>
                  setEditing((current) =>
                    current ? { ...current, enabled: event.target.checked } : current,
                  )
                }
                className="h-3.5 w-3.5 accent-[var(--ink)]"
              />
              Enable this server for agent tools
            </label>
          </div>
        </Modal>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove MCP server?"
        message={`${deleteTarget?.name || 'This MCP server'} and its encrypted credentials will be removed.`}
        confirmLabel="Remove"
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
      />
    </div>
  )
}

function ActivepiecesSettings({ onOpenMcp }: { onOpenMcp: () => void }) {
  const toast = useAppStore((state) => state.toast)
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [baseUrl, setBaseUrl] = useState('http://localhost:8080')
  const [mcpUrl, setMcpUrl] = useState('http://localhost:8080/mcp')
  const [headersText, setHeadersText] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [tools, setTools] = useState<string[]>([])
  const [helpOpen, setHelpOpen] = useState(false)

  const existing = servers.find((server) => server.name.toLowerCase() === 'activepieces')

  const load = async () => {
    setLoading(true)
    try {
      const result = await api.mcpServers()
      setServers(result.servers)
      const active = result.servers.find(
        (server) => server.name.toLowerCase() === 'activepieces',
      )
      if (active) {
        setMcpUrl(active.url)
        setBaseUrl(active.url.replace(/\/mcp\/?$/i, '') || 'http://localhost:8080')
        setEnabled(active.enabled)
        setTools(active.tools.map((tool) => tool.name))
      }
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async () => {
    const headers = parseCredentialLines(headersText)
    if (!headers) {
      toast('error', 'Headers must use one Header: value pair per line.')
      return
    }
    if (!/^https?:\/\//i.test(mcpUrl.trim())) {
      toast('error', 'Enter a valid http:// or https:// MCP URL.')
      return
    }
    setSaving(true)
    try {
      let server: McpServer
      if (existing) {
        server = await api.updateMcpServer(existing.id, {
          url: mcpUrl.trim(),
          enabled,
          ...(headersText.trim() ? { headers } : {}),
        })
        toast('success', 'Activepieces connection updated.')
      } else {
        server = await api.createMcpServer({
          name: 'Activepieces',
          description:
            'Self-hosted Activepieces engine. Use its MCP tools to run external app actions and workflows. Build flows and connect apps in the Activepieces UI.',
          transport: 'http',
          url: mcpUrl.trim(),
          enabled,
          headers,
        })
        toast('success', 'Activepieces connected through MCP.')
      }
      setServers((current) => {
        const next = current.filter((entry) => entry.id !== server.id)
        return [...next, server]
      })
      setHeadersText('')
      await load()
      await test(server.id)
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const test = async (serverId?: string) => {
    const id = serverId || existing?.id
    if (!id) return
    setTesting(true)
    try {
      const result = await api.testMcpServer(id)
      setTools(result.tools.map((tool) => tool.name))
      toast(
        'success',
        `Activepieces connected · ${result.tools.length} tool${
          result.tools.length === 1 ? '' : 's'
        }`,
      )
      await load()
    } catch (err) {
      toast('error', `Activepieces: ${errorText(err)}`)
    } finally {
      setTesting(false)
    }
  }

  const disconnect = async () => {
    if (!existing) return
    setSaving(true)
    try {
      await api.deleteMcpServer(existing.id)
      toast('success', 'Activepieces disconnected.')
      await load()
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-line bg-panel2/40 px-3 py-2.5 text-[10.5px] leading-relaxed text-muted">
        <div className="flex items-center gap-1.5 font-medium text-ink">
          <Workflow className="h-3.5 w-3.5" /> Activepieces engine
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-panel hover:text-ink"
            title="How to connect Activepieces"
            aria-label="How to connect Activepieces"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </div>
        Shelclaw stays the orchestrator. Build flows and connect services in the self-hosted
        Activepieces UI, then connect its MCP endpoint here. Agents call Activepieces tools through
        the existing encrypted MCP path.
      </div>

      <Field label="Activepieces UI / base URL" hint="Used for the Open Activepieces link.">
        <Input
          value={baseUrl}
          onChange={(event) => {
            const value = event.target.value
            setBaseUrl(value)
            setMcpUrl(`${value.replace(/\/$/, '')}/mcp`)
          }}
          placeholder="http://localhost:8080"
          className="font-mono text-[12px]"
        />
      </Field>

      <Field
        label="MCP endpoint URL"
        hint="Must be reachable from the Shelclaw server. In Docker this is usually http://activepieces-app:80/mcp."
      >
        <Input
          value={mcpUrl}
          onChange={(event) => setMcpUrl(event.target.value)}
          placeholder="http://localhost:8080/mcp"
          className="font-mono text-[12px]"
        />
      </Field>

      <Field
        label="Headers / token"
        hint="Optional. Leave blank to keep an existing token. Stored encrypted and never sent to a model."
      >
        <Textarea
          value={headersText}
          onChange={(event) => setHeadersText(event.target.value)}
          rows={3}
          placeholder="Authorization: Bearer your-token"
          className="font-mono text-[11.5px]"
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--ink)]"
        />
        Enable Activepieces tools for agents
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => void save()} loading={saving}>
          {existing ? 'Save connection' : 'Connect Activepieces'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void test()}
          loading={testing}
          disabled={!existing}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Test & discover tools
        </Button>
        <a
          href={baseUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7.5 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] font-medium text-ink hover:border-line-strong"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open Activepieces
        </a>
        {existing ? (
          <Button variant="ghost" size="sm" onClick={() => void disconnect()} disabled={saving}>
            <Trash2 className="h-3.5 w-3.5" /> Disconnect
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner className="h-4 w-4 text-ink" />
        </div>
      ) : existing ? (
        <div className="rounded-lg border border-line bg-panel px-3 py-2.5">
          <div className="flex items-center gap-2 text-[11.5px] text-ink">
            <span className={`h-1.5 w-1.5 rounded-full ${existing.enabled ? 'bg-ink' : 'bg-faint'}`} />
            {existing.enabled ? 'Enabled' : 'Disabled'} · {existing.tools.length} tools discovered
          </div>
          {tools.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tools.slice(0, 24).map((tool) => (
                <span
                  key={tool}
                  className="rounded border border-line bg-panel2 px-1.5 py-0.5 font-mono text-[9.5px] text-muted"
                >
                  {tool}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-[10.5px] text-faint">
              Test the connection to discover tools, then add per-tool instructions in the MCP
              Servers tab.
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenMcp}
            >
              <Plug className="h-3.5 w-3.5" /> Manage tool instructions
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line px-5 py-7 text-center">
          <Workflow className="mx-auto h-5 w-5 text-faint" />
          <div className="mt-2 text-[12.5px] font-medium text-ink">Activepieces is not connected</div>
          <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-muted">
            Start the stack with <code className="font-mono">./selfhost.sh</code>, create the first
            admin account in Activepieces, connect your apps, then paste its MCP endpoint and token
            above.
          </p>
        </div>
      )}

      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Connect Activepieces"
        subtitle="Self-host the engine, create a local admin account, and expose its MCP tools to Shelclaw."
        size="md"
        footer={
          <Button variant="secondary" size="md" onClick={() => setHelpOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4 text-[11.5px] leading-relaxed text-muted">
          <div>
            <div className="font-semibold text-ink">1. Start the engine</div>
            <p className="mt-1">
              During development, run only Activepieces:
            </p>
            <pre className="mt-1.5 rounded-md border border-line bg-panel2 px-2.5 py-2 font-mono text-[10.5px] text-ink">
              {'./selfhost.sh activepieces'}
            </pre>
            <p className="mt-1.5">
              For the full app + Activepieces stack, run <code className="font-mono">./selfhost.sh</code>.
              The first run downloads images and can take a few minutes. Check progress with{' '}
              <code className="font-mono">./selfhost.sh logs</code>.
            </p>
          </div>

          <div>
            <div className="font-semibold text-ink">2. Create a local account</div>
            <p className="mt-1">
              Open <a href="http://localhost:8080" target="_blank" rel="noreferrer" className="text-ink underline">http://localhost:8080</a>.
              A self-hosted Activepieces does <strong className="text-ink">not</strong> require an
              Activepieces cloud account. The first account you create becomes the platform
              administrator. There is no default username or password.
            </p>
          </div>

          <div>
            <div className="font-semibold text-ink">3. Connect services and build flows</div>
            <p className="mt-1">
              In Activepieces, open <strong className="text-ink">Connections</strong> and connect the
              apps you want agents to use. Build and test flows in the Activepieces builder. Shelclaw
              does not embed the enterprise builder UI.
            </p>
          </div>

          <div>
            <div className="font-semibold text-ink">4. Enable the Activepieces MCP server</div>
            <p className="mt-1">
              In Activepieces, open <strong className="text-ink">Settings → MCP Server</strong>,
              enable it, and copy the server URL and any required token/headers. This is the endpoint
              Shelclaw will call.
            </p>
          </div>

          <div>
            <div className="font-semibold text-ink">5. Connect it in Shelclaw</div>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>Base URL: <code className="font-mono">http://localhost:8080</code></li>
              <li>
                MCP URL when Shelclaw runs on the host:{' '}
                <code className="font-mono">http://localhost:8080/mcp</code>
              </li>
              <li>
                MCP URL when Shelclaw runs in Docker:{' '}
                <code className="font-mono">http://activepieces-app:80/mcp</code>
              </li>
              <li>Paste any required token/header, then click <strong className="text-ink">Connect Activepieces</strong>.</li>
              <li>Click <strong className="text-ink">Test &amp; discover tools</strong>.</li>
              <li>Open <strong className="text-ink">MCP Servers → Activepieces</strong> to add per-tool instructions.</li>
            </ul>
          </div>

          <div>
            <div className="font-semibold text-ink">6. Use it from chat</div>
            <p className="mt-1">
              Ask the Orchestrator or an agent to perform an operation such as sending an email,
              creating an issue, or updating a spreadsheet. Matching Activepieces tools are available
              through <code className="font-mono">mcp_call</code>; credentials stay server-side.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-panel2/40 px-3 py-2 text-[10.5px]">
            <strong className="text-ink">Nothing on port 8080?</strong> Run{' '}
            <code className="font-mono">./selfhost.sh activepieces</code>, then check{' '}
            <code className="font-mono">./selfhost.sh status</code> and{' '}
            <code className="font-mono">./selfhost.sh logs</code>. If the port is busy, set{' '}
            <code className="font-mono">ACTIVEPIECES_PORT=8081</code> before starting.
          </div>
        </div>
      </Modal>
    </div>
  )
}

export function SettingsModal({ initialTab }: { initialTab: 'providers' | 'workspace' | 'mcp' | 'activepieces' }) {
  const closeModal = useAppStore((state) => state.closeModal)
  const [tab, setTab] = useState(initialTab)
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editing, setEditing] = useState<Provider | null>(null)

  const openForm = (provider: Provider | null) => {
    setEditing(provider)
    setView('form')
  }

  return (
    <Modal
      open
      onClose={closeModal}
      title="Settings"
      subtitle="Connect harnesses, choose models, and set orchestration guardrails."
      size="lg"
      bodyClassName="px-5 py-4"
    >
      <div className="mb-4 flex gap-1 rounded-lg border border-line bg-panel2 p-0.5">
        {(
          [
            { id: 'providers', label: 'Harness', icon: Cpu },
            { id: 'mcp', label: 'MCP Servers', icon: Plug },
            { id: 'activepieces', label: 'Activepieces', icon: Workflow },
            { id: 'workspace', label: 'Workspace', icon: Settings2 },
          ] as const
        ).map((entry) => {
          const Icon = entry.icon
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setTab(entry.id)
                setView('list')
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[11.5px] font-medium transition-colors',
                tab === entry.id ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {entry.label}
            </button>
          )
        })}
      </div>

      {tab === 'providers' ? (
        view === 'list' ? (
          <ProviderList onAdd={() => openForm(null)} onEdit={(provider) => openForm(provider)} />
        ) : (
          <ProviderFormView
            provider={editing}
            onDone={() => {
              setView('list')
              setEditing(null)
            }}
            onCancel={() => {
              setView('list')
              setEditing(null)
            }}
          />
        )
      ) : tab === 'mcp' ? (
        <McpSettings />
      ) : tab === 'activepieces' ? (
        <ActivepiecesSettings onOpenMcp={() => setTab('mcp')} />
      ) : (
        <WorkspaceSettings />
      )}
    </Modal>
  )
}
