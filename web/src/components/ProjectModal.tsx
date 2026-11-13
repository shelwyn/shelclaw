import { FolderKanban, Info, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api'
import { useAppStore } from '../store'
import type { Project } from '../types'
import { AGENT_COLORS, pickColor } from '../lib/colors'
import {
  Avatar,
  Button,
  cn,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  Textarea,
} from './ui'

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function ProjectModal({ projectId }: { projectId?: string }) {
  const projects = useAppStore((state) => state.projects)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const closeModal = useAppStore((state) => state.closeModal)
  const refresh = useAppStore((state) => state.refresh)
  const setActiveProject = useAppStore((state) => state.setActiveProject)
  const goHome = useAppStore((state) => state.goHome)
  const toast = useAppStore((state) => state.toast)

  const existing = projectId ? projects.find((project) => project.id === projectId) : undefined
  const [form, setForm] = useState({
    name: existing?.name || '',
    description: existing?.description || '',
    color: existing?.color || pickColor(Date.now() + 3),
    systemPrompt: existing?.systemPrompt || '',
  })
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const save = async () => {
    if (!form.name.trim()) {
      toast('error', 'Give the project a name.')
      return
    }
    setSaving(true)
    try {
      const project = existing
        ? await api.updateProject(existing.id, form)
        : await api.createProject(form as Partial<Project>)
      await refresh()
      if (!existing) setActiveProject(project.id)
      toast('success', existing ? 'Project updated.' : 'Project created.')
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
      await api.deleteProject(existing.id)
      const remaining = projects.filter((project) => project.id !== existing.id)
      await refresh()
      if (activeProjectId === existing.id) {
        if (remaining[0]) setActiveProject(remaining[0].id)
        else {
          setActiveProject('')
          goHome()
        }
      }
      toast('success', 'Project deleted.')
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
      title={existing ? 'Edit project' : 'New project'}
      subtitle="A project adds a shared brief and groups related chats."
      size="md"
      footer={
        <>
          {existing ? (
            <Button
              variant="danger"
              size="md"
              className="mr-auto"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          ) : null}
          <Button variant="ghost" size="md" onClick={closeModal}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={() => void save()} loading={saving}>
            {existing ? 'Save changes' : 'Create project'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-panel2/40 p-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-lg border"
            style={{
              backgroundColor: `${form.color}1f`,
              borderColor: `${form.color}3d`,
              color: form.color,
            }}
          >
            <FolderKanban className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-ink">
              {form.name || 'Untitled project'}
            </div>
            <div className="mt-0.5 truncate text-[10.5px] text-muted">
              {form.description || 'Shared context for every chat in this project.'}
            </div>
          </div>
        </div>

        <Field label="Name">
          <Input
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder="e.g. Client portal"
          />
        </Field>

        <Field label="Description">
          <Input
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
            placeholder="What this project is about"
          />
        </Field>

        <Field label="Color">
          <div className="flex flex-wrap items-center gap-1.5">
            {AGENT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => update('color', color)}
                className={cn(
                  'h-5 w-5 rounded-full border-2 transition-transform hover:scale-110',
                  form.color === color ? 'border-ink' : 'border-transparent',
                )}
                style={{ backgroundColor: color }}
                aria-label={`Use color ${color}`}
              />
            ))}
          </div>
        </Field>

        <Field
          label="Project brief"
          hint="Injected into the root agent's context for every chat in this project."
        >
          <Textarea
            value={form.systemPrompt}
            onChange={(event) => update('systemPrompt', event.target.value)}
            rows={8}
            placeholder="Stack, conventions, constraints, audience, definition of done…"
            className="min-h-[150px]"
          />
        </Field>

        <div className="flex items-start gap-2 rounded-lg border border-line bg-panel2/40 px-3 py-2 text-[10.5px] leading-relaxed text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
          <span>
            Sub-agents receive their brief from the orchestrator. Keep the project brief focused on
            durable context rather than one-off tasks.
          </span>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete project?"
        message={`${existing?.name || 'This project'} and all of its agents and chats will be removed. This cannot be undone.`}
        loading={deleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void remove()}
      />
    </Modal>
  )
}
