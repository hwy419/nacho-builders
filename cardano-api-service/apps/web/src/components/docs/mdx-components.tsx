import Link from "next/link"
import { cn } from "@/lib/utils"
import { Callout } from "./callout"
import { CodeBlock, Pre } from "./code-block"
import { LanguageTabs } from "./language-tabs"
import { ExternalLink } from "./external-link"
import { ParameterTable } from "./parameter-table"
import { ResponseExample } from "./response-example"
import { APIPlayground } from "./api-playground"
import { GraphQLPlayground } from "./graphql-playground"

// Custom components for MDX
export const mdxComponents = {
  // Custom components
  Callout,
  CodeBlock,
  LanguageTabs,
  ExternalLink,
  ParameterTable,
  ResponseExample,
  APIPlayground,
  GraphQLPlayground,

  // HTML element overrides
  h1: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1
      className={cn(
        "text-4xl font-bold tracking-tight text-text-primary mt-8 mb-4 first:mt-0",
        className
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className={cn(
        "text-2xl font-semibold tracking-tight text-text-primary mt-10 mb-4 pb-2 border-b border-border",
        className
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3
      className={cn(
        "text-xl font-semibold tracking-tight text-text-primary mt-8 mb-3",
        className
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4
      className={cn(
        "text-lg font-semibold tracking-tight text-text-primary mt-6 mb-2",
        className
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p
      className={cn(
        "text-text-secondary leading-7 [&:not(:first-child)]:mt-4",
        className
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul
      className={cn(
        "my-4 ml-6 list-disc text-text-secondary [&>li]:mt-2",
        className
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol
      className={cn(
        "my-4 ml-6 list-decimal text-text-secondary [&>li]:mt-2",
        className
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li className={cn("text-text-secondary", className)} {...props} />
  ),
  blockquote: ({ className, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className={cn(
        "mt-6 border-l-4 border-accent pl-4 italic text-text-secondary",
        className
      )}
      {...props}
    />
  ),
  table: ({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="my-6 w-full overflow-x-auto">
      <table
        className={cn(
          "w-full text-sm",
          className
        )}
        {...props}
      />
    </div>
  ),
  thead: ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className={cn("border-b border-border", className)} {...props} />
  ),
  tbody: ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <tbody className={cn("[&>tr]:border-b [&>tr]:border-border/50", className)} {...props} />
  ),
  tr: ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr className={cn("", className)} {...props} />
  ),
  th: ({ className, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th
      className={cn(
        "py-3 px-4 text-left font-semibold text-text-primary",
        className
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td
      className={cn(
        "py-3 px-4 text-text-secondary",
        className
      )}
      {...props}
    />
  ),
  pre: Pre,
  code: ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => {
    // Inline code (not inside pre)
    const isInline = !className?.includes("language-")
    if (isInline) {
      return (
        <code
          className={cn(
            "relative rounded bg-bg-tertiary px-[0.4rem] py-[0.2rem] font-mono text-sm text-accent",
            className
          )}
          {...props}
        />
      )
    }
    // Code inside pre - let shiki handle it
    return <code className={cn("font-mono", className)} {...props} />
  },
  a: ({ className, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const isExternal = href?.startsWith("http")
    if (isExternal) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "text-accent hover:text-accent-hover underline underline-offset-4",
            className
          )}
          {...props}
        />
      )
    }
    return (
      <Link
        href={href || "#"}
        className={cn(
          "text-accent hover:text-accent-hover underline underline-offset-4",
          className
        )}
        {...props}
      />
    )
  },
  hr: ({ ...props }) => (
    <hr className="my-8 border-border" {...props} />
  ),
  strong: ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className={cn("font-semibold text-text-primary", className)} {...props} />
  ),
}
