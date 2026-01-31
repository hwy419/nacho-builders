/**
 * Type-safe GA4 Event Definitions
 *
 * All custom events tracked across Pool and Dashboard sites.
 * Uses TypeScript interfaces for type safety.
 */

import type { SiteType, WalletType } from "./constants"

// Base event parameters that apply to all custom events
interface BaseEventParams {
  site: SiteType
}

// ============================================
// Pool Site Events (nacho.builders)
// ============================================

// Delegation Wizard Events
export interface DelegateWizardOpenEvent extends BaseEventParams {
  event_name: "delegate_wizard_open"
}

export interface WalletDetectedEvent extends BaseEventParams {
  event_name: "wallet_detected"
  wallet_type: WalletType
  wallet_count: number
}

export interface WalletConnectAttemptEvent extends BaseEventParams {
  event_name: "wallet_connect_attempt"
  wallet_type: WalletType
}

export interface WalletConnectedEvent extends BaseEventParams {
  event_name: "wallet_connected"
  wallet_type: WalletType
}

export interface DelegationStartedEvent extends BaseEventParams {
  event_name: "delegation_started"
  wallet_type: WalletType
}

export interface DelegationCompletedEvent extends BaseEventParams {
  event_name: "delegation_completed"
  wallet_type: WalletType
  tx_hash: string
}

export interface DelegationErrorEvent extends BaseEventParams {
  event_name: "delegation_error"
  wallet_type: WalletType
  error_message: string
}

// Pool Page Engagement Events
export interface CTAClickEvent extends BaseEventParams {
  event_name: "cta_click"
  cta_location: "hero" | "nav" | "footer" | "benefits"
  cta_text: string
}

export interface NavigationClickEvent extends BaseEventParams {
  event_name: "navigation_click"
  nav_item: string
  is_mobile: boolean
}

export interface OutboundClickEvent extends BaseEventParams {
  event_name: "outbound_click"
  destination_url: string
  link_text: string
}

export interface FAQExpandEvent extends BaseEventParams {
  event_name: "faq_expand"
  faq_question: string
  faq_index: number
}

export interface ScrollDepthEvent extends BaseEventParams {
  event_name: "scroll_depth"
  depth_threshold: 25 | 50 | 75 | 100
}

// ============================================
// Dashboard Events (app.nacho.builders)
// ============================================

// Authentication Events
export interface LoginAttemptEvent extends BaseEventParams {
  event_name: "login_attempt"
  login_method: "google" | "email"
}

export interface LoginSuccessEvent extends BaseEventParams {
  event_name: "login_success"
  login_method: "google" | "email"
  is_new_user: boolean
}

export interface LoginErrorEvent extends BaseEventParams {
  event_name: "login_error"
  login_method: "google" | "email"
  error_type: string
}

export interface SignupCompleteEvent extends BaseEventParams {
  event_name: "signup_complete"
  signup_method: "google" | "email"
}

// API Key Events
export interface APIKeyCopiedEvent extends BaseEventParams {
  event_name: "api_key_copied"
  key_tier: "free" | "paid" | "admin"
}

export interface APIKeyDeletedEvent extends BaseEventParams {
  event_name: "api_key_deleted"
  key_tier: "free" | "paid" | "admin"
}

export interface APIKeyCreateStartEvent extends BaseEventParams {
  event_name: "api_key_create_start"
}

export interface APIKeyCreatedEvent extends BaseEventParams {
  event_name: "api_key_created"
  key_tier: "paid"
  selected_apis: string[]
}

// Billing/Purchase Events
export interface CreditPackageViewEvent extends BaseEventParams {
  event_name: "credit_package_view"
  package_name: string
  package_price_ada: number
  package_credits: number
}

export interface CheckoutBeginEvent extends BaseEventParams {
  event_name: "checkout_begin"
  package_name: string
  package_price_ada: number
  package_credits: number
}

export interface PurchaseCompleteEvent extends BaseEventParams {
  event_name: "purchase_complete"
  package_name: string
  package_price_ada: number
  package_credits: number
  tx_hash: string
}

export interface PurchaseErrorEvent extends BaseEventParams {
  event_name: "purchase_error"
  package_name: string
  error_type: "expired" | "failed"
}

// Union type of all custom events
export type AnalyticsEvent =
  // Pool events
  | DelegateWizardOpenEvent
  | WalletDetectedEvent
  | WalletConnectAttemptEvent
  | WalletConnectedEvent
  | DelegationStartedEvent
  | DelegationCompletedEvent
  | DelegationErrorEvent
  | CTAClickEvent
  | NavigationClickEvent
  | OutboundClickEvent
  | FAQExpandEvent
  | ScrollDepthEvent
  // Dashboard events
  | LoginAttemptEvent
  | LoginSuccessEvent
  | LoginErrorEvent
  | SignupCompleteEvent
  | APIKeyCopiedEvent
  | APIKeyDeletedEvent
  | APIKeyCreateStartEvent
  | APIKeyCreatedEvent
  | CreditPackageViewEvent
  | CheckoutBeginEvent
  | PurchaseCompleteEvent
  | PurchaseErrorEvent

// Helper type to extract event names
export type EventName = AnalyticsEvent["event_name"]
