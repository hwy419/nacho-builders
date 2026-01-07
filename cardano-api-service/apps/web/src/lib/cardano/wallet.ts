"use client"

import { BrowserWallet, type Wallet } from "@meshsdk/core"

export interface ConnectedWallet {
  name: string
  icon: string
  api: Wallet
}

export async function getAvailableWallets(): Promise<string[]> {
  if (typeof window === 'undefined') return []
  
  return BrowserWallet.getInstalledWallets()
}

export async function connectWallet(walletName: string): Promise<ConnectedWallet | null> {
  try {
    const wallet = await BrowserWallet.enable(walletName)
    
    return {
      name: walletName,
      icon: BrowserWallet.getWalletIcon(walletName),
      api: wallet
    }
  } catch (error) {
    console.error(`Failed to connect ${walletName}:`, error)
    return null
  }
}

export async function getWalletBalance(wallet: Wallet): Promise<string> {
  try {
    const balance = await wallet.getBalance()
    // Convert lovelace to ADA
    const ada = parseInt(balance[0]?.quantity || '0') / 1_000_000
    return ada.toFixed(2)
  } catch (error) {
    console.error('Failed to get wallet balance:', error)
    return '0'
  }
}

export async function sendADA(
  wallet: Wallet,
  toAddress: string,
  lovelaceAmount: string
): Promise<string> {
  try {
    const tx = await wallet.sendLovelace(toAddress, lovelaceAmount)
    return tx
  } catch (error) {
    console.error('Failed to send ADA:', error)
    throw error
  }
}

export function lovelaceToADA(lovelace: bigint | number): number {
  const amount = typeof lovelace === 'bigint' ? Number(lovelace) : lovelace
  return amount / 1_000_000
}

export function adaToLovelace(ada: number): bigint {
  return BigInt(Math.floor(ada * 1_000_000))
}

export const SUPPORTED_WALLETS = [
  { id: 'nami', name: 'Nami', icon: '🦎' },
  { id: 'eternl', name: 'Eternl', icon: '♾️' },
  { id: 'lace', name: 'Lace', icon: '🎀' },
  { id: 'flint', name: 'Flint', icon: '🔥' },
  { id: 'typhon', name: 'Typhon', icon: '🌊' },
]





