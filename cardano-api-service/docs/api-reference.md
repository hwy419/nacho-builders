# Cardano API Service - API Reference

## Authentication

All API requests require an API key passed in the `apikey` header:

```bash
curl -H "apikey: napi_your_api_key_here" \
  https://api.nacho.builders/v1/ogmios
```

## Base URL

```
https://api.nacho.builders
```

---

## Ogmios WebSocket API

### Endpoint

```
wss://api.nacho.builders/v1/ogmios
```

### Description

Ogmios provides a WebSocket JSON-RPC interface to the Cardano node. Ideal for real-time chain queries and transaction submission.

### Example (JavaScript)

```javascript
const WebSocket = require('ws');

const client = new WebSocket('wss://api.nacho.builders/v1/ogmios', {
  headers: {
    'apikey': 'napi_your_api_key_here'
  }
});

client.on('open', () => {
  // Query chain tip
  client.send(JSON.stringify({
    type: 'jsonwsp/request',
    version: '1.0',
    servicename: 'ogmios',
    methodname: 'Query',
    args: {
      query: 'chainTip'
    }
  }));
});

client.on('message', (data) => {
  console.log('Response:', JSON.parse(data.toString()));
});
```

### Common Queries

- `chainTip` - Get current chain tip
- `currentEpoch` - Get current epoch info
- `ledgerState/utxo` - Query UTxOs by address
- `networkStartTime` - Get network start time

---

## Submit API (REST)

### Endpoint

```
POST https://api.nacho.builders/v1/submit/api/submit/tx
```

### Description

Submit a signed Cardano transaction to the blockchain.

### Request

```bash
curl -X POST https://api.nacho.builders/v1/submit/api/submit/tx \
  -H "apikey: napi_your_api_key_here" \
  -H "Content-Type: application/cbor" \
  --data-binary @transaction.cbor
```

### Response

```json
{
  "txId": "abc123...",
  "status": "submitted"
}
```

### Error Codes

| Code | Description |
|------|-------------|
| 200 | Transaction submitted successfully |
| 400 | Invalid transaction format |
| 401 | Invalid or missing API key |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## GraphQL API (Paid Tier Only)

### Endpoint

```
POST https://api.nacho.builders/v1/graphql
```

### Description

Rich GraphQL interface to query the Cardano blockchain. Powered by Cardano DB-Sync.

### Example Query

```graphql
query {
  blocks(limit: 10, order_by: { slotNo: desc }) {
    hash
    slotNo
    blockNo
    epochNo
    transactionsCount
  }
}
```

### Example (curl)

```bash
curl -X POST https://api.nacho.builders/v1/graphql \
  -H "apikey: napi_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ blocks(limit: 10) { hash slotNo } }"
  }'
```

### Common Queries

- `blocks` - Query blocks by various criteria
- `transactions` - Query transactions
- `addresses` - Get address information
- `ada` - Get ADA supply and statistics
- `epochs` - Query epoch information

---

## Rate Limits

| Tier | Requests/Second | WebSocket Connections |
|------|-----------------|----------------------|
| Free | 10 | 2 concurrent |
| Paid | 100 | 25 concurrent |

Rate limits are enforced per API key. Exceeding limits returns HTTP 429.

---

## Credit Costs

| Endpoint | Credits per Request |
|----------|---------------------|
| Ogmios (simple query) | 1 credit |
| Ogmios (complex query) | 3 credits |
| Transaction submit | 5 credits |
| GraphQL (simple) | 2 credits |
| GraphQL (complex) | 5 credits |
| WebSocket connection | 1 credit/minute |

---

## Error Handling

All endpoints return standard HTTP status codes:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "You have exceeded your rate limit of 10 requests per second",
    "retryAfter": 1000
  }
}
```

### Common Error Codes

- `INVALID_API_KEY` - API key not found or inactive
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INSUFFICIENT_CREDITS` - Not enough credits
- `INVALID_REQUEST` - Malformed request
- `SERVICE_UNAVAILABLE` - Backend service down

---

## Support

- **Community:** Join our Discord server
- **Email:** support@nacho.builders (Paid tier)
- **Status Page:** https://status.nacho.builders

---

## SDKs and Libraries

### JavaScript/TypeScript

```bash
npm install @nacho-builders/cardano-api
```

```typescript
import { NachoAPI } from '@nacho-builders/cardano-api';

const api = new NachoAPI({
  apiKey: 'napi_your_key_here'
});

const tip = await api.queryChainTip();
```

### Python

```bash
pip install nacho-cardano-api
```

```python
from nacho_cardano import NachoAPI

api = NachoAPI(api_key='napi_your_key_here')
tip = api.query_chain_tip()
```

---

For more detailed examples, see our [GitHub repository](https://github.com/nacho-builders/cardano-api-examples).






