"use client"

import { cn } from "@/lib/utils"

interface Parameter {
  name: string
  type: string
  required?: boolean
  description: string
  default?: string
}

interface ParameterTableProps {
  parameters: Parameter[]
  note?: string
}

export function ParameterTable({ parameters, note }: ParameterTableProps) {
  if (parameters.length === 0 && note) {
    return (
      <div className="my-4 p-4 bg-bg-tertiary border border-border rounded-lg text-text-secondary text-sm">
        {note}
      </div>
    )
  }

  return (
    <div className="my-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 font-semibold text-text-primary">Parameter</th>
            <th className="text-left py-3 px-4 font-semibold text-text-primary">Type</th>
            <th className="text-left py-3 px-4 font-semibold text-text-primary">Required</th>
            <th className="text-left py-3 px-4 font-semibold text-text-primary">Description</th>
          </tr>
        </thead>
        <tbody>
          {parameters.map((param) => (
            <tr key={param.name} className="border-b border-border/50">
              <td className="py-3 px-4">
                <code className="text-accent font-mono text-xs bg-accent/10 px-1.5 py-0.5 rounded">
                  {param.name}
                </code>
              </td>
              <td className="py-3 px-4">
                <code className="text-text-secondary font-mono text-xs">
                  {param.type}
                </code>
              </td>
              <td className="py-3 px-4">
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded',
                  param.required
                    ? 'bg-error/10 text-error'
                    : 'bg-text-muted/10 text-text-muted'
                )}>
                  {param.required ? 'Required' : 'Optional'}
                </span>
              </td>
              <td className="py-3 px-4 text-text-secondary">
                {param.description}
                {param.default && (
                  <span className="block text-xs text-text-muted mt-1">
                    Default: <code className="font-mono">{param.default}</code>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && (
        <p className="mt-2 text-xs text-text-muted px-4">{note}</p>
      )}
    </div>
  )
}
