import {
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Package,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { relativeTime } from '../lib/format'
import { useAppStore } from '../store'
import type { Artifact, ChatFile } from '../types'
import { Avatar, Button, cn, EmptyState, Spinner } from './ui'

function sizeLabel(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function artifactIcon(name: string) {
  const extension = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg'].includes(extension)) {
    return ImageIcon
  }
  if (['.xlsx', '.xlsm', '.xls', '.csv', '.tsv'].includes(extension)) return FileSpreadsheet
  return FileText
}

function toChatFile(artifact: Artifact): ChatFile {
  return {
    id: artifact.fileId,
    projectId: artifact.projectId,
    chatId: artifact.chatId,
    messageId: '',
    name: artifact.name,
    storedPath: '',
    mimeType: '',
    size: artifact.size,
    createdAt: artifact.createdAt,
  }
}

export function ArtifactsPanel() {
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const projects = useAppStore((state) => state.projects)
  const agents = useAppStore((state) => state.agents)
  const artifactsChangedAt = useAppStore((state) => state.artifactsChangedAt)
  const openPreview = useAppStore((state) => state.openPreview)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!activeProjectId) {
      setArtifacts([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    api
      .artifacts(activeProjectId)
      .then((result) => {
        if (!cancelled) setArtifacts(result.artifacts)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeProjectId, artifactsChangedAt, reloadKey])

  const project = projects.find((entry) => entry.id === activeProjectId)

  const groups = useMemo(() => {
    const search = query.trim().toLowerCase()
    const visible = search
      ? artifacts.filter(
          (artifact) =>
            artifact.name.toLowerCase().includes(search) ||
            artifact.path.toLowerCase().includes(search),
        )
      : artifacts
    const map = new Map<string, Artifact[]>()
    for (const artifact of visible) {
      const key = artifact.agentId || 'unknown'
      const list = map.get(key) || []
      list.push(artifact)
      map.set(key, list)
    }
    const entries = [...map.entries()]
    entries.sort(([a], [b]) => {
      const agentA = agents.find((agent) => agent.id === a)
      const agentB = agents.find((agent) => agent.id === b)
      if (agentA?.isOrchestrator) return -1
      if (agentB?.isOrchestrator) return 1
      return (agentA?.name || 'zz').localeCompare(agentB?.name || 'zz')
    })
    return entries
  }, [artifacts, query, agents])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-faint">
          {artifacts.length} artifact{artifacts.length === 1 ? '' : 's'}
          {project ? ` · ${project.name}` : ''}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-panel2 hover:text-ink"
          title="Refresh artifacts"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'spin')} />
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-faint" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter artifacts"
          className="h-7.5 w-full rounded-md border border-line bg-panel2 pl-7 pr-2 text-[11px] text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
        />
      </div>

      {loading && !artifacts.length ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-4 w-4 text-accent" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-[10.5px] text-danger">
          {error}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Package className="h-4 w-4" />}
          title={artifacts.length ? 'No matching artifacts' : 'No artifacts yet'}
          description={
            artifacts.length
              ? 'Try a different name.'
              : 'Uploaded files and files agents create in the workspace appear here.'
          }
          action={
            <Button size="sm" variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          }
          className="py-8"
        />
      ) : (
        <div className="space-y-3">
          {groups.map(([agentId, items]) => {
            const agent = agents.find((entry) => entry.id === agentId)
            return (
              <div key={agentId}>
                <div className="mb-1 flex items-center gap-1.5 px-1">
                  {agent ? (
                    <Avatar name={agent.name} color={agent.color} size="xs" />
                  ) : (
                    <FolderOpen className="h-3 w-3 text-faint" />
                  )}
                  <span className="truncate text-[10px] font-semibold text-ink">
                    {agent?.name || 'Unassigned'}
                  </span>
                  <span className="text-[9px] text-faint">{items.length}</span>
                </div>
                <div className="space-y-0.5">
                  {items.map((artifact) => {
                    const Icon = artifactIcon(artifact.name)
                    return (
                      <button
                        key={`${artifact.source}-${artifact.id}`}
                        type="button"
                        onClick={() =>
                          openPreview(
                            artifact.source === 'upload'
                              ? { source: 'chat', file: toChatFile(artifact) }
                              : {
                                  source: 'workspace',
                                  projectId: artifact.projectId,
                                  path: artifact.path,
                                  name: artifact.name,
                                  size: artifact.size,
                                  modifiedAt: artifact.modifiedAt,
                                },
                          )
                        }
                        className="flex w-full items-center gap-2 rounded-lg border border-line/70 bg-panel px-2 py-1.5 text-left transition-colors hover:border-accent/30 hover:bg-panel2/60"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[10.5px] font-medium text-ink">
                            {artifact.name}
                          </span>
                          <span className="block truncate text-[9px] text-faint">
                            {artifact.source === 'upload' ? 'upload' : artifact.path} ·{' '}
                            {sizeLabel(artifact.size)} · {relativeTime(artifact.modifiedAt)}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
