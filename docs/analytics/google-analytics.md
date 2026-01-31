# Google Analytics 4 Implementation

This document describes the GA4 analytics implementation for the Nacho Builders sites.

## Overview

The implementation tracks user behavior across two sites:

- **Pool Landing** (nacho.builders) - Stake pool marketing with delegation wizard
- **API Dashboard** (app.nacho.builders) - Developer dashboard with auth, billing, API keys

Both sites use separate data streams but are configured for cross-domain tracking to follow users as they move between sites.

## GA4 Property Setup

### Create Property

1. Go to [Google Analytics](https://analytics.google.com)
2. Create a new GA4 property
3. Property name: "Nacho Builders"

### Create Data Streams

Create two web data streams:

1. **Pool Site Stream**
   - Stream name: "Pool Landing"
   - Website URL: https://nacho.builders
   - Get Measurement ID (format: `G-XXXXXXXXXX`)

2. **Dashboard Stream**
   - Stream name: "API Dashboard"
   - Website URL: https://app.nacho.builders
   - Get Measurement ID (format: `G-YYYYYYYYYY`)

### Configure Cross-Domain Tracking

For each data stream:

1. Click on the stream to open settings
2. Go to "Configure tag settings"
3. Click "Configure your domains"
4. Add both domains:
   - nacho.builders
   - app.nacho.builders
5. Save changes

## Environment Variables

Add measurement IDs to your environment:

```bash
# .env.local
NEXT_PUBLIC_GA_ID_POOL=G-XXXXXXXXXX
NEXT_PUBLIC_GA_ID_DASHBOARD=G-YYYYYYYYYY
```

## Event Reference

### Pool Site Events (nacho.builders)

| Event Name | Trigger | Parameters |
|------------|---------|------------|
| `delegate_wizard_open` | Modal opens | - |
| `wallet_detected` | Wallet found on page | `wallet_type`, `wallet_count` |
| `wallet_connect_attempt` | User clicks wallet | `wallet_type` |
| `wallet_connected` | Connection successful | `wallet_type` |
| `delegation_started` | User initiates delegation | `wallet_type` |
| `delegation_completed` | Transaction submitted | `wallet_type`, `tx_hash` |
| `delegation_error` | Any error in flow | `wallet_type`, `error_message` |
| `cta_click` | Any CTA button click | `cta_location`, `cta_text` |
| `navigation_click` | Nav link clicks | `nav_item`, `is_mobile` |
| `outbound_click` | Links to app.nacho.builders | `destination_url`, `link_text` |
| `faq_expand` | FAQ item clicked | `faq_question`, `faq_index` |
| `scroll_depth` | User scrolls | `depth_threshold` (25, 50, 75, 100) |

### Dashboard Events (app.nacho.builders)

| Event Name | Trigger | Parameters |
|------------|---------|------------|
| `login_attempt` | Login started | `login_method` (google/email) |
| `login_success` | Auth successful | `login_method`, `is_new_user` |
| `login_error` | Auth failure | `login_method`, `error_type` |
| `signup_complete` | New user created | `signup_method` |
| `api_key_copied` | Copy button clicked | `key_tier` |
| `api_key_deleted` | Delete confirmed | `key_tier` |
| `api_key_create_start` | New key page loaded | - |
| `api_key_created` | Key created | `key_tier`, `selected_apis` |
| `credit_package_view` | Package selected | `package_name`, `package_price_ada`, `package_credits` |
| `checkout_begin` | Checkout page loaded | `package_name`, `package_price_ada`, `package_credits` |
| `purchase_complete` | Payment confirmed | `package_name`, `package_price_ada`, `package_credits`, `tx_hash` |
| `purchase_error` | Payment failed | `package_name`, `error_type` |

### Enhanced Ecommerce Events

Standard GA4 ecommerce events are also tracked:

| Event | Trigger |
|-------|---------|
| `view_item` | Package selected in modal |
| `begin_checkout` | Checkout page loaded |
| `purchase` | Payment confirmed |

Currency: ADA (custom)

## User Properties

Set on authentication:

| Property | Description | Values |
|----------|-------------|--------|
| `user_tier` | User's account tier | free, paid, admin |
| `credit_balance_bucket` | Credit balance range | 0, 1-100, 101-1000, 1001+ |
| `api_keys_count` | Number of active keys | number |
| `is_authenticated` | Auth status | boolean |

## Custom Dimensions

Sent with all events:

| Dimension | Description | Values |
|-----------|-------------|--------|
| `site` | Which site fired event | pool, dashboard |
| `wallet_type` | Cardano wallet used | eternl, lace, yoroi, etc. |

## Testing with DebugView

1. Open GA4 Admin > DebugView
2. Install the [Google Analytics Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna) Chrome extension
3. Enable the extension
4. Navigate the site and watch events appear in DebugView

Alternatively, add `?debug_mode=true` to any URL.

## Code Architecture

### Library Files (`src/lib/analytics/`)

```
constants.ts    # Measurement IDs, site identifiers
events.ts       # TypeScript event interfaces
gtag.ts         # Core gtag functions
hooks.ts        # React hooks for tracking
ecommerce.ts    # Enhanced ecommerce events
index.ts        # Public exports
```

### Component Files (`src/components/analytics/`)

```
GoogleAnalytics.tsx    # Dashboard GA script + hooks
PoolAnalytics.tsx      # Pool site GA with scroll tracking
AnalyticsProvider.tsx  # Context wrapper
index.ts               # Public exports
```

## Usage Examples

### Track an event from a component

```tsx
import { useAnalytics } from "@/components/analytics"

function MyComponent() {
  const { trackEvent } = useAnalytics()

  const handleClick = () => {
    trackEvent({
      event_name: "cta_click",
      cta_location: "hero",
      cta_text: "Get Started",
    })
  }

  return <button onClick={handleClick}>Get Started</button>
}
```

### Track from outside React

```tsx
import { trackEvent } from "@/lib/analytics"

trackEvent({
  event_name: "api_key_copied",
  key_tier: "paid",
}, "dashboard")
```

### Track ecommerce

```tsx
import { trackViewItem, trackPurchase } from "@/lib/analytics"

// When viewing a package
trackViewItem({
  name: "Starter",
  adaPrice: 10,
  credits: 10000,
}, "dashboard")

// When purchase completes
trackPurchase({
  name: "Starter",
  adaPrice: 10,
  credits: 10000,
}, txHash, "dashboard")
```

## Filtering Internal Traffic

There are several ways to exclude your own visits from analytics:

### Option 1: GA4 Internal Traffic Filter (Recommended)

1. Go to GA4 Admin > Data Streams > select your stream
2. Click "Configure tag settings" > "Define internal traffic"
3. Add a rule:
   - Rule name: "Office IP" or "Developer Traffic"
   - traffic_type value: `internal`
   - Add condition: IP address matches your IP (use https://whatismyipaddress.com)
4. Go to Admin > Data Settings > Data Filters
5. Enable the "Internal Traffic" filter (it's created automatically)
6. Set to "Active" (or "Testing" first to verify)

### Option 2: URL Parameter Method

Add `?internal=true` to URLs when testing. Then:

1. In GA4, go to Admin > Data Streams > Configure tag settings
2. Define internal traffic with condition: URL query parameter `internal` equals `true`

You can also bookmark URLs with this parameter for easy access.

### Option 3: Google Analytics Opt-out Extension

Install the [Google Analytics Opt-out Browser Add-on](https://tools.google.com/dlpage/gaoptout) in your browser. This completely prevents GA from tracking your visits.

### Option 4: Custom Debug Parameter

Our implementation already supports debug mode. Add `?debug_mode=true` to any URL:
- Events will appear in DebugView but NOT in production reports
- Useful for testing event tracking without polluting data

### Option 5: Browser Profile

Use a separate browser profile for development that has:
- GA opt-out extension installed
- Or a browser extension that blocks googletagmanager.com

### Recommended Setup

For best results, combine these approaches:
1. Set up IP-based internal traffic filter for your home/office IPs
2. Use debug_mode when actively testing analytics
3. Install the opt-out extension in your development browser

## Troubleshooting

### Events not appearing

1. Check that measurement ID is set in environment variables
2. Verify gtag.js loaded (check Network tab for googletagmanager.com)
3. Use DebugView to see real-time events
4. Check browser console for errors

### Cross-domain tracking not working

1. Verify both domains are configured in GA4 Admin
2. Check that `linker.domains` includes both sites
3. Ensure cookies have `SameSite=None; Secure` flags
4. Test by clicking a link from one site to the other and checking client_id in DebugView

### Page views double-counting

1. Verify `send_page_view: false` in config
2. Check that `usePageTracking` hook is only used once per site

### User properties not appearing

1. User properties appear in Explore, not standard reports
2. They can take 24-48 hours to populate
3. Use DebugView to verify they're being set

## GA4 Reports

### Recommended Reports

1. **Engagement > Events** - See all tracked events
2. **Monetization > Ecommerce purchases** - Credit package purchases
3. **User > User attributes** - User property distribution
4. **Explore > Funnel exploration** - Create delegation/purchase funnels

### Custom Funnel: Delegation Flow

Create a funnel with these steps:
1. `delegate_wizard_open`
2. `wallet_connect_attempt`
3. `wallet_connected`
4. `delegation_started`
5. `delegation_completed`

### Custom Funnel: Purchase Flow

Create a funnel with these steps:
1. `credit_package_view`
2. `checkout_begin`
3. `purchase_complete`
