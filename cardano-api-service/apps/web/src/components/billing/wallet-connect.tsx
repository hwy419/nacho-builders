"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SUPPORTED_WALLETS, getAvailableWallets, connectWallet, type ConnectedWallet } from "@/lib/cardano/wallet"
import { Wallet } from "lucide-react"

interface WalletConnectProps {
  onConnected: (wallet: ConnectedWallet) => void
}

export function WalletConnect({ onConnected }: WalletConnectProps) {
  const [availableWallets, setAvailableWallets] = useState<string[]>([])
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAvailableWallets().then(setAvailableWallets)
  }, [])

  const handleConnect = async (walletId: string) => {
    setConnecting(walletId)
    setError(null)

    try {
      const wallet = await connectWallet(walletId)
      
      if (wallet) {
        onConnected(wallet)
      } else {
        setError(`Failed to connect to ${walletId}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet")
    } finally {
      setConnecting(null)
    }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div className="text-center space-y-2">
          <Wallet className="w-12 h-12 mx-auto text-accent" />
          <h3 className="text-xl font-semibold">Connect Your Wallet</h3>
          <p className="text-text-secondary text-sm">
            Choose a Cardano wallet to complete your purchase
          </p>
        </div>

        {error && (
          <div className="p-4 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {SUPPORTED_WALLETS.map((wallet) => {
            const isAvailable = availableWallets.includes(wallet.id)
            const isConnecting = connecting === wallet.id

            return (
              <Button
                key={wallet.id}
                variant={isAvailable ? "secondary" : "ghost"}
                className="h-20 flex flex-col items-center justify-center gap-2"
                onClick={() => handleConnect(wallet.id)}
                disabled={!isAvailable || connecting !== null}
              >
                <span className="text-2xl">{wallet.icon}</span>
                <span className="text-sm">{wallet.name}</span>
                {isConnecting && (
                  <span className="text-xs text-text-muted">Connecting...</span>
                )}
                {!isAvailable && (
                  <span className="text-xs text-text-muted">Not Installed</span>
                )}
              </Button>
            )
          })}
        </div>

        <p className="text-xs text-text-muted text-center">
          Don't have a wallet?{" "}
          <a 
            href="https://namiwallet.io" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-accent hover:text-accent-hover"
          >
            Get Nami Wallet
          </a>
        </p>
      </CardContent>
    </Card>
  )
}






