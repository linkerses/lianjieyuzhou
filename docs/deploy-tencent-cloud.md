# Tencent Cloud API Deployment

This document records the V0.2 MVP deployment path used for the production API.

## Current Production Endpoint

- API base: `https://api.linkerses.com/api`
- Health check: `https://api.linkerses.com/api/health`
- Server public IP: `81.70.23.202`
- Domain: `api.linkerses.com`
- Runtime: Ubuntu 24.04, Node.js 22, PM2, nginx, Certbot

## Local Client Configuration

The following clients point to production:

- `dashboard.html`: `const API = 'https://api.linkerses.com/api';`
- `apps/miniapp/app.js`: `const API_BASE = 'https://api.linkerses.com/api';`

## Initial Server Setup

Run on the Tencent Cloud server as `root`.

```bash
apt update
apt install -y ca-certificates curl gnupg git nginx

curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pm2

node -v
npm -v
```

Expected Node version: `v22.x`.

## Deploy Code Without GitHub Access

The Tencent Cloud server could not reach GitHub over port 443 during this deployment. The workaround is to upload a local archive.

On the local Windows machine:

```powershell
cd D:\BaiduSyncdisk\myobsidian\obsidian\lianjie-agent
git archive --format=tar --output "$env:TEMP\lianjie-agent.tar" HEAD
scp "$env:TEMP\lianjie-agent.tar" root@81.70.23.202:/tmp/lianjie-agent.tar
```

On the server:

```bash
rm -rf /opt/lianjie-agent
mkdir -p /opt/lianjie-agent
tar -xf /tmp/lianjie-agent.tar -C /opt/lianjie-agent

cd /opt/lianjie-agent/apps/api
npm ci
npm run build
```

## Environment Variables

Create `/opt/lianjie-agent/apps/api/.env` on the server.

Do not commit real secrets.

```env
SUPABASE_URL=https://hxqrocgtmeydppsdquiz.supabase.co
SUPABASE_SERVICE_KEY=<set-production-service-role-key>
WECHAT_APP_ID=dev_placeholder
WECHAT_APP_SECRET=dev_placeholder
PORT=3001
NODE_ENV=production
```

## Start API With PM2

```bash
cd /opt/lianjie-agent/apps/api

pm2 delete lianjie-api 2>/dev/null || true
pm2 start npm --name lianjie-api -- run start
pm2 save

pm2 status
pm2 logs lianjie-api --lines 80 --nostream
curl -i http://127.0.0.1:3001/api/health
```

The local health check must return `HTTP/1.1 200 OK`.

Optional boot persistence:

```bash
pm2 startup systemd -u root --hp /root
pm2 save
```

## nginx HTTP Configuration

```bash
cat > /etc/nginx/sites-available/lianjie-api <<'EOF'
server {
    listen 80;
    server_name api.linkerses.com;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/lianjie-api /etc/nginx/sites-enabled/lianjie-api
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

DNS record:

- Host: `api`
- Type: `A`
- Value: `81.70.23.202`

Tencent Cloud security group inbound rules:

- `TCP:80` from `0.0.0.0/0`
- `TCP:443` from `0.0.0.0/0`

## HTTPS With Certbot

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d api.linkerses.com
```

During Certbot setup:

- Enter an operational email address.
- Accept the terms.
- Decline optional EFF email sharing if desired.
- Enable HTTP to HTTPS redirect if prompted.

Verify:

```bash
curl -i https://api.linkerses.com/api/health
ss -lntp | grep ':443'
nginx -t
```

## Production Smoke Test

Run from the local repository:

```powershell
node scripts/smoke-production-api.mjs
```

To target another API base:

```powershell
$env:API_BASE='https://api.linkerses.com/api'
node scripts/smoke-production-api.mjs
```

Current smoke coverage:

- `GET /api/health`
- `POST /api/auth/wechat-login` with `code=dev_mode`
- `GET /api/agents/me`
- `GET /api/services`
- `GET /api/services/:id`
- `GET /api/skills/definitions`
- `GET /api/skills/mine`
- `GET /api/trust/my-score`
- `GET /api/trust/network/mine`
- `GET /api/transactions/mine`
- `POST /api/pre-enact/recommend`

The smoke test avoids transaction creation and feedback submission to avoid polluting production data.

## Operations Checklist

Server-side checks:

```bash
pm2 status
pm2 logs lianjie-api --lines 100 --nostream
ss -lntp | grep ':3001'
ss -lntp | grep ':443'
curl -i http://127.0.0.1:3001/api/health
curl -i https://api.linkerses.com/api/health
nginx -t
systemctl status nginx --no-pager
certbot renew --dry-run
df -h
```

Local checks:

```powershell
curl.exe -i https://api.linkerses.com/api/health
node scripts/smoke-production-api.mjs
```

## Common Failure Modes

### `curl https://api.linkerses.com/api/health` times out from local machine

Check Tencent Cloud security group rules for `TCP:443`.

### nginx returns `502 Bad Gateway`

Check the Node process:

```bash
pm2 status
ss -lntp | grep ':3001'
curl -i http://127.0.0.1:3001/api/health
pm2 logs lianjie-api --lines 100 --nostream
```

### Server cannot pull from GitHub

Use the archive upload path documented above.

### `https://81.70.23.202/...` fails

Expected. HTTPS is configured for `api.linkerses.com`, not the raw IP address.
