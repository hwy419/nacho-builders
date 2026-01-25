"use client"

import { useState } from "react"
import { LiveStats } from "./components/live-stats"
import { DelegationWizard } from "./components/delegation-wizard"

export default function PoolPage() {
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="pool-page">
      {/* Navigation */}
      <nav className="pool-nav">
        <div className="pool-container">
          <div className="pool-nav-inner">
            <a href="/" className="pool-nav-brand">
              <div className="pool-nav-brand-icon">N</div>
              <span className="pool-nav-brand-text">Nacho STAKE</span>
            </a>

            {/* Desktop Navigation */}
            <div className="pool-nav-links">
              <a href="#stats" className="pool-nav-link">
                Stats
              </a>
              <a href="#about" className="pool-nav-link">
                About
              </a>
              <a href="#benefits" className="pool-nav-link">
                Benefits
              </a>
              <a href="#faq" className="pool-nav-link">
                FAQ
              </a>
              <a href="https://app.nacho.builders" className="pool-nav-link">
                Nacho API
              </a>
              <button
                className="pool-btn pool-btn-primary"
                onClick={() => setIsWizardOpen(true)}
              >
                Delegate Now
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="pool-mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? "✕" : "☰"}
            </button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div
              style={{
                padding: "1rem 0",
                borderTop: "1px solid var(--nacho-border)",
              }}
            >
              <a
                href="#stats"
                className="pool-nav-link"
                style={{ display: "block", padding: "0.75rem 0" }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Stats
              </a>
              <a
                href="#about"
                className="pool-nav-link"
                style={{ display: "block", padding: "0.75rem 0" }}
                onClick={() => setMobileMenuOpen(false)}
              >
                About
              </a>
              <a
                href="#benefits"
                className="pool-nav-link"
                style={{ display: "block", padding: "0.75rem 0" }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Benefits
              </a>
              <a
                href="#faq"
                className="pool-nav-link"
                style={{ display: "block", padding: "0.75rem 0" }}
                onClick={() => setMobileMenuOpen(false)}
              >
                FAQ
              </a>
              <a
                href="https://app.nacho.builders"
                className="pool-nav-link"
                style={{ display: "block", padding: "0.75rem 0" }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Nacho API
              </a>
              <button
                className="pool-btn pool-btn-primary"
                style={{ width: "100%", marginTop: "0.75rem" }}
                onClick={() => {
                  setMobileMenuOpen(false)
                  setIsWizardOpen(true)
                }}
              >
                Delegate Now
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pool-hero">
        <div className="pool-hero-bg" />
        <div className="pool-container">
          <div className="pool-hero-content">
            <h1 className="pool-hero-title">
              <span className="text-gradient">Decentralized.</span>
              <br />
              Reliable. Independent.
            </h1>
            <p className="pool-hero-subtitle">
              NACHO Stake Pool delivers secure, reliable block production from
              independently operated infrastructure in Alabama, USA.
            </p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
              <button
                className="pool-btn pool-btn-primary pool-btn-lg"
                onClick={() => setIsWizardOpen(true)}
              >
                Start Staking
              </button>
              <a href="#about" className="pool-btn pool-btn-secondary pool-btn-lg">
                Learn More
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Live Stats Section */}
      <section id="stats">
        <LiveStats />
      </section>

      {/* About Section */}
      <section id="about" className="pool-section">
        <div className="pool-container">
          <h2 className="pool-section-title">
            Why Choose <span className="text-gradient">NACHO</span>?
          </h2>
          <div className="pool-benefits-grid">
            <div className="pool-benefit-card">
              <div className="pool-benefit-icon">🏠</div>
              <h3 className="pool-benefit-title">Self-Hosted Infrastructure</h3>
              <p className="pool-benefit-description">
                No cloud providers. No shared servers. NACHO runs on dedicated
                hardware we control, ensuring maximum uptime and security.
              </p>
            </div>
            <div className="pool-benefit-card">
              <div className="pool-benefit-icon">🇺🇸</div>
              <h3 className="pool-benefit-title">U.S. Based Operations</h3>
              <p className="pool-benefit-description">
                Located in Alabama, USA. Contributing to geographic
                decentralization of the Cardano network.
              </p>
            </div>
            <div className="pool-benefit-card">
              <div className="pool-benefit-icon">💪</div>
              <h3 className="pool-benefit-title">True Decentralization</h3>
              <p className="pool-benefit-description">
                Single-pool operator committed to network health. Your
                delegation supports true decentralization, not stake
                consolidation.
              </p>
            </div>
            <div className="pool-benefit-card">
              <div className="pool-benefit-icon">📊</div>
              <h3 className="pool-benefit-title">Competitive Fees</h3>
              <p className="pool-benefit-description">
                1.5% margin with 10,000 ADA pledge. Fair fees that sustain
                reliable infrastructure without excessive costs.
              </p>
            </div>
            <div className="pool-benefit-card">
              <div className="pool-benefit-icon">🔒</div>
              <h3 className="pool-benefit-title">Security First</h3>
              <p className="pool-benefit-description">
                Air-gapped cold keys, isolated block producer, multi-layer
                network security. Your delegation is protected.
              </p>
            </div>
            <div className="pool-benefit-card">
              <div className="pool-benefit-icon">⚡</div>
              <h3 className="pool-benefit-title">High Availability</h3>
              <p className="pool-benefit-description">
                Redundant relay nodes, 24/7 monitoring, automated failover.
                Built for reliability.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="pool-section" style={{ background: "rgba(0,0,0,0.2)" }}>
        <div className="pool-container">
          <h2 className="pool-section-title">Staking Benefits</h2>
          <div
            style={{
              display: "grid",
              gap: "2rem",
              maxWidth: "800px",
              margin: "0 auto",
            }}
          >
            <div className="pool-card" style={{ padding: "1.5rem" }}>
              <h3 style={{ marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ color: "var(--nacho-primary)" }}>💰</span>
                Earn Passive Rewards
              </h3>
              <p style={{ color: "var(--nacho-muted)" }}>
                Earn approximately 4-5% annual rewards on your ADA. Rewards are
                distributed automatically every 5 days (epoch).
              </p>
            </div>
            <div className="pool-card" style={{ padding: "1.5rem" }}>
              <h3 style={{ marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ color: "var(--nacho-primary)" }}>🔓</span>
                No Lock-Up Period
              </h3>
              <p style={{ color: "var(--nacho-muted)" }}>
                Your ADA is never locked. Spend, transfer, or re-delegate at any
                time with no penalties or waiting periods.
              </p>
            </div>
            <div className="pool-card" style={{ padding: "1.5rem" }}>
              <h3 style={{ marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ color: "var(--nacho-primary)" }}>🛡️</span>
                Safe & Secure
              </h3>
              <p style={{ color: "var(--nacho-muted)" }}>
                Your ADA never leaves your wallet. Delegation only assigns your
                stake weight—you maintain full custody.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="pool-section">
        <div className="pool-container">
          <h2 className="pool-section-title">Frequently Asked Questions</h2>
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="pool-card"
                style={{ marginBottom: "1rem", padding: "1.5rem" }}
              >
                <h3 style={{ marginBottom: "0.75rem", fontSize: "1rem" }}>{faq.question}</h3>
                <p style={{ color: "var(--nacho-muted)", fontSize: "0.875rem", margin: 0 }}>
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="pool-section" style={{ textAlign: "center" }}>
        <div className="pool-container">
          <h2 style={{ marginBottom: "1rem" }}>Ready to Start Earning?</h2>
          <p style={{ color: "var(--nacho-muted)", marginBottom: "2rem", maxWidth: "500px", margin: "0 auto 2rem" }}>
            Join NACHO today and start earning rewards while supporting Cardano
            decentralization.
          </p>
          <button
            className="pool-btn pool-btn-primary pool-btn-lg"
            onClick={() => setIsWizardOpen(true)}
          >
            Delegate to NACHO
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="pool-footer">
        <div className="pool-container">
          <div style={{ display: "flex", justifyContent: "center", gap: "2rem", marginBottom: "1rem" }}>
            <a href="https://app.nacho.builders" className="pool-nav-link">
              Nacho API
            </a>
            <a href="https://app.nacho.builders/docs" className="pool-nav-link">
              Documentation
            </a>
          </div>
          <p className="pool-footer-text">
            © {new Date().getFullYear()} NACHO Stake Pool. Strengthening Cardano,
            one block at a time.
          </p>
          <p className="pool-footer-text" style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
            Pool ID: pool1dhugawja82wkmrq0lhd24uyrhm02v7grdhnren9r2qgujsh5kml
          </p>
        </div>
      </footer>

      {/* Delegation Wizard */}
      <DelegationWizard isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} />
    </div>
  )
}

