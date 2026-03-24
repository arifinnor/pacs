# 07 — Auth & Security

## Security layers in this stack

```
Internet
    |
[nginx]  — TLS termination, port 443
    |      — blocks direct access to port 8042
    |      — rate limiting
    |
[Orthanc authorization plugin]  — validates JWT on every request
    |
[Orthanc]  — also has basic auth as fallback
    |
[PostgreSQL]  — internal network only, no external exposure
```

---

## Layer 1: nginx reverse proxy + TLS

### nginx/nginx.conf

```nginx
events {
  worker_connections 1024;
}

http {
  # Rate limiting
  limit_req_zone $binary_remote_addr zone=pacs:10m rate=30r/s;

  upstream orthanc {
    server orthanc:8042;
  }

  upstream ohif {
    server ohif:80;
  }

  # Redirect HTTP → HTTPS
  server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
  }

  server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;

    # Orthanc REST API + DICOMweb
    location /orthanc/ {
      limit_req zone=pacs burst=50 nodelay;

      rewrite ^/orthanc/(.*) /$1 break;
      proxy_pass http://orthanc;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;

      # Large DICOM files — increase timeouts and body size
      proxy_read_timeout 300s;
      proxy_send_timeout 300s;
      client_max_body_size 500M;
    }

    # OHIF viewer
    location /viewer/ {
      proxy_pass http://ohif/;
      proxy_set_header Host $host;
    }

    # Next.js app
    location / {
      proxy_pass http://nextjs:3000;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
    }
  }
}
```

Add nginx to docker-compose.yml:
```yaml
  nginx:
    image: nginx:alpine
    container_name: nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    depends_on:
      - orthanc
      - ohif
    restart: unless-stopped
```

### TLS certificate options

**Development / self-signed:**
```bash
mkdir -p nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/certs/privkey.pem \
  -out nginx/certs/fullchain.pem \
  -subj "/CN=localhost"
```

**Production with Let's Encrypt (requires a real domain and port 80 accessible):**
```bash
# Use certbot with docker
docker run -it --rm \
  -v ./nginx/certs:/etc/letsencrypt \
  -p 80:80 \
  certbot/certbot certonly --standalone \
  -d your-domain.com \
  --email your-email@domain.com \
  --agree-tos
```

Auto-renewal cron:
```
0 12 * * * docker run --rm -v ./nginx/certs:/etc/letsencrypt certbot/certbot renew --quiet
```

---

## Layer 2: Orthanc authorization plugin

The authorization plugin calls your auth service on every Orthanc request to decide if it should be allowed.

### How it works
1. A request arrives at Orthanc (e.g., `GET /dicom-web/studies`)
2. Orthanc authorization plugin calls your auth service: `POST /auth/validate` with the request details
3. Your auth service returns `{"granted": true}` or `{"granted": false}`
4. Orthanc allows or denies the request

### Orthanc config for authorization plugin

```json
{
  "Authorization": {
    "Enable": true,
    "WebServiceRootUrl": "http://auth-service:8000/",
    "WebServiceTokenHeader": "token",
    "UncheckedResources": [
      "/system",
      "/app/"
    ],
    "CheckedLevel": "studies"
  }
}
```

Via environment variables:
```
ORTHANC__AUTHORIZATION__ENABLE=true
ORTHANC__AUTHORIZATION__WEB_SERVICE_ROOT_URL=http://auth-service:8000/
ORTHANC__AUTHORIZATION__WEB_SERVICE_TOKEN_HEADER=token
```

### Minimal auth service (Next.js API route)

You can implement the auth validation directly in your Next.js app:

```typescript
// app/api/auth/validate/route.ts
// This is what Orthanc calls to check if a request is allowed

import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth/jwt'

interface OrthancAuthRequest {
  dicom?: {
    callingAet?: string
    calledAet?: string
  }
  http?: {
    uri?: string
    method?: string
    headers?: Record<string, string>
  }
  labels?: string[]
  level?: string
  resourceId?: string
  token?: string
}

export async function POST(req: NextRequest) {
  const body: OrthancAuthRequest = await req.json()

  // Check for token in headers or body
  const token =
    body.http?.headers?.['authorization']?.replace('Bearer ', '') ||
    body.token

  // DICOM modality connections are trusted by AE Title
  if (body.dicom?.callingAet) {
    const trustedAets = ['CT1_AET', 'MRI1_AET']
    if (trustedAets.includes(body.dicom.callingAet)) {
      return NextResponse.json({ granted: true })
    }
    return NextResponse.json({ granted: false })
  }

  // HTTP requests need a valid JWT
  if (!token) {
    return NextResponse.json({ granted: false })
  }

  try {
    const payload = await verifyJWT(token)
    // Add role-based checks here as needed
    return NextResponse.json({ granted: true, userId: payload.sub })
  } catch {
    return NextResponse.json({ granted: false })
  }
}
```

---

## Layer 3: audit logging

PMK 24/2022 requires audit trails. Orthanc logs every operation — you need to capture and store them.

### Enable detailed logging in Orthanc

```json
{
  "LogExportedResources": true,
  "Verbose": false
}
```

### Capture Docker logs

```bash
# docker-compose.yml — add logging config to orthanc service
logging:
  driver: "json-file"
  options:
    max-size: "100m"
    max-file: "30"
    labels: "service"
```

### Ship logs to persistent storage

```bash
# Simple: ship to a log file with timestamp
docker compose logs -f orthanc >> /var/log/pacs/orthanc-$(date +%Y%m).log &
```

For production, use a proper log shipper (Filebeat → Elasticsearch, or Loki + Grafana).

---

## Firewall rules (server-level)

```bash
# Allow only necessary ports
ufw allow 22/tcp    # SSH (restrict to known IPs if possible)
ufw allow 80/tcp    # HTTP (redirects to HTTPS)
ufw allow 443/tcp   # HTTPS
ufw allow 4242/tcp  # DICOM — restrict to modality IP range only

# Block direct access to internal ports
ufw deny 8042/tcp   # Orthanc REST — must go through nginx
ufw deny 5432/tcp   # PostgreSQL — internal only

# DICOM port: restrict to hospital network only
ufw allow from 192.168.1.0/24 to any port 4242

ufw enable
```

---

## Security checklist — verify before go-live

- [ ] Port 8042 not accessible from outside the server (`curl http://server-ip:8042` from external machine should fail)
- [ ] Port 5432 not accessible from outside the server
- [ ] HTTPS works: `curl -I https://your-domain.com` shows 200 with TLS headers
- [ ] HTTP redirects to HTTPS: `curl -I http://your-domain.com` shows 301
- [ ] Basic auth on Orthanc still works as fallback (test from nginx container)
- [ ] Authorization plugin rejects requests without valid token
- [ ] DICOM C-STORE works from modality IP (not blocked by firewall)
- [ ] Audit logs are being written and rotated
- [ ] `AuthenticationEnabled: true` confirmed in `docker compose logs orthanc | grep auth`
