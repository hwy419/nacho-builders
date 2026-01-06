"use client"

interface ResponseField {
  name: string
  type: string
  description: string
}

interface ResponseExampleProps {
  fields: ResponseField[]
}

export function ResponseExample({ fields }: ResponseExampleProps) {
  return (
    <div className="my-6">
      <h4 className="text-sm font-semibold text-text-primary mb-3">Response Fields</h4>
      <div className="space-y-2">
        {fields.map((field) => (
          <div
            key={field.name}
            className="flex items-start gap-4 p-3 bg-bg-tertiary border border-border rounded-lg"
          >
            <div className="flex-shrink-0">
              <code className="text-accent font-mono text-xs bg-accent/10 px-1.5 py-0.5 rounded">
                {field.name}
              </code>
            </div>
            <div className="flex-shrink-0">
              <code className="text-text-muted font-mono text-xs">
                {field.type}
              </code>
            </div>
            <div className="text-sm text-text-secondary">
              {field.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
