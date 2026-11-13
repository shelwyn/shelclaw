import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  RefreshCw,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { relativeTime } from '../lib/format'
import { useAppStore } from '../store'
import type { ChatFile, PreviewPayload, PreviewTarget, WorkspaceFile } from '../types'
import { cn, EmptyState, Spinner } from './ui'

function sizeLabel(bytes: number | undefined): string {
  if (!bytes || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(name: string) {
  const extension = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg'].includes(extension)) {
    return ImageIcon
  }
  if (['.xlsx', '.xlsm', '.xls', '.csv', '.tsv'].includes(extension)) return FileSpreadsheet
  return FileText
}

function FileIcon({ name, className }: { name: string; className?: string }) {
  const Icon = fileIcon(name)
  return <Icon className={className} />
}

function SpreadsheetPreview({ payload }: { payload: PreviewPayload }) {
  const sheets = payload.sheets || []
  const [active, setActive] = useState(0)
  const sheet = sheets[Math.min(active, sheets.length - 1)]
  if (!sheet) {
    return (
      <EmptyState
        icon={<FileSpreadsheet className="h-4 w-4" />}
        title="Empty spreadsheet"
        description="No sheets were found."
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {sheets.length > 1 ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-3 py-1.5 scroll-thin">
          {sheets.map((entry, index) => (
            <button
              key={`${entry.name}-${index}`}
              type="button"
              onClick={() => setActive(index)}
              className={cn(
                'shrink-0 rounded px-2 py-1 text-[10.5px] font-medium transition-colors',
                index === active
                  ? 'bg-accent-soft text-accent'
                  : 'text-muted hover:bg-panel2 hover:text-ink',
              )}
            >
              {entry.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          <tbody>
            {sheet.rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-faint">This sheet is empty.</td>
              </tr>
            ) : (
              sheet.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex === 0 ? 'bg-panel2/70' : 'odd:bg-panel2/20'}>
                  {row.map((cell, cellIndex) => {
                    const Tag = rowIndex === 0 ? 'th' : 'td'
                    return (
                      <Tag
                        key={cellIndex}
                        className={cn(
                          'max-w-[280px] truncate border border-line px-2 py-1 text-left align-top',
                          rowIndex === 0 ? 'font-semibold text-ink' : 'text-muted',
                        )}
                        title={cell}
                      >
                        {cell}
                      </Tag>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PreviewBody({
  target,
  payload,
  loading,
  error,
  blobUrl,
  onRetry,
  onDownload,
}: {
  target: PreviewTarget
  payload: PreviewPayload | null
  loading: boolean
  error: string
  blobUrl: string
  onRetry: () => void
  onDownload: () => void
}) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-5 w-5 text-accent" />
      </div>
    )
  }

  if (error || !payload) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <FileText className="h-6 w-6 text-faint" />
        <div>
          <div className="text-[12.5px] font-medium text-ink">Preview unavailable</div>
          <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-muted">
            {error || 'The server could not read this file.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-muted hover:text-ink"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-medium text-accent-ink"
          >
            <Download className="h-3 w-3" /> Download
          </button>
        </div>
      </div>
    )
  }

  if (payload.kind === 'pdf') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {blobUrl ? (
          <iframe title={target.source === 'chat' ? target.file.name : target.name} src={blobUrl} className="h-full w-full flex-1 bg-panel2" />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="h-5 w-5 text-accent" />
          </div>
        )}
        <div className="shrink-0 border-t border-line px-3 py-1.5 text-[10px] text-faint">
          PDF preview uses the browser viewer. You can also download the file.
        </div>
      </div>
    )
  }

  if (payload.kind === 'image') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-panel2/30 p-4">
        {blobUrl ? (
          <img
            src={blobUrl}
            alt={payload.name}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <Spinner className="h-5 w-5 text-accent" />
        )}
      </div>
    )
  }

  if (payload.kind === 'spreadsheet') {
    return <SpreadsheetPreview payload={payload} />
  }

  if (payload.kind === 'document') {
    return (
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div
          className="doc-preview px-6 py-5 text-[13px] leading-relaxed text-ink"
          dangerouslySetInnerHTML={{ __html: payload.html || '' }}
        />
        {payload.warnings?.length ? (
          <div className="border-t border-line px-5 py-2 text-[10px] text-faint">
            Some formatting may not be preserved.
          </div>
        ) : null}
      </div>
    )
  }

  if (payload.kind === 'text') {
    return (
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        <pre className="whitespace-pre-wrap break-words px-4 py-4 font-mono text-[11.5px] leading-relaxed text-ink">
          {payload.content}
        </pre>
        {payload.truncated ? (
          <div className="border-t border-line px-4 py-2 text-[10px] text-faint">
            Preview truncated. Download the file to see the rest.
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <FileText className="h-6 w-6 text-faint" />
      <div>
        <div className="text-[12.5px] font-medium text-ink">No preview available</div>
        <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-muted">
          {payload.message || 'Download the file to open it locally.'}
        </p>
      </div>
      <button
        type="button"
        onClick={onDownload}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-medium text-accent-ink"
      >
        <Download className="h-3 w-3" /> Download
      </button>
    </div>
  )
}

export function PreviewDrawer() {
  const open = useAppStore((state) => state.previewOpen)
  const target = useAppStore((state) => state.previewTarget)
  const closePreview = useAppStore((state) => state.closePreview)
  const openPreview = useAppStore((state) => state.openPreview)
  const openFilesPanel = useAppStore((state) => state.openFilesPanel)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const projects = useAppStore((state) => state.projects)

  const project = projects.find((entry) => entry.id === activeProjectId)
  const [payload, setPayload] = useState<PreviewPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [blobUrl, setBlobUrl] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([])
  const [projectUploads, setProjectUploads] = useState<ChatFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreview()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, closePreview])

  useEffect(() => {
    setQuery('')
  }, [target, open])

  useEffect(() => {
    if (!open || target || !activeProjectId) return
    let cancelled = false
    setFilesLoading(true)
    setFilesError('')
    Promise.allSettled([api.workspaceFiles(activeProjectId), api.artifacts(activeProjectId)])
      .then(([workspaceResult, artifactResult]) => {
        if (cancelled) return
        if (workspaceResult.status === 'fulfilled') {
          setWorkspaceFiles(workspaceResult.value.files)
        } else {
          setFilesError(
            workspaceResult.reason instanceof Error
              ? workspaceResult.reason.message
              : String(workspaceResult.reason),
          )
        }
        if (artifactResult.status === 'fulfilled') {
          setProjectUploads(
            artifactResult.value.artifacts
              .filter((artifact) => artifact.source === 'upload' && artifact.fileId)
              .map((artifact) => ({
                id: artifact.fileId,
                projectId: artifact.projectId,
                chatId: artifact.chatId,
                messageId: '',
                name: artifact.name,
                storedPath: '',
                mimeType: '',
                size: artifact.size,
                createdAt: artifact.createdAt,
              })),
          )
        }
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, target, activeProjectId, reloadKey])

  useEffect(() => {
    if (!open || !target) {
      setPayload(null)
      setError('')
      setLoading(false)
      return
    }
    let cancelled = false
    let objectUrl = ''
    setPayload(null)
    setError('')
    setBlobUrl('')
    setLoading(true)
    const load = async () => {
      try {
        const preview =
          target.source === 'chat'
            ? await api.previewChatFile(target.file.id)
            : await api.previewWorkspaceFile(target.projectId, target.path)
        if (cancelled) return
        setPayload(preview)
        if (preview.kind === 'pdf' || preview.kind === 'image') {
          const blob =
            target.source === 'chat'
              ? await api.chatFileBlob(target.file.id)
              : await api.workspaceFileBlob(target.projectId, target.path)
          if (cancelled) return
          objectUrl = URL.createObjectURL(blob)
          setBlobUrl(objectUrl)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [open, target, reloadKey])

  const title = target ? (target.source === 'chat' ? target.file.name : target.name) : 'Project files'
  const targetSize = target
    ? target.source === 'chat'
      ? target.file.size
      : target.size
    : 0

  const download = () => {
    if (!target) return
    if (target.source === 'chat') void api.downloadChatFile(target.file)
    else void api.downloadWorkspaceFile(target.projectId, target.path, target.name)
  }

  const files = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return workspaceFiles
    return workspaceFiles.filter(
      (file) =>
        file.name.toLowerCase().includes(search) || file.path.toLowerCase().includes(search),
    )
  }, [workspaceFiles, query])

  const chatUploads = projectUploads

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] md:hidden"
        onClick={closePreview}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[720px] flex-col border-l border-line bg-panel shadow-[-24px_0_80px_-40px_rgba(0,0,0,0.5)]">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3.5">
          {target ? (
            <button
              type="button"
              onClick={openFilesPanel}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel2 hover:text-ink"
              aria-label="Back to files"
              title="Back to files"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent">
              <FolderOpen className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-ink" title={title}>
              {title}
            </div>
            <div className="truncate text-[9.5px] text-faint">
              {target
                ? `${sizeLabel(targetSize)} · ${payload?.kind || 'loading'}`
                : project
                  ? project.workspacePath
                  : 'No project selected'}
            </div>
          </div>
          {target ? (
            <button
              type="button"
              onClick={download}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel2 hover:text-ink"
              aria-label="Download file"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel2 hover:text-ink"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', (loading || filesLoading) && 'spin')} />
          </button>
          <button
            type="button"
            onClick={closePreview}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel2 hover:text-ink"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {target ? (
          <PreviewBody
            target={target}
            payload={payload}
            loading={loading}
            error={error}
            blobUrl={blobUrl}
            onRetry={() => setReloadKey((value) => value + 1)}
            onDownload={download}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-line p-2.5">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter files"
                className="h-8 w-full rounded-lg border border-line bg-panel2 px-2.5 text-[11.5px] text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
              />
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
              {chatUploads.length ? (
                <div className="mb-3">
                  <div className="px-1.5 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">
                    Uploads
                  </div>
                  <div className="space-y-0.5">
                    {chatUploads.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => openPreview({ source: 'chat', file })}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-panel2"
                      >
                        <FileIcon name={file.name} className="h-3.5 w-3.5 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11.5px] font-medium text-ink">
                            {file.name}
                          </span>
                          <span className="block text-[9.5px] text-faint">
                            {sizeLabel(file.size)} · uploaded
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="px-1.5 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">
                Workspace files
              </div>
              {filesLoading && !workspaceFiles.length ? (
                <div className="flex justify-center py-10">
                  <Spinner className="h-4 w-4 text-accent" />
                </div>
              ) : filesError ? (
                <div className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-[10.5px] text-danger">
                  {filesError}
                </div>
              ) : files.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line px-3 py-8 text-center text-[10.5px] text-faint">
                  {workspaceFiles.length
                    ? 'No files match this filter.'
                    : 'No files in this workspace yet. Files created by agents appear here.'}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {files.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() =>
                        openPreview({
                          source: 'workspace',
                          projectId: activeProjectId,
                          path: file.path,
                          name: file.name,
                          size: file.size,
                          modifiedAt: file.modifiedAt,
                        })
                      }
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-panel2"
                    >
                      <FileIcon name={file.name} className="h-3.5 w-3.5 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11.5px] font-medium text-ink">
                          {file.name}
                        </span>
                        <span className="block truncate text-[9.5px] text-faint">
                          {file.path.includes('/') ? `${file.path} · ` : ''}
                          {sizeLabel(file.size)} · {relativeTime(file.modifiedAt)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
