# Nacho API Documentation System

This document describes the documentation system for the Nacho Cardano API service, including architecture, components, content structure, and maintenance guidelines.

## Overview

The documentation system is built with:
- **Velite** - MDX content processing with type-safe schemas
- **Shiki** - VS Code-quality syntax highlighting
- **Next.js 14** - App Router with static generation
- **Monaco Editor** - Interactive API playground

Documentation is publicly accessible at `https://app.nacho.builders/docs` without authentication. The interactive API playground requires login and uses the user's FREE API key.

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Content | MDX + Velite | Type-safe, git-versioned content |
| Syntax Highlighting | Shiki (github-dark) | Code block styling |
| Editor | Monaco Editor | API playground JSON editing |
| Search | Fuse.js | Client-side fuzzy search |
| Styling | Tailwind CSS | Consistent with app theme |

## Directory Structure

```
apps/web/
├── content/docs/                    # MDX content files
│   ├── getting-started/
│   │   ├── introduction.mdx
│   │   ├── quickstart.mdx
│   │   ├── authentication.mdx
│   │   └── first-request.mdx
│   ├── guides/
│   │   ├── querying-utxos.mdx
│   │   ├── submitting-transactions.mdx
│   │   ├── chain-synchronization.mdx
│   │   ├── websocket-connections.mdx
│   │   └── error-handling.mdx
│   └── api-reference/
│       ├── overview.mdx
│       ├── ledger-state/
│       │   ├── epoch.mdx
│       │   ├── protocol-parameters.mdx
│       │   ├── utxo.mdx
│       │   ├── stake-pools.mdx
│       │   └── tip.mdx
│       ├── network/
│       │   ├── block-height.mdx
│       │   ├── genesis-configuration.mdx
│       │   └── tip.mdx
│       └── transactions/
│           ├── submit-transaction.mdx
│           └── evaluate-transaction.mdx
├── src/
│   ├── app/(public)/docs/           # Docs routes
│   │   ├── layout.tsx               # Sidebar layout
│   │   ├── page.tsx                 # Redirect to intro
│   │   └── [...slug]/page.tsx       # Dynamic MDX renderer
│   ├── components/docs/             # Docs components
│   │   ├── docs-sidebar.tsx         # Navigation sidebar
│   │   ├── docs-page-content.tsx    # MDX renderer (client)
│   │   ├── code-block.tsx           # Syntax highlighted code
│   │   ├── language-tabs.tsx        # Multi-language examples
│   │   ├── api-playground.tsx       # Interactive tester
│   │   ├── callout.tsx              # Info/warning boxes
│   │   ├── external-link.tsx        # Links to ogmios.dev
│   │   └── mdx-components.tsx       # Component registry
│   └── lib/docs/
│       └── navigation.ts            # Sidebar structure
├── velite.config.ts                 # Velite MDX configuration
└── .velite/                         # Generated content (gitignored)
```

## Content Pages

### Getting Started (4 pages)
| Page | Description |
|------|-------------|
| Introduction | Overview of Nacho API and Ogmios |
| Quickstart | 5-minute setup guide |
| Authentication | API key management |
| First Request | Basic query example |

### Guides (5 pages)
| Page | Description |
|------|-------------|
| Querying UTxOs | Address queries, native tokens, coin selection |
| Submitting Transactions | Build, sign, submit workflow |
| Chain Synchronization | WebSocket sync, rollback handling |
| WebSocket Connections | Connection management, reconnection |
| Error Handling | Error codes, retry strategies |

### API Reference (12 pages)
| Category | Methods |
|----------|---------|
| Overview | API introduction, endpoints, rate limits |
| Ledger State | epoch, protocolParameters, utxo, stakePools, tip |
| Network | blockHeight, genesisConfiguration, tip |
| Transactions | submitTransaction, evaluateTransaction |

## MDX Frontmatter Schema

Each MDX file requires this frontmatter:

```yaml
---
title: Page Title                    # Required
description: Brief description       # Optional, used in meta tags
category: api-reference              # Required: getting-started, guides, api-reference
order: 1                             # Display order within category
ogmiosRef: https://ogmios.dev/...    # Optional: link to Ogmios docs
---
```

## Available Components

### CodeBlock
Syntax-highlighted code with copy button:
```mdx
<CodeBlock language="javascript" filename="example.js">
{`const x = 1;`}
</CodeBlock>
```

### LanguageTabs
Multi-language code examples (persists selection to localStorage):
```mdx
<LanguageTabs examples={{
  javascript: `// JS code`,
  typescript: `// TS code`,
  python: `# Python code`,
  go: `// Go code`,
  rust: `// Rust code`,
  curl: `# cURL command`
}} />
```

### APIPlayground
Interactive API tester (requires authentication):
```mdx
<APIPlayground
  method="queryLedgerState/utxo"
  defaultParams={{ addresses: ["addr1..."] }}
/>
```

### Callout
Information boxes with different styles:
```mdx
<Callout type="info">Informational message</Callout>
<Callout type="warning">Warning message</Callout>
<Callout type="tip">Helpful tip</Callout>
<Callout type="danger">Critical warning</Callout>
```

### ExternalLink
Links to external documentation:
```mdx
<ExternalLink href="https://ogmios.dev/api/#...">
  Full Ogmios API Reference
