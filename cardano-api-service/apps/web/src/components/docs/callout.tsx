"use client"

import { cn } from "@/lib/utils"
import { Info, AlertTriangle, Lightbulb, XCircle } from "lucide-react"

interface CalloutProps {
  type?: 'info' | 'warning' | 'tip' | 'danger'
  title?: string
  children: React.ReactNode
}

const icons = {
  info: Info,
  warning: AlertTriangle,
  tip: Lightbulb,
  danger: XCircle,
}

const styles = {
  info: {
    container: 'border-info/30 bg-info/5',
    icon: 'text-info',
    title: 'text-info',
  },
  warning: {
    container: 'border-warning/30 bg-warning/5',
    icon: 'text-warning',
    title: 'text-warning',
  },
  tip: {
    container: 'border-accent/30 bg-accent/5',
    icon: 'text-accent',
    title: 'text-accent',
  },
  danger: {
    container: 'border-error/30 bg-error/5',
    icon: 'text-error',
    title: 'text-error',
  },
}

export function Callout({ type = 'info', title, children }: CalloutProps) {
  const Icon = icons[type]
  const style = styles[type]

  return (
    <div className={cn(
      'my-6 rounded-lg border p-4',
      style.container
    )}>
      <div className="flex gap-3">
        <Icon className={cn('h-5 w-5 mt-0.5 flex-shrink-0', style.icon)} />
        <div className="flex-1">
          {title && (
            <p className={cn('font-semibold mb-1', style.title)}>
              {title}
            </p>
          )}
          <div className="text-text-secondary text-sm [&>p]:m-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
