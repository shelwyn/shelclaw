import {
  Check,
  Copy,
  Cpu,
  Download,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  Terminal,
  Trash2,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Provider, ProviderKind } from '../types'
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
        OpenCode server and OpenCode CLI are supported. OpenCode delegates through OpenCodex's prompt
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
          placeholder="OpenCodex"
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

export function SettingsModal({ initialTab }: { initialTab: 'providers' | 'workspace' }) {
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
            { id: 'providers', label: 'Connect Harness', icon: Cpu },
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
      ) : (
        <WorkspaceSettings />
      )}
    </Modal>
  )
}
