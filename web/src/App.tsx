import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { applyTheme, useAppStore } from './store'
import { AgentModal } from './components/AgentModal'
import { AuthScreen } from './components/AuthScreen'
import { ChatView } from './components/ChatView'
import { Inspector } from './components/Inspector'
import { ProjectModal } from './components/ProjectModal'
import { SettingsModal } from './components/SettingsModal'
import { Sidebar } from './components/Sidebar'
import { Toasts } from './components/Toasts'
import { Button } from './components/ui'

function Splash() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-bg">
      <div className="logo-mark flex h-12 w-12 items-center justify-center rounded-2xl text-white">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 3 4.5 7.2v9.6L12 21l7.5-4.2V7.2L12 3Z" strokeLinejoin="round" />
          <path d="m4.8 7.4 7.2 4.1 7.2-4.1M12 11.5V21" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="flex items-center gap-2 text-[11.5px] text-muted">
        <Loader2 className="spin h-3.5 w-3.5" />
        Starting your workspace…
      </div>
    </div>
  )
}

function BootError({ message }: { message: string }) {
  const retry = useAppStore((state) => state.retry)
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-danger/25 bg-danger/10 text-danger">
          <AlertTriangle className="h-4.5 w-4.5" />
        </div>
        <h1 className="mt-3 text-[15px] font-semibold text-ink">Cannot reach the workspace</h1>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{message}</p>
        <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
          Make sure the API server is running. In development that is{' '}
          <span className="font-mono">npm run dev</span>; in production, start the built server.
        </p>
        <Button variant="primary" size="md" className="mt-4" onClick={retry}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    </div>
  )
}

export default function App() {
  const init = useAppStore((state) => state.init)
  const ready = useAppStore((state) => state.ready)
  const booting = useAppStore((state) => state.booting)
  const bootError = useAppStore((state) => state.bootError)
  const needsAuth = useAppStore((state) => state.needsAuth)
  const theme = useAppStore((state) => state.theme)
  const modal = useAppStore((state) => state.modal)
  const hasDetail = useAppStore((state) => Boolean(state.detail))
  const inspectorTab = useAppStore((state) => state.inspectorTab)
  const inspectorOpen = useAppStore((state) => state.inspectorOpen)
  const chatTitle = useAppStore((state) => state.detail?.chat.title || '')
  const workspaceName = useAppStore((state) => state.settings.workspaceName)
  const newChat = useAppStore((state) => state.newChat)
  const openModal = useAppStore((state) => state.openModal)
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    document.title = chatTitle
      ? `${chatTitle} · ${workspaceName || 'OpenCodex'}`
      : `${workspaceName || 'OpenCodex'}`
  }, [chatTitle, workspaceName])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void newChat()
      }
      if (mod && event.key === ',') {
        event.preventDefault()
        openModal({ type: 'settings', tab: 'providers' })
      }
      if (event.key === 'Escape') {
        setSidebarOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [newChat, openModal, setSidebarOpen])

  if (booting) return <Splash />
  if (needsAuth) return <AuthScreen />
  if (!ready) return <BootError message={bootError || 'The workspace did not finish loading.'} />

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-bg">
      <Sidebar />
      <ChatView />
      {(hasDetail || inspectorTab === 'memory') && inspectorOpen ? <Inspector /> : null}

      {modal?.type === 'settings' ? (
        <SettingsModal initialTab={modal.tab || 'providers'} />
      ) : null}
      {modal?.type === 'agent' ? <AgentModal agentId={modal.id} /> : null}
      {modal?.type === 'project' ? <ProjectModal projectId={modal.id} /> : null}

      <Toasts />
    </div>
  )
}
