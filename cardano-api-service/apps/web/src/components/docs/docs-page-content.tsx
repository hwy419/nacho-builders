"use client"

import * as runtime from "react/jsx-runtime"
import { useMemo } from "react"
import { mdxComponents } from "./mdx-components"

interface DocsPageContentProps {
  title: string
  description?: string
  body: string
}

export function DocsPageContent({ title, description, body }: DocsPageContentProps) {
  const Component = useMemo(() => {
    // Velite compiles MDX to: const{Fragment:e,jsx:n,jsxs:r}=arguments[0]
    // We need to pass the jsx runtime as the first argument
    const fn = new Function(body)
    return fn({
      Fragment: runtime.Fragment,
      jsx: runtime.jsx,
      jsxs: runtime.jsxs,
    }).default
  }, [body])

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-text-primary mb-2">
          {title}
        </h1>
        {description && (
          <p className="text-lg text-text-secondary">
            {description}
          </p>
        )}
      </header>

      {/* Content */}
      <article className="docs-content">
        <Component components={mdxComponents} />
      </article>
    </div>
  )
}
