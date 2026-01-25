"use client"

import { useState, useEffect, useCallback } from "react"

// Wallet types
interface WalletApi {
  getNetworkId(): Promise<number>
  getRewardAddresses(): Promise<string[]>
  getUsedAddresses(): Promise<string[]>
  signTx(tx: string, partialSign: boolean): Promise<string>
  submitTx(tx: string): Promise<string>
}

interface DetectedWallet {
  name: string
  icon: string
  apiVersion: string
  enable(): Promise<WalletApi>
}

// Known wallet configurations
const KNOWN_WALLETS: Record<string, { displayName: string; icon: string; url: string }> = {
  eternl: {
    displayName: "Eternl",
    icon: "/wallets/eternl.png",
    url: "https://eternl.io",
  },
  lace: {
    displayName: "Lace",
    icon: "/wallets/lace.png",
    url: "https://www.lace.io",
  },
  yoroi: {
    displayName: "Yoroi",
    icon: "/wallets/yoroi.png",
    url: "https://yoroi-wallet.com",
  },
  nami: {
    displayName: "Nami",
    icon: "/wallets/nami.png",
    url: "https://namiwallet.io",
  },
  flint: {
    displayName: "Flint",
    icon: "/wallets/flint.png",
    url: "https://flint-wallet.com",
  },
  gerowallet: {
    displayName: "Gero",
    icon: "/wallets/gero.png",
    url: "https://gerowallet.io",
  },
  typhoncip30: {
    displayName: "Typhon",
    icon: "/wallets/typhon.png",
    url: "https://typhonwallet.io",
  },
  nufi: {
    displayName: "NuFi",
    icon: "/wallets/nufi.png",
    url: "https://nu.fi",
  },
}

// NACHO Pool ID
const NACHO_POOL_ID = "pool1dhugawja82wkmrq0lhd24uyrhm02v7grdhnren9r2qgujsh5kml"

type WizardStep = "welcome" | "wallet-choice" | "connect" | "review" | "signing" | "success"

interface DelegationWizardProps {
  isOpen: boolean
  onClose: () => void
}

