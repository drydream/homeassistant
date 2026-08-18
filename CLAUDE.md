# CLAUDE.md

## AI Directives

- Act as expert. Skip basic HA/Docker/YAML/Git explanations.
- Concise output. Explain only what changed. No snippet omissions when modifying code.
- Language: adapt to context (match user's language). Identifiers: `english_snake_case`.
- **Token discipline — always try the cheapest path first.** MCP tool → SSH+python patch on `.storage/*` (server-side, file contents never enter context) → browser automation last. Never round-trip a whole dashboard config through context to change one field. `claude-in-chrome` only for things with no API/file path (e.g. creating a user account).

## Deep-dive docs (read on demand, not preloaded)

| Topic | File |
|-------|------|
| IR blasters, tinytuya, bedroom AC | `docs/tuya-ir.md` |
| Zigbee IEEE→name map, Z2M config | `docs/zigbee-devices.md` |
| My List app + dashboard | `docs/mylist.md` |
| Weekly plugin update check | `docs/plugin-update-check.md` |

## Current Focus

- [ ] Update Calendar dashboard

## Project

HA 2026.7.4 (Docker, Synology NAS). Host `/volume1/docker/homeassistant` → Container `/config`

## MCP Tools (prefer over raw SSH)

- **hass-mcp** (`mcp__hass-mcp__*`): full REST — entities, `call_service_tool`, history, `get_error_log`, `search_entities_tool`, dashboard get/set. Primary.
- **nas-mcp** (`mcp__nas-mcp__*`, `tools/nas_mcp.py`): SSH wrapper — `ha_exec`, `ha_logs`, `ha_validate_config`, `container_action` (arg is `name=`, not `container=`), `nas_exec`. Use `ha_exec` for `.storage` patch scripts.
- **HA MCP** (`mcp__homeassistant__*`): states + Assist actions via `/api/mcp`. Lightest for simple state checks.

## SSH / Docker

NAS `drydream@192.168.1.170` (uid 1026, gid 100), passwordless sudo via `/etc/sudoers.d/drydream-docker`. Must use full path `/usr/local/bin/docker` for sudo. No SCP — transfer via base64: `echo '<b64>' | base64 -d > /tmp/file`. Container runs as root, so files it writes land root-owned — `chown 1026:100` to match siblings under `www/`.

```bash
# Claude Code SSH (Bash tool)
/c/Windows/System32/OpenSSH/ssh.exe -i /c/Users/DryDrEaM_Champ/.ssh/id_ed25519 -o StrictHostKeyChecking=no drydream@192.168.1.170 "sudo /usr/local/bin/docker exec homeassistant <cmd>"

# Validate config
sudo /usr/local/bin/docker exec homeassistant python -m homeassistant --script check_config -c /config

# Restart
sudo /usr/local/bin/docker compose -f /volume1/docker/homeassistant/docker-compose.yml restart homeassistant

# HA version update — stop+rm BEFORE up, never recreate via plain `up -d`.
# (compose recreate renames old container to <id>_homeassistant transiently → Synology
# Container Manager UI caches the stale name → "container does not exist" on click)
sudo /usr/local/bin/docker compose -f /volume1/docker/homeassistant/docker-compose.yml pull homeassistant
sudo /usr/local/bin/docker stop homeassistant && sudo /usr/local/bin/docker rm homeassistant
sudo /usr/local/bin/docker compose -f /volume1/docker/homeassistant/docker-compose.yml up -d homeassistant
# If stale name already appears in UI: sudo /usr/syno/bin/synopkg restart ContainerManager
```

**After any image update: prune old images (mandatory) + bump the Services table.**
```bash
sudo /usr/local/bin/docker rmi <repo>:<old_tag>     # old versioned tags first
sudo /usr/local/bin/docker image prune -f           # then dangling <none>
```

**Synology Container Manager keeps its own project registry, separate from Docker.** SSH-created compose projects run fine and show in `docker compose ls`, but stay invisible in the CM GUI until imported: Project → Create → path to existing folder → "Use existing docker-compose.yml". Registered: `homeassistant`. Imported later (2026-08-01): `cloudflare`, `vaultwarden`, `nut`. Still SSH-only: `myprivatelist`.

## Services

| Service | Version | Notes |
|---------|---------|-------|
| homeassistant | 2026.7.4 | host network |
| zigbee2mqtt | 2.13.0 | localhost:1883 |
| emqx | 6.2.2 | MQTT broker, host network. Built-in DB SHA256 auth, ACL `drydream` full + `{deny,all}` fallback, `no_match=deny`, TCP 1883. Dashboard `:18083` |
| node-red | 4.1.8-22 | port 1880 |
| matter-server / homebridge | latest | |
| cloudflared | 2026.7.3 | `/volume1/docker/cloudflare`, token in `.env`, `network_mode: host` — **required**, HA trusted_proxies only allows `192.168.1.170` |
| vaultwarden | latest | `/volume1/docker/vaultwarden`, port 8222, `https://password.drydream.work`. Backup sidecar → `/volume1/container_backup/vaultwarden`, 14-day retention |
| nut | 2.8.2 (self-built) | `/volume1/docker/nut`, UPS monitor, `build: .` (alpine:3.20) — rebuilds on every CM project (re)create |

## Git

Remote `https://github.com/drydream/homeassistant` (named `github`, not `origin`). `core.sshCommand = C:/Windows/System32/OpenSSH/ssh.exe`. History rewrite fails on Windows (colon in a dwains-dashboard filename) — use an orphan branch. `secrets.yaml` gitignored.

## Devices

- Tuya / Zigbee lights & switches; Zigbee gate relay (4s script); Roborock vacuum; Mitsubishi washer
- **tuya_local** (3 entries, IP embedded in config entry): Gate controller `.106`, พัดลมห้องนอน `.184`, Energy meter `.112` — all 3 have DHCP static lease bound on router since 2026-08-18 (was silent-breakage risk if router reassigned IP)
- LG WebOS TV `media_player.lg_webos_tv_65un7200ptf`; Google Calendar; Telegram bot; TTS (Google, Thai)
- **IR blasters / bedroom AC** → `docs/tuya-ir.md`
- **DryDrEaM PC** (`192.168.1.186`): wake `switch.drydream_pc` (WoL, MAC `30:56:0F:1A:0E:B7`); shutdown `shell_command.shutdown_drydream_pc` (SSH key `/config/.ssh/id_ed25519`, pubkey at `C:\ProgramData\ssh\administrators_authorized_keys`); status `binary_sensor.192_168_1_185` (Ping — host is actually `.186`)
- **Tapo C225 living room** (`192.168.1.173`, SS cam ID 1): motion via SS webhook → `input_boolean.living_room_motion` + `timer.living_room_motion` (5min) → `living_room_no_motion_notify` after 30min off with lights on

**Cameras** (Synology Surveillance Station, ONVIF) — 2/2 free licenses used, both recorded to `/volume1/surveillance/<name>/`, 30-day retention:
- `camera.living_room` — SS proxy for the C225. **The dashboard card entity** (snapshot-only more-info, matches carport style)
- `camera.living_room_native` — Tapo direct integration for the same C225 (live video, not on any dashboard)
- `camera.carport` — Tapo C320WS (`192.168.1.111`, device_id `98:25:4a:e4:bb:d5`) via SS ONVIF port 2020
- Cards live under sections "ห้องนั่งเล่น" / "รั้ว/ประตู" in `dashboard-home` + `responsive-ui`

## YTMD

PC `192.168.1.186:9863`. Token in `secrets.yaml` key `ytmd_token` (no Bearer prefix).
Sensors (10s): `sensor.youtube_music{,_title,_artist,_album,_thumbnail,_duration,_progress}` — states `playing|paused|buffering|idle`
Commands: `rest_command.ytmd_{play_pause,next,previous,volume_up,volume_down,mute}`
Re-auth: POST `/api/v1/auth/requestcode` → user clicks Allow → POST `/api/v1/auth/request` → token

## Users & Dashboard Access

| User | ID (prefix) | Role |
|------|-------------|------|
| drydream | `a349a209…` | Owner |
| Naey (`rella`) | `1e2b9c15…` | Users |
| kanomjang | `970a8a37…` | Users, restricted |

`kanomjang` sees only `/dashboard-gate` ("รั้ว/ประตู" — gate + lock + open/close/stop/nudge, no camera). Built from: `visible:` on every view of every other dashboard listing only drydream+Naey; `default_panel: dashboard-gate` in `.storage/frontend.user_data_970a8a37…`; sidebar hidden via kiosk-mode `user_settings` scoped to `kanomjang` (dashboard-level `kiosk_mode:` key in `lovelace.dashboard_gate`).

⚠️ **`visible:` is cosmetic, not access control.** HA docs: *"This is only for the display of the tabs. The URL path is still accessible."* Any logged-in user can reach any dashboard by typing its URL, and the auto-generated `/lovelace` Overview still lists every entity. HA has no per-user entity ACL. This is UX separation for a trusted household member, not a security boundary.

Scope kiosk-mode with `user_settings` (matches **display name**, not username), never a bare `hide_sidebar: true` — unscoped it also traps admins, who then get no sidebar and no visible views on that dashboard.

Resource `/local/community/kiosk-mode/kiosk-mode.js` — manual install, not HACS, no cache-bust param (hard-refresh after any update). New `.storage` resource registrations and `frontend.user_data` files need an **HA restart**; they are read into memory at boot.

## Calendar

`/dashboard-calendar` (views `calendar` + `manage`). Source `calendar.drydream_event_s`, sensor `sensor.calendar_events_list`. Scripts: `add_calendar_note`, `delete_calendar_event`, `load_event_for_edit`

## Conventions & UI

- Timezone Asia/Bangkok. Mixed Thai/English naming. Presence → lighting. MQTT via Z2M → EMQX. Utility meters enabled.
- Scripts: `action_object` pattern. `mode: single` default; `restart` for motion lights.
- Mushroom Cards + Layout Card, mobile portrait. No default Lovelace cards.

## Guardrails

- Workflow: edit YAML → validate → reload domain (restart only if required).
- `.storage/`: state the plan first, back up the file before any change. Prefer the WebSocket/REST API over direct file edit; direct edit via SSH+python JSON when there's no API path or when the API would waste context (stop HA first if the file is hot). **Never touch `auth*` / `*credentials*`.**
- `color_temp` → `color_temp_kelvin` (2026.3+)
- `panel_iframe` removed 2024.5 → use a `type: iframe` card + `type: panel` view
- Ignore the pre-existing webostv "Unable to turn on" warning in config check
- **`.storage/` is gitignored** — its `.bak*` files are the *only* version history for dashboards and the entity registry. hass-mcp's own dashboard backups do not persist (`list_dashboard_backups` returns empty), and HA native backups in `/config/backups/*.tar` are full-system snapshots taken rarely. Never delete a `.bak` outright: archive it first.
- Cleaned 2026-08-10 — 37 loose `.bak*`/`.corrupt*` files (6.7MB) rolled into `/config/backups/storage-bak-archive-20260810.tar.gz` (551KB) and removed. Repeat that pattern (tar → verify with a diff against an original → delete) when they pile up again.
