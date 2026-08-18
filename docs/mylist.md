# My List

Self-hosted on the NAS (migrated off Vercel+Supabase; branch `feat/selfhost-sqlite`, not merged to `main`).

- Container: `/volume1/docker/myprivatelist`, port `3210`
- Data: SQLite `./data/list.db` — sole data store, **no backups yet**
- Redeploy: `git pull && docker compose up -d --build` in that dir
- **No auth — LAN + Tailscale only, never expose publicly**
- Not registered in the Synology Container Manager GUI (SSH-only project)

## Dashboard

`/dashboard-mylist` — YAML mode, `dashboards/mylist/mylist.yaml`.

Iframe URL is `https://drydream-rella.tail287113.ts.net/home` — Tailscale HTTPS is **required**; plain LAN HTTP gets mixed-content-blocked because HA is served over HTTPS. LAN-only access for a browser: `http://192.168.1.170:3210/home`.

The Tailscale proxy (`tailscale serve --bg --https=443 3210`) is NAS-level config, not in this repo. Needs root, run manually by the user; reconfigure if the port or tailnet node name changes.

The iframe card sets `disable_sandbox: true`. Without it, HA sandboxes the iframe with `allow-popups` but no `allow-popups-to-escape-sandbox`, so `target="_blank"` links (e.g. YouTube links in item URLs) open as sandboxed/opaque-origin popups and get `ERR_BLOCKED_BY_RESPONSE` from sites enforcing COOP.

## Elsewhere

- Local dev: `D:\claude-workspace\myprivatelist`
- Retired, pending teardown: Vercel `https://mydrydreamlistnew.vercel.app/`, GitHub `https://github.com/drydream/mydrydreamlist`, Supabase
