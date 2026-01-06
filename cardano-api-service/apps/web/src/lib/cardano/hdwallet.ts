/**
 * HD Wallet Address Derivation for Cardano
 *
 * Uses BIP44 derivation path for Cardano (Yoroi standard):
 * m/1852'/1815'/0'/0/index
 *
 * The master xpub is exported from Yoroi and stored in env CARDANO_MASTER_XPUB
 */

import * as CardanoWasm from "@emurgo/cardano-serialization-lib-nodejs"

// Cardano mainnet network ID
const NETWORK_ID = 1

/**
 * Derives a payment address from the master extended public key
 *
 * @param xpubHex - The extended public key in hex format (exported from Yoroi)
 * @param index - The address index for derivation (0-based)
 * @returns Bech32 mainnet address
 */
export function derivePaymentAddress(xpubHex: string, index: number): string {
  try {
    // Parse the xpub from hex
    const xpubBytes = hexToBytes(xpubHex)

    // Create the Bip32PublicKey from the account-level xpub
    // Yoroi exports the account key at m/1852'/1815'/0'
    const accountPubKey = CardanoWasm.Bip32PublicKey.from_bytes(xpubBytes)

    // Derive the external chain (0) and then the address index
    // This gives us m/1852'/1815'/0'/0/index
    const externalChainKey = accountPubKey.derive(0) // external chain
    const addressKey = externalChainKey.derive(index) // address index

    // Get the raw public key for the payment credential
    const paymentPubKey = addressKey.to_raw_key()

    // Create the payment credential from the public key hash
    const paymentKeyHash = paymentPubKey.hash()
    const paymentCredential = CardanoWasm.Credential.from_keyhash(paymentKeyHash)

    // For stake key, derive from m/1852'/1815'/0'/2/0
    const stakeChainKey = accountPubKey.derive(2) // stake chain
    const stakeKey = stakeChainKey.derive(0) // first stake key
    const stakePubKey = stakeKey.to_raw_key()
    const stakeKeyHash = stakePubKey.hash()
    const stakeCredential = CardanoWasm.Credential.from_keyhash(stakeKeyHash)

    // Create a base address (payment + stake)
    const baseAddress = CardanoWasm.BaseAddress.new(
      NETWORK_ID,
      paymentCredential,
      stakeCredential
    )

    // Convert to bech32 format
    return baseAddress.to_address().to_bech32()
  } catch (error) {
    throw new Error(`Failed to derive payment address: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Derives an enterprise address (no staking) from the master xpub
 * Enterprise addresses are simpler but don't allow staking rewards
 *
 * @param xpubHex - The extended public key in hex format
 * @param index - The address index for derivation
 * @returns Bech32 mainnet enterprise address
 */
export function deriveEnterpriseAddress(xpubHex: string, index: number): string {
  try {
    const xpubBytes = hexToBytes(xpubHex)
    const accountPubKey = CardanoWasm.Bip32PublicKey.from_bytes(xpubBytes)

    // Derive external chain and address
    const externalChainKey = accountPubKey.derive(0)
    const addressKey = externalChainKey.derive(index)

    const paymentPubKey = addressKey.to_raw_key()
    const paymentKeyHash = paymentPubKey.hash()
    const paymentCredential = CardanoWasm.Credential.from_keyhash(paymentKeyHash)

    // Create enterprise address (payment only, no stake)
    const enterpriseAddress = CardanoWasm.EnterpriseAddress.new(
      NETWORK_ID,
      paymentCredential
    )

    return enterpriseAddress.to_address().to_bech32()
  } catch (error) {
    throw new Error(`Failed to derive enterprise address: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Gets the next available address index for a user
 *
 * @param userId - User ID to look up payment count for
 * @returns The next address index to use
 */
export async function getNextAddressIndex(userId: string): Promise<number> {
  // Import prisma dynamically to avoid circular dependencies
  const { prisma } = await import("../db")

  // Find the maximum address index used by this user
  const lastPayment = await prisma.payment.findFirst({
    where: { userId },
    orderBy: { addressIndex: 'desc' },
    select: { addressIndex: true }
  })

  return lastPayment ? lastPayment.addressIndex + 1 : 0
}

/**
 * Generates a unique payment address for a user
 *
 * @param userId - User ID to generate address for
 * @returns Object with address and its index
 */
export async function generateUniquePaymentAddress(userId: string): Promise<{
  address: string
  addressIndex: number
}> {
  const masterXpub = process.env.CARDANO_MASTER_XPUB

  if (!masterXpub) {
    throw new Error("CARDANO_MASTER_XPUB environment variable not set")
  }

  const addressIndex = await getNextAddressIndex(userId)
  const address = derivePaymentAddress(masterXpub, addressIndex)

  return { address, addressIndex }
}

/**
 * Validates that a bech32 address is a valid Cardano mainnet address
 *
 * @param address - Bech32 address to validate
 * @returns true if valid mainnet address
 */
export function isValidMainnetAddress(address: string): boolean {
  try {
    const addr = CardanoWasm.Address.from_bech32(address)
    const networkId = addr.network_id()
    return networkId === NETWORK_ID
  } catch {
    return false
  }
}

/**
 * Helper function to convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  // Remove any whitespace and ensure lowercase
  const cleanHex = hex.replace(/\s/g, '').toLowerCase()

  if (cleanHex.length % 2 !== 0) {
    throw new Error('Hex string must have even length')
  }

  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16)
  }
  return bytes
}

/**
 * Helper function to convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
