export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export interface NavItem {
  title: string
  href?: string
  items?: NavItem[]
  isNew?: boolean
  difficulty?: Difficulty
  readingTime?: number // in minutes
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const docsNavigation: NavSection[] = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Introduction', href: '/docs/getting-started/introduction', difficulty: 'beginner', readingTime: 3 },
      { title: 'Quickstart', href: '/docs/getting-started/quickstart', difficulty: 'beginner', readingTime: 5 },
      { title: 'Authentication', href: '/docs/getting-started/authentication', difficulty: 'beginner', readingTime: 4 },
      { title: 'First Request', href: '/docs/getting-started/first-request', difficulty: 'beginner', readingTime: 5 },
    ],
  },
  {
    title: 'Learn',
    items: [
      {
        title: 'Learning Paths',
        href: '/docs/learn/overview',
        isNew: true,
        difficulty: 'beginner',
      },
      {
        title: 'Wallet Developer',
        items: [
          { title: 'Overview', href: '/docs/learn/wallet-developer/overview', difficulty: 'beginner', readingTime: 5 },
          { title: 'Build a Balance Checker', href: '/docs/learn/wallet-developer/build-balance-checker', difficulty: 'beginner', readingTime: 15 },
          { title: 'Build a Transaction Sender', href: '/docs/learn/wallet-developer/build-transaction-sender', difficulty: 'intermediate', readingTime: 20 },
        ],
      },
      {
        title: 'dApp Developer',
        items: [
          { title: 'Overview', href: '/docs/learn/dapp-developer/overview', difficulty: 'intermediate', readingTime: 5 },
          { title: 'Smart Contract Integration', href: '/docs/learn/dapp-developer/integrate-smart-contracts', difficulty: 'advanced', readingTime: 25 },
          { title: 'Handle User Wallets', href: '/docs/learn/dapp-developer/handle-user-wallets', difficulty: 'intermediate', readingTime: 15 },
        ],
      },
      {
        title: 'Exchange Integrator',
        items: [
          { title: 'Overview', href: '/docs/learn/exchange-integrator/overview', difficulty: 'intermediate', readingTime: 5 },
          { title: 'Monitor Deposits', href: '/docs/learn/exchange-integrator/monitor-deposits', difficulty: 'intermediate', readingTime: 20 },
          { title: 'Process Withdrawals', href: '/docs/learn/exchange-integrator/process-withdrawals', difficulty: 'advanced', readingTime: 25 },
        ],
      },
    ],
  },
  {
    title: 'Guides',
    items: [
      {
        title: 'Beginner',
        items: [
          { title: 'Querying UTxOs', href: '/docs/guides/querying-utxos', difficulty: 'beginner', readingTime: 8 },
          { title: 'Error Handling', href: '/docs/guides/error-handling', difficulty: 'beginner', readingTime: 7 },
        ],
      },
      {
        title: 'Intermediate',
        items: [
          { title: 'Submitting Transactions', href: '/docs/guides/submitting-transactions', difficulty: 'intermediate', readingTime: 12 },
          { title: 'WebSocket Connections', href: '/docs/guides/websocket-connections', difficulty: 'intermediate', readingTime: 10 },
          { title: 'Chain Synchronization', href: '/docs/guides/chain-synchronization', difficulty: 'intermediate', readingTime: 15 },
        ],
      },
      {
        title: 'Advanced',
        isNew: true,
        items: [
          { title: 'Production Deployment', href: '/docs/guides/advanced/production-deployment', difficulty: 'advanced', readingTime: 20 },
          { title: 'Multi-Sig Transactions', href: '/docs/guides/advanced/multi-sig-transactions', difficulty: 'advanced', readingTime: 18 },
          { title: 'Token Minting', href: '/docs/guides/advanced/token-minting', difficulty: 'advanced', readingTime: 22 },
          { title: 'Metadata Handling', href: '/docs/guides/advanced/metadata-handling', difficulty: 'advanced', readingTime: 15 },
        ],
      },
    ],
  },
  {
    title: 'API Reference',
    items: [
      { title: 'Overview', href: '/docs/api-reference/overview' },
      {
        title: 'GraphQL API',
        isNew: true,
        items: [
          { title: 'Overview', href: '/docs/api-reference/graphql/overview' },
        ],
      },
      {
        title: 'Ledger State',
        items: [
          { title: 'epoch', href: '/docs/api-reference/ledger-state/epoch' },
          { title: 'protocolParameters', href: '/docs/api-reference/ledger-state/protocol-parameters' },
          { title: 'utxo', href: '/docs/api-reference/ledger-state/utxo' },
          { title: 'stakePools', href: '/docs/api-reference/ledger-state/stake-pools' },
          { title: 'tip', href: '/docs/api-reference/ledger-state/tip' },
        ],
      },
      {
        title: 'Network',
        items: [
          { title: 'blockHeight', href: '/docs/api-reference/network/block-height' },
          { title: 'genesisConfiguration', href: '/docs/api-reference/network/genesis-configuration' },
          { title: 'tip', href: '/docs/api-reference/network/tip' },
        ],
      },
      {
        title: 'Transactions',
        items: [
          { title: 'submitTransaction', href: '/docs/api-reference/transactions/submit-transaction' },
          { title: 'evaluateTransaction', href: '/docs/api-reference/transactions/evaluate-transaction' },
        ],
      },
    ],
  },
  {
    title: 'SDKs',
    items: [
      { title: 'Overview', href: '/docs/sdks/overview', difficulty: 'beginner', readingTime: 5 },
      { title: 'TypeScript / JavaScript', href: '/docs/sdks/javascript-typescript', difficulty: 'beginner', readingTime: 10 },
      { title: 'Python', href: '/docs/sdks/python', difficulty: 'beginner', readingTime: 10 },
      { title: 'Recommended Libraries', href: '/docs/sdks/recommended-libraries', difficulty: 'beginner', readingTime: 8 },
    ],
  },
  {
    title: 'Resources',
    items: [
      { title: 'FAQ', href: '/docs/resources/faq', difficulty: 'beginner', readingTime: 10 },
      { title: 'Troubleshooting', href: '/docs/resources/troubleshooting', difficulty: 'intermediate', readingTime: 12 },
      { title: 'Glossary', href: '/docs/resources/glossary', difficulty: 'beginner', readingTime: 8 },
      { title: 'Changelog', href: '/docs/resources/changelog', readingTime: 5 },
    ],
  },
]