const faqs = [
  {
    question: "Is my ADA locked when I delegate?",
    answer:
      "No. Your ADA is never locked and never leaves your wallet. You can spend, transfer, or re-delegate at any time with no penalties.",
  },
  {
    question: "When will I start earning rewards?",
    answer:
      "Rewards begin after a brief warm-up period of 15-20 days (3-4 epochs). After that, rewards are distributed every 5 days automatically.",
  },
  {
    question: "What are the fees?",
    answer:
      "NACHO charges a 1.5% margin on rewards plus the standard 340 ADA fixed fee per block minted. These fees sustain reliable infrastructure and operations.",
  },
  {
    question: "Why should I delegate to a smaller pool like NACHO?",
    answer:
      "Delegating to smaller, independent pools strengthens Cardano's decentralization. Large pools concentrate power; distributed delegation keeps the network resilient and censorship-resistant.",
  },
  {
    question: "What is the pledge and why does it matter?",
    answer:
      "Our 10,000 ADA pledge is the operator's own stake committed to the pool. It demonstrates our investment in NACHO's success and aligns our interests with our delegators.",
  },
  {
    question: "How do I delegate to NACHO?",
    answer:
      "Click the 'Delegate Now' button and follow the step-by-step wizard. You'll need a Cardano wallet like Eternl, Lace, or Yoroi. The process takes just a few minutes.",
  },
]