export function DelegationWizard({ isOpen, onClose }: DelegationWizardProps) {
  const [step, setStep] = useState<WizardStep>("welcome")
  const [detectedWallets, setDetectedWallets] = useState<string[]>([])
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null)
  const [walletApi, setWalletApi] = useState<WalletApi | null>(null)
  const [stakeAddress, setStakeAddress] = useState<string | null>(null)
  const [currentDelegation, setCurrentDelegation] = useState<string | null>(null)
  const [isRegistered, setIsRegistered] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Detect available wallets
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).cardano) {
      const cardano = (window as any).cardano
      const wallets = Object.keys(cardano).filter(
        (key) =>
          typeof cardano[key] === "object" &&
          cardano[key] !== null &&
          typeof cardano[key].enable === "function" &&
          key !== "typhon" // Exclude duplicate
      )
      setDetectedWallets(wallets)
    }
  }, [])

  // Reset state when wizard opens
  useEffect(() => {
    if (isOpen) {
      setStep("welcome")
      setSelectedWallet(null)
      setWalletApi(null)
      setStakeAddress(null)
      setCurrentDelegation(null)
      setIsRegistered(false)
      setError(null)
      setTxHash(null)
    }
  }, [isOpen])

  // Connect to selected wallet
  const connectWallet = useCallback(async (walletName: string) => {
    setLoading(true)
    setError(null)

    try {
      const cardano = (window as any).cardano
      const wallet: DetectedWallet = cardano[walletName]

      if (!wallet) {
        throw new Error(`Wallet ${walletName} not found`)
      }

      const api = await wallet.enable()
      setWalletApi(api)
      setSelectedWallet(walletName)

      // Get reward/stake address
      const rewardAddresses = await api.getRewardAddresses()
      if (rewardAddresses && rewardAddresses.length > 0) {
        // Convert hex to bech32 stake address
        const hexAddr = rewardAddresses[0]
        // For now, we'll use the hex address directly
        // In production, you'd convert using cardano-serialization-lib
        setStakeAddress(hexAddr)

        // Check current delegation status
        try {
          // This would need proper bech32 conversion
          // For now, skip the API call
          setIsRegistered(false)
          setCurrentDelegation(null)
        } catch (e) {
          console.error("Error checking stake status:", e)
        }
      }

      setStep("review")
    } catch (err) {
      console.error("Error connecting wallet:", err)
      setError(err instanceof Error ? err.message : "Failed to connect wallet")
    } finally {
      setLoading(false)
    }
  }, [])

  // Build and submit delegation transaction
  const delegate = useCallback(async () => {
    if (!walletApi) {
      setError("Wallet not connected")
      return
    }

    setStep("signing")
    setLoading(true)
    setError(null)

    try {
      // In production, this would use Lucid or cardano-serialization-lib
      // to build the delegation transaction

      // For now, we'll show a message that the feature requires additional setup
      throw new Error(
        "Delegation requires Lucid library integration. " +
        "Please install a wallet extension and delegate directly from there, " +
        "searching for pool ticker: NACHO"
      )

      // The actual implementation would:
      // 1. Initialize Lucid with our API provider
      // 2. Build stake key registration cert (if not registered)
      // 3. Build delegation cert to NACHO pool
      // 4. Sign transaction
      // 5. Submit transaction

    } catch (err) {
      console.error("Error delegating:", err)
      setError(err instanceof Error ? err.message : "Failed to delegate")
      setStep("review")
    } finally {
      setLoading(false)
    }
  }, [walletApi])

  if (!isOpen) return null

  const steps: WizardStep[] = ["welcome", "wallet-choice", "connect", "review", "signing", "success"]
  const currentStepIndex = steps.indexOf(step)

  return (
    <div className="pool-wizard-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pool-wizard-container animate-slide-up">
        {/* Header */}
        <div className="pool-wizard-header">
          {/* Progress */}
          <div className="pool-wizard-progress">
            {steps.slice(0, -1).map((s, i) => (
              <div
                key={s}
                className={`pool-wizard-step ${
                  i < currentStepIndex ? "completed" : i === currentStepIndex ? "active" : ""
                }`}
              />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="pool-wizard-title">
              {step === "welcome" && "Start Staking with NACHO"}
              {step === "wallet-choice" && "Choose Your Wallet"}
              {step === "connect" && "Connect Your Wallet"}
              {step === "review" && "Review & Delegate"}
              {step === "signing" && "Sign Transaction"}
              {step === "success" && "Success!"}
            </h2>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "var(--nacho-muted)",
                fontSize: "1.5rem",
                cursor: "pointer",
                padding: "0.25rem",
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="pool-wizard-content">
          {step === "welcome" && (
            <div>
              <h3 style={{ marginBottom: "1rem" }}>What is Staking?</h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                <li style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
                  <span style={{ color: "var(--nacho-primary)" }}>✓</span>
                  <span>
                    <strong>Your ADA never leaves your wallet</strong>
                    <br />
                    <span style={{ color: "var(--nacho-muted)", fontSize: "0.875rem" }}>
                      You maintain full control at all times
                    </span>
                  </span>
                </li>
                <li style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
                  <span style={{ color: "var(--nacho-primary)" }}>✓</span>
                  <span>
                    <strong>Earn ~4-5% rewards automatically</strong>
                    <br />
                    <span style={{ color: "var(--nacho-muted)", fontSize: "0.875rem" }}>
                      Rewards arrive every 5 days (epoch)
                    </span>
                  </span>
                </li>
                <li style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
                  <span style={{ color: "var(--nacho-primary)" }}>✓</span>
                  <span>
                    <strong>Support network decentralization</strong>
                    <br />
                    <span style={{ color: "var(--nacho-muted)", fontSize: "0.875rem" }}>
                      Independent pools like NACHO strengthen Cardano
                    </span>
                  </span>
                </li>
              </ul>
            </div>
          )}

          {step === "wallet-choice" && (
            <div>
              <p style={{ marginBottom: "1.5rem", color: "var(--nacho-muted)" }}>
                Do you have a Cardano wallet?
              </p>
              <div style={{ display: "flex", gap: "1rem" }}>
                <button
                  className="pool-btn pool-btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => setStep("connect")}
                >
                  Yes, I have a wallet
                </button>
                <button
                  className="pool-btn pool-btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => window.open("https://www.lace.io", "_blank")}
                >
                  No, I need one
                </button>
              </div>
              <div style={{ marginTop: "1.5rem" }}>
                <p style={{ fontSize: "0.875rem", color: "var(--nacho-muted)", marginBottom: "0.75rem" }}>
                  Recommended wallets:
                </p>
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  {["lace", "eternl", "yoroi"].map((w) => (
                    <a
                      key={w}
                      href={KNOWN_WALLETS[w]?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--nacho-primary)",
                        textDecoration: "none",
                        fontSize: "0.875rem",
                      }}
                    >
                      {KNOWN_WALLETS[w]?.displayName} →
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === "connect" && (
            <div>
              <p style={{ marginBottom: "1rem", color: "var(--nacho-muted)" }}>
                Select your wallet to connect:
              </p>
              {detectedWallets.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem" }}>
                  <p style={{ marginBottom: "1rem" }}>No wallet extensions detected.</p>
                  <p style={{ fontSize: "0.875rem", color: "var(--nacho-muted)" }}>
                    Please install a Cardano wallet extension like{" "}
                    <a
                      href="https://www.lace.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--nacho-primary)" }}
                    >
                      Lace
                    </a>{" "}
                    or{" "}
                    <a
                      href="https://eternl.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--nacho-primary)" }}
                    >
                      Eternl
                    </a>
                    .
                  </p>
                </div>
              ) : (
                <div className="pool-wallet-grid">
                  {detectedWallets.map((walletKey) => {
                    const config = KNOWN_WALLETS[walletKey]
                    return (
                      <button
                        key={walletKey}
                        className={`pool-wallet-btn ${selectedWallet === walletKey ? "selected" : ""}`}
                        onClick={() => connectWallet(walletKey)}
                        disabled={loading}
                      >
                        <div
                          className="pool-wallet-icon"
                          style={{
                            width: "2.5rem",
                            height: "2.5rem",
                            background: "var(--nacho-border)",
                            borderRadius: "0.5rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "1rem",
                          }}
                        >
                          {config?.displayName?.[0] || walletKey[0].toUpperCase()}
                        </div>
                        <span className="pool-wallet-name">
                          {config?.displayName || walletKey}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {loading && (
                <p style={{ textAlign: "center", marginTop: "1rem", color: "var(--nacho-muted)" }}>
                  Connecting...
                </p>
              )}
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--nacho-muted)",
                  marginTop: "1.5rem",
                  textAlign: "center",
                }}
              >
                We&apos;ll never ask for your seed phrase. The connection only allows us to see
                your address.
              </p>
            </div>
          )}

          {step === "review" && (
            <div>
              <div
                style={{
                  background: "var(--nacho-background)",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                  marginBottom: "1.5rem",
                }}
              >
                <div style={{ marginBottom: "0.75rem" }}>
                  <span style={{ color: "var(--nacho-muted)", fontSize: "0.75rem" }}>
                    Connected Wallet
                  </span>
                  <div style={{ fontFamily: "monospace", fontSize: "0.875rem" }}>
                    {selectedWallet && KNOWN_WALLETS[selectedWallet]?.displayName}
                  </div>
                </div>
                <div>
                  <span style={{ color: "var(--nacho-muted)", fontSize: "0.75rem" }}>
                    Delegating To
                  </span>
                  <div style={{ fontSize: "0.875rem" }}>NACHO Stake Pool</div>
                </div>
              </div>

              <h4 style={{ marginBottom: "0.75rem" }}>What happens next:</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, marginBottom: "1.5rem" }}>
                <li style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ color: "var(--nacho-primary)" }}>✓</span>
                  <span>A small transaction fee (~0.17 ADA)</span>
                </li>
                {!isRegistered && (
                  <li style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <span style={{ color: "var(--nacho-primary)" }}>✓</span>
                    <span>First-time: 2 ADA deposit (refundable)</span>
                  </li>
                )}
                <li style={{ display: "flex", gap: "0.5rem" }}>
                  <span style={{ color: "var(--nacho-primary)" }}>✓</span>
                  <span>Your ADA stays in your wallet</span>
                </li>
              </ul>

              {error && (
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid var(--nacho-error)",
                    borderRadius: "0.5rem",
                    padding: "1rem",
                    marginBottom: "1rem",
                    fontSize: "0.875rem",
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          )}

          {step === "signing" && (
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <div
                style={{
                  width: "3rem",
                  height: "3rem",
                  border: "3px solid var(--nacho-border)",
                  borderTopColor: "var(--nacho-primary)",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  margin: "0 auto 1.5rem",
                }}
              />
              <style jsx>{`
                @keyframes spin {
                  to {
                    transform: rotate(360deg);
                  }
                }
              `}</style>
              <p>Please check your wallet extension...</p>
              <p style={{ fontSize: "0.875rem", color: "var(--nacho-muted)", marginTop: "0.5rem" }}>
                Your wallet will ask you to sign the delegation transaction.
              </p>
            </div>
          )}

          {step === "success" && (
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: "4rem",
                  height: "4rem",
                  background: "var(--nacho-success)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1.5rem",
                  fontSize: "2rem",
                }}
              >
                ✓
              </div>
              <h3 style={{ marginBottom: "1rem" }}>You&apos;re now delegating to NACHO!</h3>
              <p style={{ color: "var(--nacho-muted)", marginBottom: "1.5rem" }}>
                Your delegation is being processed.
              </p>

              <div
                style={{
                  background: "var(--nacho-background)",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                  marginBottom: "1.5rem",
                  textAlign: "left",
                }}
              >
                <h4 style={{ marginBottom: "0.75rem" }}>What&apos;s Next:</h4>
                <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--nacho-muted)" }}>
                  <li style={{ marginBottom: "0.5rem" }}>
                    Rewards start in ~15-20 days (warm-up period)
                  </li>
                  <li style={{ marginBottom: "0.5rem" }}>
                    After that, rewards arrive every 5 days automatically
                  </li>
                  <li>No action needed - just watch your ADA grow!</li>
                </ul>
              </div>

              {txHash && (
                <a
                  href={`https://cardanoscan.io/transaction/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pool-btn pool-btn-secondary"
                  style={{ marginRight: "0.5rem" }}
                >
                  View Transaction
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pool-wizard-footer">
          {step !== "welcome" && step !== "success" && step !== "signing" && (
            <button
              className="pool-btn pool-btn-secondary"
              onClick={() => {
                if (step === "wallet-choice") setStep("welcome")
                else if (step === "connect") setStep("wallet-choice")
                else if (step === "review") setStep("connect")
              }}
              disabled={loading}
            >
              Back
            </button>
          )}
          {step === "welcome" && (
            <>
              <div /> {/* Spacer */}
              <button
                className="pool-btn pool-btn-primary"
                onClick={() => setStep("wallet-choice")}
              >
                Get Started →
              </button>
            </>
          )}
          {step === "review" && (
            <button
              className="pool-btn pool-btn-primary"
              onClick={delegate}
              disabled={loading}
            >
              {loading ? "Processing..." : "Delegate to NACHO"}
            </button>
          )}
          {step === "success" && (
            <>
              <div /> {/* Spacer */}
              <button className="pool-btn pool-btn-primary" onClick={onClose}>
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
