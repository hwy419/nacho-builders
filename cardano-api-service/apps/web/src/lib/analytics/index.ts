/**
 * Analytics Module - Public API
 *
 * Re-exports all analytics functionality for easy imports.
 */

// Constants
export {
  GA_MEASUREMENT_ID_POOL,
  GA_MEASUREMENT_ID_DASHBOARD,
  TRACKING_DOMAINS,
  SCROLL_THRESHOLDS,
  SUPPORTED_WALLETS,
  getCreditBucket,
} from "./constants"

export type {
  SiteType,
  UserTier,
  CreditBucket,
  WalletType,
} from "./constants"

// Event types
export type {
  AnalyticsEvent,
  EventName,
  // Pool events
  DelegateWizardOpenEvent,
  WalletDetectedEvent,
  WalletConnectAttemptEvent,
  WalletConnectedEvent,
  DelegationStartedEvent,
  DelegationCompletedEvent,
  DelegationErrorEvent,
  CTAClickEvent,
  NavigationClickEvent,
  OutboundClickEvent,
  FAQExpandEvent,
  ScrollDepthEvent,
  // Dashboard events
  LoginAttemptEvent,
  LoginSuccessEvent,
  LoginErrorEvent,
  SignupCompleteEvent,
  APIKeyCopiedEvent,
  APIKeyDeletedEvent,
  APIKeyCreateStartEvent,
  APIKeyCreatedEvent,
  CreditPackageViewEvent,
  CheckoutBeginEvent,
  PurchaseCompleteEvent,
  PurchaseErrorEvent,
} from "./events"

// Core gtag functions
export {
  isGtagAvailable,
  getMeasurementId,
  pageview,
  trackEvent,
  setUserProperties,
  setUserId,
  setConsent,
  initDataLayer,
} from "./gtag"

export type { EventParams } from "./gtag"

// React hooks
export {
  usePageTracking,
  useTrackEvent,
  useScrollTracking,
  useCTATracking,
  useNavTracking,
  useOutboundTracking,
} from "./hooks"

// Ecommerce tracking
export {
  trackViewItem,
  trackBeginCheckout,
  trackPurchase,
  trackPurchaseFailed,
} from "./ecommerce"
