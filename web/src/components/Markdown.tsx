import { Check, Copy } from 'lucide-react'
import { isValidElement, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { cn } from './ui'

function CodeBlock({ children }: { children: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  let language = ''
  if (isValidElement(children)) {
    const className = (children.props as { className?: string }).className || ''
    const match = className.match(/language-([\w-]+)/)
    if (match) language = match[1]
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preRef.current?.innerText || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{language || 'code'}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-faint transition-colors hover:bg-panel2 hover:text-ink"
        >
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre ref={preRef} className="scroll-thin">
        {children}
      </pre>
    </div>
  )
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('md', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre({ children }) {
            return <CodeBlock>{children}</CodeBlock>
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
