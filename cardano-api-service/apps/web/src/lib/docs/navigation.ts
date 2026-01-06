export interface NavItem {
  title: string
  href?: string
  items?: NavItem[]
  isNew?: boolean
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const docsNavigation: NavSection[] = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Introduction', href: '/docs/getting-started/introduction' },
      { title: 'Quickstart', href: '/docs/getting-started/quickstart' },
      { title: 'Authentication', href: '/docs/getting-started/authentication' },
      { title: 'First Request', href: '/docs/getting-started/first-request' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { title: 'Querying UTxOs', href: '/docs/guides/querying-utxos' },
      { title: 'Submitting Transactions', href: '/docs/guides/submitting-transactions' },
      { title: 'Chain Synchronization', href: '/docs/guides/chain-synchronization' },
      { title: 'WebSocket Connections', href: '/docs/guides/websocket-connections' },
      { title: 'Error Handling', href: '/docs/guides/error-handling' },
    ],
  },
  {
    title: 'API Reference',
    items: [
      { title: 'Overview', href: '/docs/api-reference/overview' },
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

  for (const section of docsNavigation) {
    for (const item of section.items) {
      if (item.href) {
        slugs.push(item.href.replace('/docs/', '').split('/'))
      }
      if (item.items) {
        for (const subItem of item.items) {
          if (subItem.href) {
            slugs.push(subItem.href.replace('/docs/', '').split('/'))
          }
        }
      }
    }
  }

  return slugs
}
