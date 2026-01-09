# Nginx Proxy Manager Configuration
## Cardano API Service Platform

Configure NPM to route traffic from api.nacho.builders and app.nacho.builders to the API platform on VLAN 170.

---

## Prerequisites

- VLAN 170 created in UniFi
- ens20 configured on NPM VM (192.168.170.5)
- Can ping 192.168.170.1 from NPM VM
- cardano-gateway VM (192.168.170.10) is running

---

## Step 1: Access Nginx Proxy Manager

Open your browser and navigate to:

```
http://192.168.150.224:81
```

Login with your NPM credentials.

---

## Step 2: Add Proxy Host for API Gateway

Click **Hosts → Proxy Hosts → Add Proxy Host**

### Details Tab

```
Domain Names:     api.nacho.builders
Scheme:           http
Forward Hostname/IP: 192.168.170.10
Forward Port:     8000
Cache Assets:     No
Block Common Exploits: Yes
Websockets Support: Yes    ◄─ IMPORTANT: Must be enabled for Ogmios
```

### SSL Tab

```
SSL Certificate:  Request a new SSL Certificate
Force SSL:        Yes
HTTP/2 Support:   Yes
HSTS Enabled:     Yes
HSTS Subdomains:  No

Let's Encrypt:
  Email:          your-email@example.com
  Agree to ToS:   Yes
```

### Advanced Tab

Add this custom Nginx configuration for proper WebSocket handling:

```nginx
# WebSocket support for Ogmios
location /v1/ogmios {
    proxy_pass http://192.168.170.10:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}

# Regular HTTP endpoints
location / {
    proxy_pass http://192.168.170.10:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Click **Save**

---

## Step 3: Add Proxy Host for Web Application

Click **Add Proxy Host** again

### Details Tab

```
Domain Names:     app.nacho.builders
Scheme:           http
Forward Hostname/IP: 192.168.170.10
Forward Port:     3000
Cache Assets:     No
Block Common Exploits: Yes
Websockets Support: No
```

### SSL Tab

```
SSL Certificate:  Request a new SSL Certificate
Force SSL:        Yes
HTTP/2 Support:   Yes
HSTS Enabled:     Yes

Let's Encrypt:
  Email:          your-email@example.com
  Agree to ToS:   Yes
```

### Advanced Tab (Optional)

If you want to add security headers:

```nginx
# Security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "no-referrer-when-downgrade" always;
```

Click **Save**

---

## Step 4: Verification

### Check Proxy Hosts List

You should now see:
- api.nacho.builders → 192.168.170.10:8000 (SSL enabled, WebSockets on)
- app.nacho.builders → 192.168.170.10:3000 (SSL enabled)

### Test DNS Resolution

From your workstation:

```bash
# Check DNS resolves to your WAN IP
dig api.nacho.builders +short
dig app.nacho.builders +short

# Should return your public WAN IP
```

### Test Internal Connectivity (from NPM VM)

```bash
ssh <user>@192.168.150.224

# Test connection to gateway VM
curl -I http://192.168.170.10:8000
curl -I http://192.168.170.10:3000

# You'll get connection refused until services are running, but this verifies network routing
```

---

## Traffic Flow Visualization

```
Internet User
    │
    ▼
HTTPS Request to api.nacho.builders:443
    │
    ▼
Your WAN IP (via UniFi port forward)
    │
    ▼
Nginx Proxy Manager (192.168.150.224)
    │
    ├─ TLS Termination (Let's Encrypt)
    ├─ Domain routing based on SNI
    │
    └─► ens20 (192.168.170.5)
        │
        ▼
    VLAN 170 Internal Network
        │
        ▼
    cardano-gateway (192.168.170.10)
        │
        ├─ Kong Gateway (port 8000)
        └─ Next.js App (port 3000)
```

---

## Troubleshooting

### SSL Certificate Generation Fails

**Issue:** Let's Encrypt can't validate domain

**Check:**
1. DNS records point to your WAN IP
2. Port 443 forwards to NPM (192.168.150.224)
3. No firewall blocking port 80 (needed for ACME challenge)

**Fix:**
```bash
# Test from external service
curl -I https://api.nacho.builders
```

### Can't Reach 192.168.170.10 from NPM

**Check:**
1. ens20 is up: `ip link show ens20`
2. ens20 has IP: `ip addr show ens20`
3. Can reach gateway: `ping 192.168.170.1`

**Fix:**
```bash
# Verify netplan applied
sudo netplan status
```

### WebSocket Connections Failing

**Check:**
1. WebSockets enabled in proxy host
2. Custom nginx config is applied
3. No timeout issues

**Test:**
```bash
# Test WebSocket upgrade (once Ogmios is running)
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: test" \
     https://api.nacho.builders/v1/ogmios
```

---

## Security Notes

- All backend services run on plain HTTP (no SSL overhead)
- NPM handles TLS termination with Let's Encrypt certificates
- Internal VLAN 170 traffic is not encrypted (trusted network)
- Inter-VLAN traffic controlled by UniFi firewall rules

---

**Status:** NPM configured and ready to route traffic to API platform






