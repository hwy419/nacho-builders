"use client"

import { cn } from "@/lib/utils"
import { Difficulty, getDifficultyColor, formatReadingTime } from "@/lib/docs/navigation"
import { Clock, Sparkles, Zap, Flame } from "lucide-react"

interface DifficultyBadgeProps {
  difficulty: Difficulty
  readingTime?: number
  showReadingTime?: boolean
  className?: string
}

export function DifficultyBadge({
  difficulty,
  readingTime,
  showReadingTime = true,
  className,
}: DifficultyBadgeProps) {
  const colors = getDifficultyColor(difficulty)

  const DifficultyIcon = {
    beginner: Sparkles,
    intermediate: Zap,
    advanced: Flame,
  }[difficulty]

  const label = {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced",
  }[difficulty]

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
          colors.bg,
          colors.text,
          colors.border
        )}
      >
        <DifficultyIcon className="h-3 w-3" />
        {label}
      </span>
      {showReadingTime && readingTime && (
        <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
          <Clock className="h-3 w-3" />
          {formatReadingTime(readingTime)}
        </span>
      )}
    </div>
  )
}

// Compact version for navigation/lists
interface DifficultyDotProps {
  difficulty: Difficulty
  className?: string
}

export function DifficultyDot({ difficulty, className }: DifficultyDotProps) {
  const dotColors = {
    beginner: "bg-green-400",
    intermediate: "bg-yellow-400",
    advanced: "bg-red-400",
  }[difficulty]

  return (
    <span
      className={cn("inline-block w-1.5 h-1.5 rounded-full", dotColors, className)}
      title={difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
    />
  )
}

// Page header with difficulty and metadata
interface PageHeaderProps {
  title: string
  description?: string
  difficulty?: Difficulty
  readingTime?: number
  lastUpdated?: string
  editUrl?: string
}

export function DocsPageHeader({
  title,
  description,
  difficulty,
  readingTime,
  lastUpdated,
  editUrl,
}: PageHeaderProps) {
  return (
    <header className="mb-8 pb-6 border-b border-border">
      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        {difficulty && (
          <DifficultyBadge
            difficulty={difficulty}
            readingTime={readingTime}
            showReadingTime={!!readingTime}
          />
        )}
        {lastUpdated && (
          <span className="text-xs text-text-muted">
            Updated {new Date(lastUpdated).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
        {editUrl && (
          <a
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-text-muted hover:text-accent ml-auto"
          >
            Edit on GitHub
          </a>
        )}
      </div>

      {/* Title */}
      <h1 className="text-4xl font-bold tracking-tight text-text-primary">
        {title}
      </h1>

      {/* Description */}
      {description && (
        <p className="mt-3 text-lg text-text-secondary leading-relaxed">
          {description}
        </p>
      )}
    </header>
  )
}