</ExternalLink>
```

### Standard Markdown
All standard markdown is supported:
- Headers (h1-h6)
- Tables
- Code blocks with syntax highlighting
- Lists (ordered/unordered)
- Links and images
- Blockquotes

## Adding New Documentation

### 1. Create MDX File
Create a new `.mdx` file in the appropriate directory:

```bash
# For a new guide
touch content/docs/guides/my-new-guide.mdx

# For a new API method
touch content/docs/api-reference/ledger-state/my-method.mdx
```

### 2. Add Frontmatter
```yaml
---
title: My New Guide
description: What this guide covers
category: guides
order: 6
---
```

### 3. Write Content
Use the available components and standard markdown.

### 4. Update Navigation
Edit `src/lib/docs/navigation.ts`:

```typescript
{
  title: 'Guides',
  items: [
    // ... existing items
    { title: 'My New Guide', href: '/docs/guides/my-new-guide' },
  ],
},
```

### 5. Build and Deploy
```bash
pnpm run build
# Follow deployment steps in CLAUDE.md
```

## API Reference Page Template

```mdx
---
title: methodName
description: Brief description of the method
category: api-reference
order: 1
ogmiosRef: https://ogmios.dev/api/#operation-publish-/?methodName
---

# methodName

Description of what this method does.

## Request

\`\`\`json
{
  "jsonrpc": "2.0",
  "method": "methodName",
  "params": { ... }
}
\`\`\`

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `param1` | `string` | Yes | Description |

<APIPlayground method="methodName" defaultParams={{ ... }} />

## Response

\`\`\`json
{
  "jsonrpc": "2.0",
  "result": { ... }
}
\`\`\`

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `field1` | `string` | Description |

## Code Examples

<LanguageTabs examples={{
  javascript: \`// JavaScript example\`,
  typescript: \`// TypeScript example\`,
  python: \`# Python example\`,
  go: \`// Go example\`,
  rust: \`// Rust example\`,
  curl: \`# cURL example\`
}} />

## Use Cases

- Use case 1
- Use case 2

<ExternalLink href="https://ogmios.dev/api/#...">
  Full Ogmios API Reference
</ExternalLink>
```

## Configuration Files

### velite.config.ts
Configures MDX processing:
- Schema validation for frontmatter
- Shiki syntax highlighting with github-dark theme
- remark-gfm for GitHub Flavored Markdown

### next.config.js
Includes Velite webpack plugin for build-time content processing.

## Deployment

Documentation is deployed as part of the main web application:

```bash
# 1. Build locally
cd apps/web
pnpm exec prisma generate
pnpm run build

# 2. Deploy to server
ssh michael@192.168.170.10 "sudo rm -rf /opt/cardano-api-service/apps/web/.next && sudo mkdir -p /opt/cardano-api-service/apps/web/.next && sudo chown michael:michael /opt/cardano-api-service/apps/web/.next"

rsync -avz .next/ michael@192.168.170.10:/opt/cardano-api-service/apps/web/.next/

rsync -avz .next/static/ michael@192.168.170.10:/opt/cardano-api-service/apps/web/.next/standalone/apps/web/.next/static/

ssh michael@192.168.170.10 "sudo chown -R cardano-api:cardano-api /opt/cardano-api-service/apps/web/.next && sudo systemctl restart cardano-api-web"
```

## URLs

| Environment | URL |
|-------------|-----|
| Production | https://app.nacho.builders/docs |
| Local Dev | http://localhost:3000/docs |

## Styling

Documentation uses the app's existing design system:
- Dark theme with purple accents (#8b5cf6)
- JetBrains Mono for code
- Consistent spacing and typography

Custom styles are in `src/styles/globals.css` under the `/* Documentation */` section.

## Architecture Notes

### Client-Side MDX Rendering
MDX content is evaluated on the client side via `DocsPageContent` component. This avoids Next.js RSC serialization issues with React elements containing Symbols.

### Static Generation
All documentation pages are statically generated at build time for optimal performance. The `generateStaticParams` function in `[...slug]/page.tsx` generates paths from the navigation structure.

### API Playground Authentication
The playground component checks for an authenticated session and fetches the user's FREE API key via tRPC. Unauthenticated users see a "Sign in to try" prompt.

## Troubleshooting

### Build Errors
- **Symbol serialization error**: Ensure MDX evaluation happens in client components
- **Missing content**: Check that MDX files have valid frontmatter
- **Navigation not updating**: Verify `navigation.ts` includes new pages

### Styling Issues
- **Code blocks not styled**: Check Shiki theme configuration in velite.config.ts
- **Layout broken**: Verify Tailwind classes match existing app patterns

### Content Not Appearing
1. Check MDX file exists in `content/docs/`
2. Verify frontmatter is valid YAML
3. Confirm page is in `navigation.ts`
4. Rebuild with `pnpm run build`

## Related Files

- Main docs: `CLAUDE.md` (project overview)
- API Gateway: Kong configuration in `ansible/`
- Web app: `apps/web/` directory
