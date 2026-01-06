"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Play, Loader2, Clock, Key } from "lucide-react"

interface APIPlaygroundProps {
  method: string
  defaultParams?: Record<string, unknown>
}

const STORAGE_KEY = "nacho-playground-apikey"

export function APIPlayground({ method, defaultParams = {} }: APIPlaygroundProps) {
  const { data: session, status } = useSession()
  const [apiKey, setApiKey] = useState<string>("")
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [request, setRequest] = useState(
    JSON.stringify(
      {
        jsonrpc: "2.0",
        method,
        ...(Object.keys(defaultParams).length > 0 && { params: defaultParams }),
      },
      null,
      2
    )
  )
  const [response, setResponse] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [responseTime, setResponseTime] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load saved API key from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      setApiKey(saved)
    }
  }, [])

  const saveApiKey = (key: string) => {
    setApiKey(key)
    localStorage.setItem(STORAGE_KEY, key)
    setShowKeyInput(false)
  }

  const sendRequest = async () => {
    if (!apiKey) {
      setShowKeyInput(true)
      setError("Please enter your API key first")
      return
    }

    setIsLoading(true)
    setError(null)
    setResponse("")
    setResponseTime(null)

    const startTime = performance.now()

    try {
      const parsedRequest = JSON.parse(request)

      const res = await fetch("https://api.nacho.builders/v1/ogmios", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify(parsedRequest),
      })

      const endTime = performance.now()
      setResponseTime(Math.round(endTime - startTime))

      const data = await res.json()
      setResponse(JSON.stringify(data, null, 2))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed")
    } finally {
      setIsLoading(false)
    }
  }

  // Not logged in
  if (status === "loading") {
    return (
      <div className="my-6 p-6 bg-bg-secondary border border-border rounded-lg">
        <div className="flex items-center justify-center gap-2 text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="my-6 p-6 bg-bg-secondary border border-accent/30 rounded-lg text-center">
        <h4 className="text-lg font-semibold text-text-primary mb-2">
          Try It Live
        </h4>
        <p className="text-text-secondary mb-4">
          Sign in to test this API method with your free API key
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
        >
          Sign In to Try
        </Link>
      </div>
    )
  }

  return (
    <div className="my-6 border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-bg-tertiary border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">
            API Playground
          </span>
          <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded">
            Live
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* API Key indicator */}
          <button
            onClick={() => setShowKeyInput(!showKeyInput)}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors",
              apiKey
                ? "text-success bg-success/10"
                : "text-warning bg-warning/10"
            )}
          >
            <Key className="h-3 w-3" />
            {apiKey ? `${apiKey.slice(0, 12)}...` : "Set API Key"}
          </button>
          {responseTime !== null && (
            <div className="flex items-center gap-1 text-xs text-text-muted">
              <Clock className="h-3 w-3" />
              {responseTime}ms
            </div>
          )}
          <button
            onClick={sendRequest}
            disabled={isLoading}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors",
              "bg-accent hover:bg-accent-hover text-white",
              isLoading && "opacity-50 cursor-not-allowed"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run
          </button>
        </div>
      </div>

      {/* API Key Input (collapsible) */}
      {showKeyInput && (
        <div className="px-4 py-3 bg-bg-secondary border-b border-border">
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key (napi_...)"
              className={cn(
                "flex-1 px-3 py-2 font-mono text-sm rounded-md",
                "bg-bg-primary border border-border",
                "focus:outline-none focus:ring-2 focus:ring-accent/50",
                "text-text-primary placeholder:text-text-muted"
              )}
            />
            <button
              onClick={() => saveApiKey(apiKey)}
              className="px-3 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-md transition-colors"
            >
              Save
            </button>
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Get your API key from <Link href="/api-keys" className="text-accent hover:underline">API Keys</Link>.
            Your key is stored locally in your browser.
          </p>
        </div>
      )}

      {/* Request Editor */}
      <div className="grid md:grid-cols-2 divide-x divide-border">
        <div className="p-4">
          <div className="text-xs text-text-muted mb-2 uppercase tracking-wide">
            Request
          </div>
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            className={cn(
              "w-full h-48 p-3 font-mono text-sm rounded-lg resize-none",
              "bg-bg-primary border border-border",
              "focus:outline-none focus:ring-2 focus:ring-accent/50",
              "text-text-primary placeholder:text-text-muted"
            )}
            spellCheck={false}
          />
        </div>

        {/* Response */}
        <div className="p-4 bg-bg-primary/50">
          <div className="text-xs text-text-muted mb-2 uppercase tracking-wide">
            Response
          </div>
          <div className="h-48 overflow-auto">
            {error ? (
              <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
                {error}
              </div>
            ) : response ? (
              <pre className="p-3 bg-bg-tertiary rounded-lg text-sm font-mono text-text-primary whitespace-pre overflow-x-auto">
                {response}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">
                Click "Run" to send the request
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-bg-tertiary border-t border-border text-xs text-text-muted">
        Endpoint: api.nacho.builders/v1/ogmios • Key stored locally in browser
      </div>
    </div>
  )
}
