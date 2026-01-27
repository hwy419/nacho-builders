import { defineConfig, s } from 'velite'
import rehypeShiki from '@shikijs/rehype'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'

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
        category: s.enum([
          'getting-started',
          'guides',
          'api-reference',
          'sdks',
          'resources',
          'learn',
        ]),
        order: s.number().default(999),
        ogmiosRef: s.string().optional(),
        published: s.boolean().default(true),
        // New fields for enhanced documentation
        difficulty: s.enum(['beginner', 'intermediate', 'advanced']).optional(),
        readingTime: s.number().optional(), // Estimated reading time in minutes
        prerequisites: s.array(s.string()).optional(), // Links to prerequisite docs
        tags: s.array(s.string()).optional(), // For filtering/search
        lastUpdated: s.string().optional(), // ISO date string
        body: s.mdx(),
      }),
    },
  },
  mdx: {
    rehypePlugins: [
      rehypeSlug, // Add IDs to headings for table of contents
      [rehypeShiki, {
        theme: 'github-dark',
        defaultLanguage: 'typescript',
      }],
    ],
    remarkPlugins: [remarkGfm],
  },
})
