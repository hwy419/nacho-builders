"use client"

import { cn } from "@/lib/utils"
import { useDocs, Network, NETWORK_CONFIG } from "@/lib/docs/context"
import { Globe, TestTube } from "lucide-react"

interface NetworkSwitcherProps {
  className?: string
  variant?: "pill" | "dropdown" | "inline"
}

export function NetworkSwitcher({
  className,
  variant = "pill",
}: NetworkSwitcherProps) {
  const { network, setNetwork } = useDocs()

  if (variant === "pill") {
    return (
      <div
        className={cn(
          "inline-flex items-center p-1 rounded-lg bg-bg-tertiary border border-border",
          className
        )}
      >
        <NetworkButton
          network="mainnet"
          isActive={network === "mainnet"}
          onClick={() => setNetwork("mainnet")}
        />
        <NetworkButton
          network="preprod"
          isActive={network === "preprod"}
          onClick={() => setNetwork("preprod")}
        />
      </div>
    )
  }

  if (variant === "inline") {
    return (
      <div className={cn("flex items-center gap-2 text-sm", className)}>
        <span className="text-text-muted">Network:</span>
        <button
          onClick={() => setNetwork(network === "mainnet" ? "preprod" : "mainnet")}
          className="flex items-center gap-1.5 text-accent hover:text-accent-hover"
        >
          {network === "mainnet" ? (
            <Globe className="h-3.5 w-3.5" />
          ) : (
            <TestTube className="h-3.5 w-3.5" />
          )}
          {NETWORK_CONFIG[network].name}
        </button>
      </div>
    )
  }

  // Dropdown variant
  return (
    <div className={cn("relative", className)}>
      <select
        value={network}
        onChange={(e) => setNetwork(e.target.value as Network)}
        className="appearance-none px-3 py-1.5 pr-8 rounded-lg bg-bg-tertiary border border-border text-text-primary text-sm cursor-pointer hover:border-accent focus:border-accent focus:ring-1 focus:ring-accent"
      >
        <option value="mainnet">Mainnet</option>
        <option value="preprod">Preprod Testnet</option>
      </select>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        {network === "mainnet" ? (
          <Globe className="h-4 w-4 text-text-muted" />
        ) : (
          <TestTube className="h-4 w-4 text-text-muted" />
        )}
      </div>
    </div>
  )
}

interface NetworkButtonProps {
  network: Network
  isActive: boolean
  onClick: () => void
}

function NetworkButton({ network, isActive, onClick }: NetworkButtonProps) {
  const Icon = network === "mainnet" ? Globe : TestTube
  const label = NETWORK_CONFIG[network].name

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
        isActive
          ? "bg-accent text-white"
          : "text-text-secondary hover:text-text-primary"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

// Hook to get network-aware code examples
export function useNetworkExample(mainnetCode: string, preprodCode: string): string {
  const { network } = useDocs()
  return network === "mainnet" ? mainnetCode : preprodCode
}

// Component to render network-specific content
interface NetworkContentProps {
  mainnet: React.ReactNode
  preprod: React.ReactNode
}

export function NetworkContent({ mainnet, preprod }: NetworkContentProps) {
  const { network } = useDocs()
  return <>{network === "mainnet" ? mainnet : preprod}</>
}

// Display current network indicator (for playgrounds/headers)
interface NetworkIndicatorProps {
  className?: string
}

export function NetworkIndicator({ className }: NetworkIndicatorProps) {
  const { network } = useDocs()
  const config = NETWORK_CONFIG[network]
  const Icon = network === "mainnet" ? Globe : TestTube

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs",
        network === "mainnet"
          ? "bg-green-500/10 text-green-400 border border-green-500/30"
          : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30",
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {config.name}
    </div>
  )
}
