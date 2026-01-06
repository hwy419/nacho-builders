"use client"

import { ExternalLink as ExternalLinkIcon } from "lucide-react"

interface ExternalLinkProps {
  href: string
  children: React.ReactNode
}

export function ExternalLink({ href, children }: ExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-accent hover:text-accent-hover transition-colors mt-4"
    >
      <ExternalLinkIcon className="h-4 w-4" />
      <span>{children}</span>
    </a>
  )
}
