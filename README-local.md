# Violet Enterprise — Local / LAN Setup Guide

Run the full Violet Enterprise POS system on your own computer or server. No internet required after the initial setup. Any phone, tablet, or PC on the same Wi-Fi or wired network can then use the system by opening a browser.

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

Log in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you set in Step 2.

---

## Stopping and restarting

- **Stop:** Press `Ctrl+C` in the terminal, or run `docker compose down`
- **Start again:** Run `docker compose up` (no `--build` needed after the first time)
- **Start in background:** Run `docker compose up -d` — the system runs without a terminal window

---

## Backing up your data

Your data is stored in a Docker volume named `violet_db_data`. To back it up:

```bash
docker run --rm -v violet_db_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/violet-backup-$(date +%Y%m%d).tar.gz -C /data .
```

To restore from a backup:

```bash
docker run --rm -v violet_db_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/violet-backup-YYYYMMDD.tar.gz -C /data
```

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
| Can't connect from another device | Make sure they're on the same Wi-Fi/network. Try disabling the server's firewall temporarily. |
| Port 80 already in use | Edit `docker-compose.yml` and change `"80:80"` to `"8088:80"`, then access via `http://192.168.x.x:8088` |
| Forgot admin password | Run `docker compose exec api node /app/seed.mjs` after updating `ADMIN_PASSWORD` in `.env` |
| Want to reset all data | Run `docker compose down -v` (⚠️ deletes all data), then `docker compose up --build` |
