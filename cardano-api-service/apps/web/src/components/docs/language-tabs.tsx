"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Check, Copy } from "lucide-react"

type Language = 'curl' | 'javascript' | 'typescript' | 'python' | 'go' | 'rust'

interface LanguageTabsProps {
  examples: Partial<Record<Language, string>>
  defaultLanguage?: Language
}

const languageLabels: Record<Language, string> = {
  curl: 'cURL',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
}

const languageColors: Record<Language, string> = {
  curl: 'text-green-400',
  javascript: 'text-yellow-400',
  typescript: 'text-blue-400',
  python: 'text-blue-300',
  go: 'text-cyan-400',
  rust: 'text-orange-400',
}

const STORAGE_KEY = 'nacho-docs-language'

export function LanguageTabs({ examples, defaultLanguage }: LanguageTabsProps) {
  const languages = Object.keys(examples) as Language[]
  const [activeLanguage, setActiveLanguage] = useState<Language>(
    defaultLanguage || languages[0]
  )
  const [copied, setCopied] = useState(false)

  // Load saved preference
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null
    if (saved && languages.includes(saved)) {
      setActiveLanguage(saved)
    }
  }, [languages])

  const handleLanguageChange = (lang: Language) => {
    setActiveLanguage(lang)
    localStorage.setItem(STORAGE_KEY, lang)
    // Dispatch event so other tabs on the page sync
    window.dispatchEvent(new CustomEvent('language-change', { detail: lang }))
  }

  // Listen for language changes from other tabs
  useEffect(() => {
    const handleChange = (e: CustomEvent<Language>) => {
      if (languages.includes(e.detail)) {
        setActiveLanguage(e.detail)
      }
    }
    window.addEventListener('language-change', handleChange as EventListener)
    return () => window.removeEventListener('language-change', handleChange as EventListener)
  }, [languages])

  const copyToClipboard = async () => {
    const code = examples[activeLanguage]
    if (!code) return

    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const code = examples[activeLanguage]

  return (
    <div className="my-6">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {languages.map((lang) => (
          <button
            key={lang}
            onClick={() => handleLanguageChange(lang)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap',
              'border-b-2 -mb-px',
              activeLanguage === lang
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
            )}
          >
            <span className={cn(activeLanguage === lang && languageColors[lang])}>
              {languageLabels[lang]}
            </span>
          </button>
        ))}
      </div>

      {/* Code */}
      <div className="relative group">
        <pre className="overflow-x-auto bg-bg-tertiary border border-t-0 border-border p-4 rounded-b-lg text-sm">
          <code className="font-mono text-text-primary whitespace-pre">
            {code}
          </code>
        </pre>
        <button
          onClick={copyToClipboard}
          className={cn(
            'absolute top-3 right-3 p-2 rounded-md transition-all',
            'bg-bg-secondary/50 hover:bg-bg-secondary border border-border',
            'opacity-0 group-hover:opacity-100',
            copied && 'opacity-100'
          )}
          title={copied ? 'Copied!' : 'Copy code'}
        >
          {copied ? (
            <Check className="h-4 w-4 text-success" />
          ) : (
            <Copy className="h-4 w-4 text-text-secondary" />
          )}
        </button>
      </div>
    </div>
  )
}
