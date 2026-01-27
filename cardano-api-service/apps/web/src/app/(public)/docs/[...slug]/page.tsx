import { notFound } from "next/navigation"
import { Metadata } from "next"
import { docs } from "#content"
import { DocsPageContent } from "@/components/docs/docs-page-content"
import { getDocFromSlug, Difficulty } from "@/lib/docs/navigation"

interface DocPageProps {
  params: Promise<{
    slug: string[]
  }>
}

function getDocFromSlugPath(slug: string[]) {
  const slugPath = slug.join("/")
  return docs.find((doc) => doc.slug === `docs/${slugPath}`)
}

export async function generateMetadata({ params }: DocPageProps): Promise<Metadata> {
  const { slug } = await params
  const doc = getDocFromSlugPath(slug)

  if (!doc) {
    return {
      title: "Not Found",
    }
  }

  return {
    title: doc.title,
    description: doc.description,
  }
}

export async function generateStaticParams() {
  return docs.map((doc) => ({
    slug: doc.slug.replace("docs/", "").split("/"),
  }))
}

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params
  const doc = getDocFromSlugPath(slug)

  if (!doc) {
    notFound()
  }

  // Get navigation metadata (difficulty, reading time) from navigation.ts
  const navItem = getDocFromSlug(slug)

  return (
    <DocsPageContent
      title={doc.title}
      description={doc.description}
      body={doc.body}
      slug={doc.slug}
      difficulty={(doc.difficulty || navItem?.difficulty) as Difficulty | undefined}
      readingTime={doc.readingTime || navItem?.readingTime}
      lastUpdated={doc.lastUpdated}
    />
  )
}
