# myprivatelist — NAS + HA integration summary

For context handoff to the `Z:\homeassistant` Claude project. Source repo: `D:\claude-workspace\myprivatelist` (branch `feat/selfhost-sqlite`, not yet merged to `main`).

## What changed

- **Migrated off Vercel + Supabase to self-hosted.** App now runs as a Docker container on the NAS, storing data in a single SQLite file instead of a managed Postgres.
- **Auth removed entirely.** Explicit single-user decision — no login screen, no session. This makes it a **LAN + Tailscale-only** app: it must never be exposed to the public internet (no port forwarding, no public reverse proxy/tunnel pointed at it).
- **Home Assistant iframe panel updated.** The existing "My List" sidebar dashboard (`dashboards/mylist/mylist.yaml` in the HA config, YAML-mode Lovelace dashboard registered under `lovelace.dashboards` in `configuration.yaml`) now points at the new self-hosted URL instead of the old Vercel URL.

## Deployment details

- Host: NAS `DryDrEaM_Rella`, LAN IP `192.168.1.170`.
- Container: `docker-compose.yml` in repo, deployed at `/volume1/docker/myprivatelist`, port `3210`, data volume at `./data:/data` (contains `list.db` — this file **is** the entire data store now, no managed backups anymore).
- Redeploy: `git pull && docker compose up -d --build` from that directory.

## Access URLs (both required for HA)

- **Home LAN:** `http://192.168.1.170:3210/home`
- **Anywhere via Tailscale:** `https://drydream-rella.tail287113.ts.net/home`

The HA iframe card uses the Tailscale HTTPS URL (not the LAN one) so the panel also works when viewing HA from outside the home network.

## Gotcha worth knowing for HA-side work

First attempt pointed the iframe at plain `http://drydream-rella:3210/home`. Since HA itself is viewed over HTTPS, the browser silently mixed-content-blocked the plain-HTTP iframe (showed as "unable to load iframe," no other error).

Fix applied: `tailscale serve --bg --https=443 3210` on the NAS (Synology Tailscale package, binary at `/volume1/@appstore/Tailscale/bin/tailscale`, daemon socket `/volume1/@appdata/Tailscale/tailscaled.sock`) — proxies `https://drydream-rella.tail287113.ts.net/` → local port 3210 with a real Tailscale-issued cert.

**This is NAS-level config, not in the myprivatelist git repo.** If this app's port or the NAS's tailnet node name ever changes, `tailscale serve` needs to be reconfigured too. `tailscale serve` needs root, so it was run manually by the user over SSH — not automatable non-interactively on this NAS (sudo requires a password here).

After updating the iframe URL, no HA restart was needed — picked up via the `lovelace.reload` service call.

## Outstanding / not yet done

- Vercel project and Supabase project still exist — slated for deletion once the NAS deployment is confirmed stable.
- Backup strategy for `data/list.db` on the NAS not yet set up.
- `feat/selfhost-sqlite` branch not yet merged to `main` on GitHub (user merges explicitly when ready).

## Known issue in the `Z:\homeassistant` project itself (flagged, not fixed)

Unrelated to this migration, but noticed while cross-referencing NAS access: that project's `.claude/settings.local.json` has the NAS root/sudo password stored in plaintext across multiple permission-rule strings, and its stored SSH key (`Z:\homeassistant\.ssh\id_ed25519`) is no longer authorized on the NAS. Worth cleaning up independently.
