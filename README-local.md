# Violet Enterprise — Local / LAN Setup Guide

Run the full Violet Enterprise POS system on your own computer or server. The server needs internet access whenever a user signs in so Violet can verify the account license. After sign-in, phones, tablets, and PCs on the same Wi-Fi or wired network can use the system by opening a browser.

## How the local server works

One computer runs the complete Violet server for the store. Its PostgreSQL database and persistent file volume are the authoritative copy of all store information. Cashier computers, tablets, and phones are clients: they open the address of that one server and never create separate store databases.

```text
Cashier browsers and Violet clients
                |
                v
      Store's local Violet server
        |                    |
        v                    v
  PostgreSQL data      Persistent files
        |
        v
Central Violet license service (license information only)
```

Products, inventory, customers, employees, sales, settings, and receipt records are saved by the server. Cashier devices may cache versioned JavaScript, CSS, fonts, and images for performance, but API responses and the application entry page are not treated as permanent copies.

The local server—not each cashier device—contacts the hosted Violet licensing service. Store records are not uploaded to the licensing service.

---

## What you need

| Requirement | Notes |
|---|---|
| A computer to act as the server | Windows 10/11, macOS 12+, or Linux. Doesn't have to be powerful — a basic desktop or mini PC works. |
| Docker Desktop | Free. Download at [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| The Violet Enterprise files | This folder you're reading from. |

---

## One-time setup (takes about 5 minutes)

### Step 1 — Install Docker Desktop

Go to [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) and download the version for your operating system. Follow the installer. Once installed, make sure it shows **"Docker Desktop is running"** in the system tray.

### Step 2 — Create your configuration file

In the Violet Enterprise folder, find the file called **`.env.example`**. Make a copy of it and rename the copy to **`.env`** (remove the `.example` part).

Open the `.env` file in any text editor (Notepad, TextEdit, VS Code, etc.) and fill in:

```
SESSION_SECRET=    ← Paste a long random string here (see below)
ADMIN_EMAIL=       ← Your email address (this becomes your login)
ADMIN_PASSWORD=    ← Choose a strong password
POSTGRES_PASSWORD= ← Choose a database password (can be anything random)
VIOLET_LICENSE_SERVER_URL= ← HTTPS URL of the Violet cloud licensing service
```

**How to generate a SESSION_SECRET:**

- On Windows: open PowerShell and run:
  ```
  -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
  ```
- On macOS/Linux: open Terminal and run:
  ```
  openssl rand -hex 32
  ```
- Or just type 64 random characters — letters and numbers, no spaces.

> ⚠️ **Important:** The system will refuse to start if `SESSION_SECRET` is empty or shorter than 32 characters. This protects your data.

Use the same Violet cloud account email and password for `ADMIN_EMAIL` and `ADMIN_PASSWORD` that owns the license. The local server uses those credentials only to perform the online sign-in verification; it does not receive Whop credentials.

Set `VIOLET_LICENSE_SERVER_URL` to the published HTTPS URL for your Violet cloud application. Do not use the local LAN address here.

Leave `DATABASE_URL` and `PORT` as they are — they are already set correctly for Docker.

### Step 3 — Start the system

Open a terminal (Command Prompt, PowerShell, or Terminal) in the Violet Enterprise folder and run:

```
docker compose up --build
```

The first time, this downloads everything and builds the system. It takes 3–10 minutes depending on your internet speed. You will see a lot of output — that's normal. When it finishes you'll see:

```
✅  Seed complete
▶  Starting Violet Enterprise API...
```

### Step 4 — Open the app

Open any browser on the server computer and go to:

```
http://localhost
```

To use it from **another device on your network** (phone, tablet, another PC):

1. Find the server computer's local IP address:
   - **Windows:** Open Command Prompt → type `ipconfig` → look for `IPv4 Address` (usually `192.168.x.x`)
   - **macOS:** System Settings → Network → click your connection → look for the IP
   - **Linux:** `ip addr show` in terminal
2. On the other device, open a browser and go to `http://192.168.x.x` (replace with the actual IP)

Log in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you set in Step 2. An internet connection is required for this sign-in. If the account is cancelled, expired, suspended, refunded, or cannot be verified, Violet will not open the POS.

Bookmark this same server address on every cashier device. Do not run a separate Docker stack on each register: doing so creates separate databases that cannot share live stock or sales.

For a stable address, reserve the server computer's IP address in the router or give it a local DNS name such as `violet-store.local`. If clients connect outside the trusted store network, use HTTPS and a firewall or VPN rather than exposing port 80 directly to the internet.

---

## Stopping and restarting

- **Stop:** Press `Ctrl+C` in the terminal, or run `docker compose down`
- **Start again:** Run `docker compose up` (no `--build` needed after the first time)
- **Start in background:** Run `docker compose up -d` — the system runs without a terminal window

---

## Backing up your data

Violet stores canonical data in two Docker volumes:

- `violet_db_data` — products, inventory, customers, employees, sales, receipts, and settings.
- `violet_api_data` — uploaded or generated server files. Release packages currently live under `platform-releases/`.

Back up both volumes. Database records and files should be captured together so their references stay consistent:

```bash
docker compose stop api web
docker run --rm \
  -v violet_db_data:/source/db:ro \
  -v violet_api_data:/source/files:ro \
  -v "$(pwd)":/backup \
  alpine tar czf /backup/violet-backup-$(date +%Y%m%d).tar.gz -C /source .
docker compose start
```

To restore from a backup:

```bash
docker compose down
docker run --rm \
  -v violet_db_data:/restore/db \
  -v violet_api_data:/restore/files \
  -v "$(pwd)":/backup \
  alpine sh -c 'cd /restore && tar xzf /backup/violet-backup-YYYYMMDD.tar.gz'
docker compose up -d
```

Keep backups on a different physical disk or encrypted backup service. Test restoring a backup periodically. Generated exports downloaded to a cashier device are convenience copies; the server database remains authoritative.

---

## Network outages and checkout recovery

Violet only records a sale after the local server confirms it. A cashier browser does not independently reduce stock or issue a final receipt.

- If the internet is unavailable but the LAN server and current license session are available, registers continue talking to the local server.
- If the LAN connection or local server fails during checkout, Violet keeps the cart open and reports that the sale was not confirmed.
- Press **Complete Payment** again after connectivity returns. Violet reuses the checkout's idempotency key, so a response lost in transit cannot create a duplicate sale or reduce stock twice.
- Do not start a second replacement transaction until the original retry has been resolved.
- Violet does not silently queue finalized card or cash sales on disconnected cashier devices. This avoids accepting payment against stale inventory or an already-closed register shift.
- After restoring the server, retry the checkout and confirm the returned receipt number before handing over a receipt.

All stock validation, shift validation, pricing, tax calculation, role checks, and plan enforcement occur on the server at the moment it commits the sale.

---

## Subscription tiers

Violet Enterprise keeps the full subscription tier system even when self-hosted. The tiers are:

| Plan | Price | Products | Customers | Users |
|---|---|---|---|---|
| Free | One-time | 250 | 500 | 2 |
| Starter | $49/mo | 2,000 | 2,000 | 5 |
| Professional | $129/mo | 10,000 | 10,000 | 20 |
| Enterprise | Custom | Unlimited | Unlimited | Unlimited |

As the platform admin, you can adjust plan limits and prices from the **Admin → Plans** section.

---

## License verification

Every local sign-in is checked against the hosted Violet licensing service. The hosted service verifies the Violet account and, for paid plans, refreshes the Whop membership before allowing access.

The local server also rechecks the license while users are active. A temporary network outage does not bypass the sign-in requirement: users must reconnect to the internet and sign in again if the online license session expires.

---

## HTTPS (optional but recommended for production)

The system runs on plain HTTP by default. For production use — especially if you're accessing it over the internet — you should put a reverse proxy in front of it with HTTPS.

A quick way to do this is with [Caddy](https://caddyserver.com/):

```caddyfile
yourdomain.com {
    reverse_proxy localhost:80
}
```

Caddy automatically handles free SSL certificates from Let's Encrypt.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `SESSION_SECRET is not set` error | Open `.env` and make sure SESSION_SECRET is a long random string (32+ characters) |
| Can't connect from another device | Make sure both devices are on the same network and that the server firewall allows inbound TCP traffic on the configured web port. Do not leave the firewall disabled. |
| Port 80 already in use | Edit `docker-compose.yml` and change `"80:80"` to `"8088:80"`, then access via `http://192.168.x.x:8088` |
| Forgot admin password | Run `docker compose exec api node /app/seed.mjs` after updating `ADMIN_PASSWORD` in `.env` |
| Want to reset all data | Run `docker compose down -v` (⚠️ deletes all data), then `docker compose up --build` |
