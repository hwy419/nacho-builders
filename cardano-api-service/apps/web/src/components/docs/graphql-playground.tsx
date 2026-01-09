"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Play, Loader2, Clock, Key, ChevronDown } from "lucide-react"

interface GraphQLPlaygroundProps {
  defaultQuery?: string
  defaultVariables?: string
}

const STORAGE_KEY = "nacho-playground-apikey"

const EXAMPLE_QUERIES = {
  "Latest Block": {
    query: `query LatestBlock {
  block(limit: 1, order_by: {id: desc}) {
    block_no
    epoch_no
    slot_no
    time
    tx_count
    hash
  }
}`,
    variables: "",
  },
  "Block by Number": {
    query: `query BlockByNumber($blockNo: Int!) {
  block(where: {block_no: {_eq: $blockNo}}) {
    block_no
    epoch_no
    slot_no
    time
    tx_count
    hash
    size
  }
}`,
    variables: `{
  "blockNo": 12880000
}`,
  },
  "Current Epoch": {
    query: `query CurrentEpoch {
  epoch(limit: 1, order_by: {no: desc}) {
    no
    start_time
    end_time
    blk_count
    tx_count
    fees
    out_sum
  }
}`,
    variables: "",
  },
  "Stake Pools": {
    query: `query StakePools($limit: Int) {
  pool_update(limit: $limit, order_by: {id: desc}) {
    id
    pledge
    fixed_cost
    margin
    active_epoch_no
    vrf_key_hash
  }
}`,
    variables: `{
  "limit": 5
}`,
  },
  "Recent Transactions": {
    query: `query RecentTransactions($limit: Int) {
  tx(limit: $limit, order_by: {id: desc}) {
    hash
    block_index
    fee
    size
    valid_contract
    out_sum
  }
}`,
    variables: `{
  "limit": 10
}`,
  },
}

type ExampleQueryKey = keyof typeof EXAMPLE_QUERIES

export function GraphQLPlayground({
  defaultQuery = EXAMPLE_QUERIES["Latest Block"].query,
  defaultVariables = "",
}: GraphQLPlaygroundProps) {
  const { data: session, status } = useSession()
  const [apiKey, setApiKey] = useState<string>("")
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [query, setQuery] = useState(defaultQuery)
  const [variables, setVariables] = useState(defaultVariables)
  const [network, setNetwork] = useState<"mainnet" | "preprod">("mainnet")
  const [showExamples, setShowExamples] = useState(false)
  const [response, setResponse] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [responseTime, setResponseTime] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Check if the current query uses variables (contains $varName)
  const queryHasVariables = /\$\w+/.test(query)

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

  const loadExample = (name: ExampleQueryKey) => {
    setQuery(EXAMPLE_QUERIES[name].query)
    setVariables(EXAMPLE_QUERIES[name].variables)
    setShowExamples(false)
    setResponse("")
    setError(null)
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
      const endpoint =
        network === "preprod"
          ? "https://api.nacho.builders/v1/preprod/graphql"
          : "https://api.nacho.builders/v1/graphql"

      const body: { query: string; variables?: Record<string, unknown> } = {
        query,
      }

      // Only include variables if the query defines them
      if (variables.trim() && queryHasVariables) {
        try {
          body.variables = JSON.parse(variables)
        } catch {
          setError("Invalid JSON in variables")
          setIsLoading(false)
          return
        }
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify(body),
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
          GraphQL Playground
        </h4>
        <p className="text-text-secondary mb-4">
          Sign in to test GraphQL queries with your API key
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
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-text-primary">
            GraphQL Playground
          </span>
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value as "mainnet" | "preprod")}
            className={cn(
              "text-xs px-2 py-1 rounded-md",
              "bg-bg-secondary border border-border",
              "text-text-primary",
              "focus:outline-none focus:ring-2 focus:ring-accent/50"
            )}
          >
            <option value="mainnet">Mainnet</option>
            <option value="preprod">Preprod</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          {/* Example selector */}
          <div className="relative">
            <button
              onClick={() => setShowExamples(!showExamples)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs rounded-md",
                "bg-bg-secondary border border-border text-text-secondary",
                "hover:bg-bg-primary transition-colors"
              )}
            >
              Examples
              <ChevronDown className="h-3 w-3" />
            </button>
            {showExamples && (
              <div className="absolute right-0 mt-1 w-48 py-1 bg-bg-secondary border border-border rounded-md shadow-lg z-10">
                {(Object.keys(EXAMPLE_QUERIES) as ExampleQueryKey[]).map(
                  (name) => (
                    <button
                      key={name}
                      onClick={() => loadExample(name)}
                      className="w-full px-3 py-1.5 text-left text-sm text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors"
                    >
                      {name}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
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
            Get your API key from{" "}
            <Link href="/api-keys" className="text-accent hover:underline">
              API Keys
            </Link>
            . Your key is stored locally in your browser.
          </p>
        </div>
      )}

      {/* Query Editor */}
      <div className="grid md:grid-cols-2 divide-x divide-border">
        <div className="p-4">
          <div className="text-xs text-text-muted mb-2 uppercase tracking-wide">
            Query
          </div>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={cn(
              "w-full h-48 p-3 font-mono text-sm rounded-lg resize-none",
              "bg-bg-primary border border-border",
              "focus:outline-none focus:ring-2 focus:ring-accent/50",
              "text-text-primary placeholder:text-text-muted"
            )}
            spellCheck={false}
            placeholder="Enter your GraphQL query..."
          />
          <div className="mt-3">
            <div className="text-xs text-text-muted mb-2 uppercase tracking-wide">
              Variables (JSON)
            </div>
            {queryHasVariables ? (
              <textarea
                value={variables}
                onChange={(e) => setVariables(e.target.value)}
                className={cn(
                  "w-full h-20 p-3 font-mono text-sm rounded-lg resize-none",
                  "bg-bg-primary border border-border",
                  "focus:outline-none focus:ring-2 focus:ring-accent/50",
                  "text-text-primary placeholder:text-text-muted"
                )}
                spellCheck={false}
                placeholder='{"variableName": "value"}'
              />
            ) : (
              <div className="w-full h-20 p-3 rounded-lg bg-bg-tertiary border border-border/50 flex items-center justify-center">
                <span className="text-xs text-text-muted">
                  This query does not use variables
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Response */}
        <div className="p-4 bg-bg-primary/50">
          <div className="text-xs text-text-muted mb-2 uppercase tracking-wide">
            Response
          </div>
          <div className="h-72 overflow-auto">
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
                Click &quot;Run&quot; to execute the query
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-bg-tertiary border-t border-border text-xs text-text-muted">
        Endpoint: api.nacho.builders/v1/{network === "preprod" ? "preprod/" : ""}
        graphql
      </div>
    </div>
  )
}
