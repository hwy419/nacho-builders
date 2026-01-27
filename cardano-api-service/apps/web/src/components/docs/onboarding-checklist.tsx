"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { useDocs, OnboardingStep } from "@/lib/docs/context"
import { Check, Circle, ChevronDown, ChevronUp, Rocket, X } from "lucide-react"

interface OnboardingChecklistProps {
  className?: string
  variant?: "inline" | "floating"
}

export function OnboardingChecklist({
  className,
  variant = "inline",
}: OnboardingChecklistProps) {
  const { onboardingProgress, markStepComplete, isStepComplete } = useDocs()
  const [isExpanded, setIsExpanded] = useState(true)
  const [isDismissed, setIsDismissed] = useState(false)

  const completedCount = onboardingProgress.filter((s) => s.completed).length
  const totalCount = onboardingProgress.length
  const progress = (completedCount / totalCount) * 100
  const isComplete = completedCount === totalCount

  // Check for dismissed state on mount
  useEffect(() => {
    const dismissed = localStorage.getItem("nacho-onboarding-dismissed")
    if (dismissed === "true") {
      setIsDismissed(true)
    }
  }, [])

  const handleDismiss = () => {
    setIsDismissed(true)
    localStorage.setItem("nacho-onboarding-dismissed", "true")
  }

  const handleReset = () => {
    setIsDismissed(false)
    localStorage.removeItem("nacho-onboarding-dismissed")
  }

  if (isDismissed && !isComplete) {
    if (variant === "floating") {
      return (
        <button
          onClick={handleReset}
          className="fixed bottom-4 right-4 z-40 p-3 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
          title="Show getting started checklist"
        >
          <Rocket className="h-5 w-5" />
        </button>
      )
    }
    return null
  }

  if (variant === "floating") {
    return (
      <div
        className={cn(
          "fixed bottom-4 right-4 z-40 w-80 bg-bg-secondary border border-border rounded-xl shadow-xl",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-text-primary font-medium"
          >
            <Rocket className="h-4 w-4 text-accent" />
            Getting Started
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-text-muted" />
            ) : (
              <ChevronUp className="h-4 w-4 text-text-muted" />
            )}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">
              {completedCount}/{totalCount}
            </span>
            {!isComplete && (
              <button
                onClick={handleDismiss}
                className="text-text-muted hover:text-text-secondary"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-bg-tertiary">
          <div
            className="h-full bg-accent transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Steps */}
        {isExpanded && (
          <div className="p-4 space-y-3">
            {onboardingProgress.map((step) => (
              <OnboardingStepItem
                key={step.id}
                step={step}
                onComplete={() => markStepComplete(step.id)}
              />
            ))}

            {isComplete && (
              <div className="pt-2 text-center text-text-secondary text-sm">
                You&apos;re all set! Happy building.
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Inline variant (for quickstart page)
  return (
    <div
      className={cn(
        "p-6 bg-bg-secondary border border-border rounded-xl",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
          <Rocket className="h-5 w-5 text-accent" />
          Your Progress
        </h3>
        <span className="text-sm text-text-muted">
          {completedCount} of {totalCount} complete
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-bg-tertiary rounded-full mb-6">
        <div
          className="h-full bg-accent rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {onboardingProgress.map((step) => (
          <OnboardingStepItem
            key={step.id}
            step={step}
            onComplete={() => markStepComplete(step.id)}
            variant="card"
          />
        ))}
      </div>

      {isComplete && (
        <div className="mt-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
          <p className="text-green-400 font-medium">
            Congratulations! You&apos;ve completed all the getting started steps.
          </p>
          <Link
            href="/docs/guides/querying-utxos"
            className="inline-block mt-2 text-sm text-accent hover:text-accent-hover"
          >
            Continue to advanced guides &rarr;
          </Link>
        </div>
      )}
    </div>
  )
}

interface OnboardingStepItemProps {
  step: OnboardingStep
  onComplete: () => void
  variant?: "list" | "card"
}

function OnboardingStepItem({
  step,
  onComplete,
  variant = "list",
}: OnboardingStepItemProps) {
  if (variant === "card") {
    return (
      <div
        className={cn(
          "p-4 rounded-lg border transition-colors",
          step.completed
            ? "bg-green-500/5 border-green-500/30"
            : "bg-bg-tertiary border-border hover:border-accent/50"
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
              step.completed
                ? "bg-green-500/20 text-green-400"
                : "bg-bg-secondary text-text-muted"
            )}
          >
            {step.completed ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Circle className="h-3.5 w-3.5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "font-medium",
                step.completed ? "text-text-muted" : "text-text-primary"
              )}
            >
              {step.title}
            </p>
            <p className="text-sm text-text-muted mt-0.5">
              {step.description}
            </p>
            {!step.completed && step.href && (
              <Link
                href={step.href}
                onClick={onComplete}
                className="inline-block mt-2 text-sm text-accent hover:text-accent-hover"
              >
                Get started &rarr;
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  // List variant (for floating)
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5",
          step.completed
            ? "bg-green-500/20 text-green-400"
            : "bg-bg-tertiary text-text-muted"
        )}
      >
        {step.completed ? (
          <Check className="h-3 w-3" />
        ) : (
          <Circle className="h-3 w-3" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        {step.completed ? (
          <p className="text-sm text-text-muted line-through">{step.title}</p>
        ) : step.href ? (
          <Link
            href={step.href}
            onClick={onComplete}
            className="text-sm text-text-primary hover:text-accent"
          >
            {step.title}
          </Link>
        ) : (
          <p className="text-sm text-text-primary">{step.title}</p>
        )}
        <p className="text-xs text-text-muted">{step.description}</p>
      </div>
    </div>
  )
}