export function getDocFromSlug(slug: string[]): NavItem | undefined {
  const href = `/docs/${slug.join('/')}`

  for (const section of docsNavigation) {
    for (const item of section.items) {
      if (item.href === href) return item
      if (item.items) {
        for (const subItem of item.items) {
          if (subItem.href === href) return subItem
          if (subItem.items) {
            for (const subSubItem of subItem.items) {
              if (subSubItem.href === href) return subSubItem
            }
          }
        }
      }
    }
  }

  return undefined
}

export function getAllDocSlugs(): string[][] {
  const slugs: string[][] = []

  function collectSlugs(items: NavItem[]) {
    for (const item of items) {
      if (item.href) {
        slugs.push(item.href.replace('/docs/', '').split('/'))
      }
      if (item.items) {
        collectSlugs(item.items)
      }
    }
  }

  for (const section of docsNavigation) {
    collectSlugs(section.items)
  }

  return slugs
}

// Helper to get difficulty color
export function getDifficultyColor(difficulty: Difficulty): { bg: string; text: string; border: string } {
  switch (difficulty) {
    case 'beginner':
      return { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' }
    case 'intermediate':
      return { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' }
    case 'advanced':
      return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' }
  }
}

// Helper to format reading time
export function formatReadingTime(minutes: number): string {
  if (minutes < 1) return '< 1 min read'
  if (minutes === 1) return '1 min read'
  return `${minutes} min read`
}
