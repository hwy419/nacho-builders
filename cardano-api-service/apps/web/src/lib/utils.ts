import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

export function formatCredits(num: number): string {
  if (num >= 1_000_000) {
    const millions = num / 1_000_000
    // Show decimal only if not a whole number
    return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`
  } else if (num >= 1_000) {
    const thousands = num / 1_000
    return thousands % 1 === 0 ? `${thousands}k` : `${thousands.toFixed(0)}k`
  }
  return num.toString()
}

export function formatADA(lovelace: bigint | number): string {
  const ada = typeof lovelace === 'bigint' 
    ? Number(lovelace) / 1_000_000 
    : lovelace / 1_000_000
  return new Intl.NumberFormat('en-US', { 
    minimumFractionDigits: 2,
    maximumFractionDigits: 6 
  }).format(ada)
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d)
}

export function truncateString(str: string, length: number = 20): string {
  if (str.length <= length) return str
  return `${str.slice(0, length)}...`
}

export function generateApiKey(): string {
  const prefix = 'napi_'
  const length = 32
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  
  let key = prefix
  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  
  return key
}

export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}





