"use client"

import * as runtime from "react/jsx-runtime"
import { useMemo } from "react"
import { mdxComponents } from "./mdx-components"
import { DocsPageHeader } from "./difficulty-badge"
import { TableOfContents, FloatingTableOfContents } from "./table-of-contents"
import { PageFeedback } from "./page-feedback"
import { Difficulty } from "@/lib/docs/navigation"

interface DocsPageContentProps {
  title: string
  description?: string
  body: string
  slug: string
  difficulty?: Difficulty
  readingTime?: number
  lastUpdated?: string
}

export function DocsPageContent({
  title,
  description,
  body,
  slug,
  difficulty,
  readingTime,
  lastUpdated,
}: DocsPageContentProps) {
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

  // Generate edit URL for GitHub
  const editUrl = `https://github.com/nacho-stake/cardano-api-service/edit/main/apps/web/content/${slug}.mdx`

  return (
    <div className="flex gap-8">
      {/* Main content column */}
      <div className="flex-1 min-w-0 max-w-3xl">
        {/* Enhanced Page Header */}
        <DocsPageHeader
          title={title}
          description={description}
          difficulty={difficulty}
          readingTime={readingTime}
          lastUpdated={lastUpdated}
          editUrl={editUrl}
        />

        {/* MDX Content */}
        <div className="docs-content">
          <Component components={mdxComponents} />
        </div>

        {/* Page Feedback */}
        <PageFeedback pageSlug={slug} />
      </div>

      {/* Right sidebar - Table of Contents (desktop only) */}
      <aside className="hidden xl:block w-56 flex-shrink-0">
        <div className="sticky top-8">
          <TableOfContents />
        </div>
      </aside>

      {/* Mobile floating TOC button */}
      <FloatingTableOfContents />
    </div>
  )
}
