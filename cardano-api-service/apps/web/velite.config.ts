import { defineConfig, s } from 'velite'
import rehypeShiki from '@shikijs/rehype'
import remarkGfm from 'remark-gfm'

export default defineConfig({
  root: 'content',
  output: {
    data: '.velite',
    assets: 'public/static',
    base: '/static/',
    name: '[name]-[hash:6].[ext]',
    clean: true,
  },
  collections: {
    docs: {
      name: 'Doc',
      pattern: 'docs/**/*.mdx',
      schema: s.object({
        title: s.string().max(100),
        description: s.string().max(500).optional(),
        slug: s.path(),
        category: s.enum(['getting-started', 'guides', 'api-reference']),
        order: s.number().default(999),
        ogmiosRef: s.string().optional(),
        published: s.boolean().default(true),
        body: s.mdx(),
      }),
    },
  },
  mdx: {
    rehypePlugins: [
      [rehypeShiki, {
        theme: 'github-dark',
        defaultLanguage: 'typescript',
      }],
    ],
    remarkPlugins: [remarkGfm],
  },
})
