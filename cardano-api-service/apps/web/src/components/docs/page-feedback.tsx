"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { ThumbsUp, ThumbsDown, Send, Check, MessageSquare } from "lucide-react"

interface PageFeedbackProps {
  pageSlug: string
  className?: string
}

type FeedbackState = "initial" | "helpful-yes" | "helpful-no" | "submitted"

export function PageFeedback({ pageSlug, className }: PageFeedbackProps) {
  const [state, setState] = useState<FeedbackState>("initial")
  const [feedback, setFeedback] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleHelpfulClick = async (helpful: boolean) => {
    setState(helpful ? "helpful-yes" : "helpful-no")

    // Track the helpful/not helpful vote
    try {
      // In production, send to analytics endpoint
      if (typeof window !== "undefined" && "gtag" in window) {
        (window as typeof window & { gtag: (...args: unknown[]) => void }).gtag("event", "docs_feedback", {
          page_slug: pageSlug,
          helpful: helpful,
        })
      }
    } catch {
      // Silently fail analytics
    }
  }

  const handleSubmitFeedback = async () => {
    if (!feedback.trim()) return

    setIsSubmitting(true)

    try {
      // In production, send to feedback endpoint
      // For now, log and track via analytics
      console.log("Feedback submitted:", { pageSlug, feedback })

      if (typeof window !== "undefined" && "gtag" in window) {
        (window as typeof window & { gtag: (...args: unknown[]) => void }).gtag("event", "docs_feedback_text", {
          page_slug: pageSlug,
          feedback_text: feedback.substring(0, 500), // Truncate for analytics
        })
      }

      setState("submitted")
    } catch {
      // Show error state if needed
    } finally {
      setIsSubmitting(false)
    }
  }

  if (state === "submitted") {
    return (
      <div className={cn("mt-12 pt-8 border-t border-border", className)}>
        <div className="flex items-center gap-3 text-text-secondary">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/10 text-green-400">
            <Check className="h-4 w-4" />
          </div>
          <p>Thanks for your feedback! We use it to improve our documentation.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("mt-12 pt-8 border-t border-border", className)}>
      {state === "initial" && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <p className="text-text-secondary">Was this page helpful?</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleHelpfulClick(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-tertiary text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition-colors"
            >
              <ThumbsUp className="h-4 w-4" />
              Yes
            </button>
            <button
              onClick={() => handleHelpfulClick(false)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-tertiary text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition-colors"
            >
              <ThumbsDown className="h-4 w-4" />
              No
            </button>
          </div>
        </div>
      )}

      {(state === "helpful-yes" || state === "helpful-no") && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full",
                state === "helpful-yes"
                  ? "bg-green-500/10 text-green-400"
                  : "bg-yellow-500/10 text-yellow-400"
              )}
            >
              {state === "helpful-yes" ? (
                <ThumbsUp className="h-4 w-4" />
              ) : (
                <ThumbsDown className="h-4 w-4" />
              )}
            </div>
            <p className="text-text-secondary">
              {state === "helpful-yes"
                ? "Glad this helped! Any other feedback?"
                : "Sorry to hear that. How can we improve this page?"}
            </p>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={
                  state === "helpful-yes"
                    ? "Share any additional thoughts (optional)..."
                    : "What was unclear or missing? What would help?"
                }
                className="w-full h-24 pl-10 pr-4 py-3 rounded-lg bg-bg-tertiary text-text-primary placeholder:text-text-muted border border-border focus:border-accent focus:ring-1 focus:ring-accent resize-none"
                maxLength={1000}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setState("submitted")}
              className="text-sm text-text-muted hover:text-text-secondary"
            >
              Skip
            </button>
            <button
              onClick={handleSubmitFeedback}
              disabled={isSubmitting || !feedback.trim()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                feedback.trim()
                  ? "bg-accent text-white hover:bg-accent-hover"
                  : "bg-bg-tertiary text-text-muted cursor-not-allowed"
              )}
            >
              <Send className="h-4 w-4" />
              {isSubmitting ? "Sending..." : "Send Feedback"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
