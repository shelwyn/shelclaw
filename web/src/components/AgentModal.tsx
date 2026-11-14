import { Bot, Info, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Agent } from '../types'
import { isHarnessKind } from '../lib/format'
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  Toggle,
} from './ui'

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function AgentModal({ agentId }: { agentId?: string }) {
  const agents = useAppStore((state) => state.agents)
  const projects = useAppStore((state) => state.projects)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const providers = useAppStore((state) => state.providers).filter((provider) =>
    isHarnessKind(provider.kind),
  )
  const settings = useAppStore((state) => state.settings)
  const closeModal = useAppStore((state) => state.closeModal)
  const refresh = useAppStore((state) => state.refresh)
  const toast = useAppStore((state) => state.toast)

  const existing = agentId ? agents.find((agent) => agent.id === agentId) : undefined
  const projectId = existing?.projectId || activeProjectId
  const project = projects.find((entry) => entry.id === projectId)
  const [form, setForm] = useState({
    name: existing?.name || '',
    description: existing?.description || '',
    systemPrompt: existing?.systemPrompt || '',
    color: existing?.color || '#111111',
    providerId: existing?.providerId || '',
    model: existing?.model || '',
    maxDepth: existing?.maxDepth ?? 2,
    maxSteps: existing?.maxSteps ?? 8,
    canSpawn: existing?.canSpawn ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const provider = providers.find((entry) => entry.id === form.providerId)
  const modelOptions = useMemo(
    () => [...new Set([provider?.defaultModel, ...(provider?.models || [])].filter(Boolean))] as string[],
    [provider],
  )

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const save = async () => {
    if (!projectId) {
      toast('error', 'Create or select a project first.')
      return
    }
    if (!form.name.trim()) {
      toast('error', 'Give the agent a name.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        projectId,
        name: form.name.trim(),
        description: form.description.trim(),
      }
      if (existing) await api.updateAgent(existing.id, payload)
      else await api.createAgent(payload)
      await refresh()
      toast('success', existing ? 'Agent updated.' : 'Agent created.')
      closeModal()
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!existing) return
    setDeleting(true)
    try {
      await api.deleteAgent(existing.id)
      await refresh()
      toast('success', 'Agent deleted.')
      setDeleteOpen(false)
      closeModal()
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal
      open
      onClose={closeModal}
      title={
        existing?.isOrchestrator
          ? 'Orchestrator settings'
          : existing
            ? 'Edit agent'
            : 'New agent'
      }
      subtitle={
        project
          ? `${project.name} · agents chat directly from the project sidebar.`
          : 'Create or select a project first.'
      }
      size="lg"
      footer={
        <>
          {existing ? (
            <Button
              variant="danger"
              size="md"
              className="mr-auto"
              onClick={() => setDeleteOpen(true)}
              disabled={existing.isOrchestrator}
              title={
                existing.isOrchestrator
                  ? 'The project orchestrator cannot be deleted'
                  : 'Delete agent'
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          ) : null}
          <Button variant="ghost" size="md" onClick={closeModal}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={() => void save()} loading={saving}>
            {existing ? 'Save changes' : 'Create agent'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-panel2/40 p-3">
          <Avatar name={form.name || 'Agent'} color={form.color} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-ink">
              {form.name || 'Unnamed agent'}
            </div>
            <div className="mt-0.5 truncate text-[10.5px] text-muted">
              {form.description || 'Describe what this specialist is responsible for.'}
            </div>
          </div>
          {existing?.isOrchestrator ? (
            <Badge tone="accent">orchestrator</Badge>
          ) : existing?.builtin ? (
            <Badge tone="accent">built-in</Badge>
          ) : null}
        </div>

        <Field label="Name">
          <Input
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder="e.g. Security Reviewer"
          />
        </Field>

        <Field label="Description" hint="Shown to the orchestrator when choosing an agent.">
          <Input
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
            placeholder="What this agent is good at"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Harness" hint="Leave as inherit to follow the workspace default.">
            <Select
              value={form.providerId}
              onChange={(event) => {
                update('providerId', event.target.value)
                update('model', '')
              }}
            >
              <option value="">Inherit workspace default</option>
              {providers.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Model" hint="Optional. Empty uses the harness default or inherits the parent.">
            <Input
              list="agent-model-options"
              value={form.model}
              onChange={(event) => update('model', event.target.value)}
              placeholder={provider?.defaultModel || 'model id'}
              className="font-mono text-[12px]"
            />
            <datalist id="agent-model-options">
              {modelOptions.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </Field>
        </div>

        <Field
          label="System prompt"
          hint="The agent's operating instructions. Be explicit about output format and standards."
        >
          <Textarea
            value={form.systemPrompt}
            onChange={(event) => update('systemPrompt', event.target.value)}
            rows={10}
            placeholder={`You are a … agent in Shelclaw.\n\nYour job is to …\n\nRules:\n- …`}
            className="min-h-[180px] font-mono text-[11.5px] leading-relaxed"
            spellCheck={false}
          />
        </Field>

        <div className="rounded-xl border border-line bg-panel2/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
                <Bot className="h-3.5 w-3.5 text-accent" />
                Delegation
              </div>
              <p className="mt-0.5 max-w-md text-[10.5px] leading-relaxed text-muted">
                When enabled, this agent can spawn sub-agents with its own model overrides and
                prompts. Depth is still capped by the workspace setting.
              </p>
            </div>
            <Toggle
              checked={form.canSpawn}
              onChange={(value) => update('canSpawn', value)}
              label="Allow delegation"
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Max depth from this agent" hint="0 disables spawning from this agent.">
              <Input
                type="number"
                min={0}
                max={5}
                value={form.maxDepth}
                onChange={(event) => update('maxDepth', Number(event.target.value))}
                disabled={!form.canSpawn}
              />
            </Field>
            <Field label="Max steps" hint="LLM/tool rounds before it must answer.">
              <Input
                type="number"
                min={1}
                max={30}
                value={form.maxSteps}
                onChange={(event) => update('maxSteps', Number(event.target.value))}
              />
            </Field>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-line bg-panel2/40 px-3 py-2 text-[10.5px] leading-relaxed text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
          <span>
            Workspace limit: depth {settings.maxDepth}, {settings.maxParallel} parallel agents,{' '}
            {settings.maxAgents} agents per run, {settings.maxSteps} steps. This agent&apos;s own
            limits are applied on top.
          </span>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete agent?"
        message={`${existing?.name || 'This agent'} will be removed from the roster. Existing chats keep their history.`}
        loading={deleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void remove()}
      />
    </Modal>
  )
}
