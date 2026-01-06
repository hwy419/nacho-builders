"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Check, Copy, FileCode } from "lucide-react"

interface CodeBlockProps {
  code: string
  language?: string
  filename?: string
  showLineNumbers?: boolean
  className?: string
}

export function CodeBlock({
  code,
  language = 'typescript',
  filename,
  showLineNumbers = false,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className={cn('relative group my-4', className)}>
      {filename && (
        <div className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary border border-b-0 border-border rounded-t-lg text-sm text-text-secondary">
          <FileCode className="h-4 w-4" />
          <span>{filename}</span>
        </div>
      )}
      <div className={cn(
        'relative',
        filename ? 'rounded-b-lg' : 'rounded-lg'
      )}>
        <pre className={cn(
          'overflow-x-auto bg-bg-tertiary border border-border p-4 text-sm',
          filename ? 'rounded-b-lg' : 'rounded-lg',
          showLineNumbers && 'pl-12'
        )}>
          <code className="font-mono text-text-primary">
            {code}
          </code>
        </pre>
        <button
          onClick={copyToClipboard}
          className={cn(
            'absolute top-3 right-3 p-2 rounded-md transition-all',
            'bg-bg-secondary/50 hover:bg-bg-secondary border border-border',
            'opacity-0 group-hover:opacity-100',
            copied && 'opacity-100'
          )}
          title={copied ? 'Copied!' : 'Copy code'}
        >
          {copied ? (
            <Check className="h-4 w-4 text-success" />
          ) : (
            <Copy className="h-4 w-4 text-text-secondary" />
          )}
        </button>
      </div>
    </div>
  )
}

// Pre component for MDX - wraps shiki output
export function Pre({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLPreElement>) {
  return (
    <div className="relative group my-4">
      <pre
        className={cn(
          'overflow-x-auto bg-bg-tertiary border border-border p-4 rounded-lg text-sm',
          '[&>code]:bg-transparent [&>code]:p-0 [&>code]:text-sm',
          className
        )}
        {...props}
      >
        {children}
      </pre>
      <CopyButton getText={() => {
        const el = document.querySelector('pre code')
        return el?.textContent || ''
      }} />
    </div>
  )
}

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      const text = getText()
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'absolute top-3 right-3 p-2 rounded-md transition-all',
        'bg-bg-secondary/50 hover:bg-bg-secondary border border-border',
        'opacity-0 group-hover:opacity-100',
        copied && 'opacity-100'
      )}
      title={copied ? 'Copied!' : 'Copy code'}
    >
      {copied ? (
        <Check className="h-4 w-4 text-success" />
      ) : (
        <Copy className="h-4 w-4 text-text-secondary" />
      )}
    </button>
  )
}
