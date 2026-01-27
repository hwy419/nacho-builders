"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"

export type Network = "mainnet" | "preprod"
export type CodeLanguage = "typescript" | "javascript" | "python" | "go" | "rust" | "curl"

interface DocsContextType {
  // Network selection (affects code examples)
  network: Network
  setNetwork: (network: Network) => void

  // Code language preference
  language: CodeLanguage
  setLanguage: (language: CodeLanguage) => void

  // API key (auto-injected into playgrounds)
  apiKey: string | null
  setApiKey: (key: string | null) => void

  // Onboarding progress tracking
  onboardingProgress: OnboardingStep[]
  markStepComplete: (stepId: string) => void
  isStepComplete: (stepId: string) => boolean
}

export interface OnboardingStep {
  id: string
  title: string
  description: string
  href?: string
  completed: boolean
}

const DEFAULT_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "create-account",
    title: "Create Account",
    description: "Sign up for a Nacho API account",
    href: "/login",
    completed: false,
  },
  {
    id: "get-api-key",
    title: "Get API Key",
    description: "Generate your first API key",
    href: "/api-keys/new",
    completed: false,
  },
  {
    id: "first-request",
    title: "Make First Request",
    description: "Query the blockchain",
    href: "/docs/getting-started/first-request",
    completed: false,
  },
  {
    id: "explore-docs",
    title: "Explore Documentation",
    description: "Learn about advanced features",
    href: "/docs/guides/querying-utxos",
    completed: false,
  },
]

const DocsContext = createContext<DocsContextType | undefined>(undefined)

const STORAGE_KEYS = {
  network: "nacho-docs-network",
  language: "nacho-docs-language",
  apiKey: "nacho-api-key",
  onboarding: "nacho-onboarding-progress",
}

export function DocsProvider({ children }: { children: ReactNode }) {
  const [network, setNetworkState] = useState<Network>("mainnet")
  const [language, setLanguageState] = useState<CodeLanguage>("typescript")
  const [apiKey, setApiKeyState] = useState<string | null>(null)
  const [onboardingProgress, setOnboardingProgress] = useState<OnboardingStep[]>(DEFAULT_ONBOARDING_STEPS)
  const [isHydrated, setIsHydrated] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    const storedNetwork = localStorage.getItem(STORAGE_KEYS.network) as Network | null
    const storedLanguage = localStorage.getItem(STORAGE_KEYS.language) as CodeLanguage | null
    const storedApiKey = localStorage.getItem(STORAGE_KEYS.apiKey)
    const storedOnboarding = localStorage.getItem(STORAGE_KEYS.onboarding)

    if (storedNetwork) setNetworkState(storedNetwork)
    if (storedLanguage) setLanguageState(storedLanguage)
    if (storedApiKey) setApiKeyState(storedApiKey)
    if (storedOnboarding) {
      try {
        const parsed = JSON.parse(storedOnboarding) as OnboardingStep[]
        // Merge with defaults to handle new steps
        const merged = DEFAULT_ONBOARDING_STEPS.map((defaultStep) => {
          const stored = parsed.find((s) => s.id === defaultStep.id)
          return stored ? { ...defaultStep, completed: stored.completed } : defaultStep
        })
        setOnboardingProgress(merged)
      } catch {
        // Invalid JSON, use defaults
      }
    }
    setIsHydrated(true)
  }, [])

  // Persist changes to localStorage
  const setNetwork = (newNetwork: Network) => {
    setNetworkState(newNetwork)
    localStorage.setItem(STORAGE_KEYS.network, newNetwork)
    // Dispatch custom event for components that need to react
    window.dispatchEvent(new CustomEvent("nacho-network-change", { detail: newNetwork }))
  }

  const setLanguage = (newLanguage: CodeLanguage) => {
    setLanguageState(newLanguage)
    localStorage.setItem(STORAGE_KEYS.language, newLanguage)
    window.dispatchEvent(new CustomEvent("nacho-language-change", { detail: newLanguage }))
  }

  const setApiKey = (key: string | null) => {
    setApiKeyState(key)
    if (key) {
      localStorage.setItem(STORAGE_KEYS.apiKey, key)
    } else {
      localStorage.removeItem(STORAGE_KEYS.apiKey)
    }
  }

  const markStepComplete = (stepId: string) => {
    setOnboardingProgress((prev) => {
      const updated = prev.map((step) =>
        step.id === stepId ? { ...step, completed: true } : step
      )
      localStorage.setItem(STORAGE_KEYS.onboarding, JSON.stringify(updated))
      return updated
    })
  }

  const isStepComplete = (stepId: string) => {
    return onboardingProgress.find((s) => s.id === stepId)?.completed ?? false
  }

  // Prevent hydration mismatch by not rendering until client-side
  if (!isHydrated) {
    return <>{children}</>
  }

  return (
    <DocsContext.Provider
      value={{
        network,
        setNetwork,
        language,
        setLanguage,
        apiKey,
        setApiKey,
        onboardingProgress,
        markStepComplete,
        isStepComplete,
      }}
    >
      {children}
    </DocsContext.Provider>
  )
}

export function useDocs() {
  const context = useContext(DocsContext)
  if (context === undefined) {
    // Return default values for SSR/static generation
    // Components should handle this gracefully
    return {
      network: "mainnet" as Network,
      setNetwork: () => {},
      language: "typescript" as CodeLanguage,
      setLanguage: () => {},
      apiKey: null,
      setApiKey: () => {},
      onboardingProgress: DEFAULT_ONBOARDING_STEPS,
      markStepComplete: () => {},
      isStepComplete: () => false,
    }
  }
  return context
}

// Safe hook that indicates whether we're in a DocsProvider
export function useDocsContext() {
  const context = useContext(DocsContext)
  return {
    isReady: context !== undefined,
    ...useDocs(),
  }
}

// Hook for getting network-specific values
export function useNetworkValue<T>(mainnetValue: T, preprodValue: T): T {
  const { network } = useDocs()
  return network === "mainnet" ? mainnetValue : preprodValue
}

// Network configuration constants
export const NETWORK_CONFIG = {
  mainnet: {
    name: "Mainnet",
    apiBase: "https://api.nacho.builders/v1",
    explorerUrl: "https://cardanoscan.io",
    exampleAddress: "addr1qy2kp7ux2qx7g9h6m8rv4dpuqwfcv2t4a8h5yfjhgpvqc8u5m4c8v3q2z8y7w6v5x4c3b2n1m0k9j8h7g6f5d4s3a2p1q0r",
    exampleTxHash: "a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9",
  },
  preprod: {
    name: "Preprod",
    apiBase: "https://api.nacho.builders/v1", // Same endpoint, different network param
    explorerUrl: "https://preprod.cardanoscan.io",
    exampleAddress: "addr_test1qz2kp7ux2qx7g9h6m8rv4dpuqwfcv2t4a8h5yfjhgpvqc8u5m4c8v3q2z8y7w6v5x4c3b2n1m0k9j8h7g6f5d4s3a2p1test",
    exampleTxHash: "test_a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9",
  },
} as const
