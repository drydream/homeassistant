# CLAUDE.md

## AI Directives

- Act as expert. Skip basic HA/Docker/YAML/Git explanations.
- Concise output. Explain only what changed.
- No snippet omissions when modifying code.
- Language: English default. Thai only when requested. Identifiers: `english_snake_case`.
- Storage-mode dashboards: prefer HA UI. Direct `.storage/lovelace*` edit via SSH+Python JSON allowed when requested.
- Think before coding. State assumptions. If unclear, ask.
- Simplicity first. No speculative features or abstractions.
- Surgical changes. Touch only what the request requires.
- Verify success. Plan with verifiable checks per step.

## Current Focus

- [ ] Update Calendar dashboard

## Project

HA 2026.7.4 (Docker, Synology NAS). Host `/volume1/docker/homeassistant` → Container `/config`

## SSH / Docker

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

**After any image update: prune old/unused images (mandatory, every time — no exceptions) + update version in Services table below.**
```bash
sudo /usr/local/bin/docker rmi <repo>:<old_tag>     # old versioned tags no container uses, run first
sudo /usr/local/bin/docker image prune -f           # then dangling <none> layers
```

**Synology Container Manager UI has its own project registry, separate from Docker itself.** A compose file created/run via SSH (`docker compose up -d`) works fine and shows up in `docker compose ls`, but stays invisible in the Container Manager GUI's Project tab until manually imported: Container Manager → Project → Create → set path to the existing folder → "Use existing docker-compose.yml". As of 2026-08-01, `homeassistant` was the only project registered this way in the GUI; `cloudflare`, `vaultwarden`, `nut` were created via SSH and had to be imported after the fact. `myprivatelist` is still SSH-only/unregistered in the GUI.

- **HA MCP server** configured in Claude Code (user scope, `mcp__homeassistant__*`): entity states + Assist actions via `/api/mcp` — prefer over SSH for state checks/service calls.
- **hass-mcp** (user scope, `mcp__hass-mcp__*`, uvx): full REST access — all entities, `call_service_tool`, history, `get_error_log`, `search_entities_tool`. Prefer for anything the Assist MCP can't see.
- **nas-mcp** (user scope, `mcp__nas-mcp__*`, `tools/nas_mcp.py` in this repo, uv run --script): SSH wrapper — `ha_exec`, `ha_logs`, `ha_validate_config`, `container_action`, `nas_exec`. Prefer over raw Bash SSH commands. Raw SSH only as fallback.
- NAS: `drydream@192.168.1.170` — passwordless sudo via `/etc/sudoers.d/drydream-docker`
- Must use full path `/usr/local/bin/docker` (not `docker`) for sudo
- SCP not available on NAS — transfer files via base64: `echo '<b64>' | base64 -d > /tmp/file`

## Services

| Service | Version | Notes |
|---------|---------|-------|
| homeassistant | 2026.7.4 | host network |
| zigbee2mqtt | 2.13.0 | localhost:1883 |
| emqx | 6.2.2 | MQTT broker, host network |
| node-red | 4.1.8-22 | port 1880 |
| matter-server / homebridge | latest | |
| cloudflared | 2026.7.3 | `/volume1/docker/cloudflare` (own compose project, token in `.env`, `network_mode: host` — required, HA trusted_proxies only allows `192.168.1.170`) — was standalone `docker run` w/ token in cmd args, migrated 2026-08-01 |
| vaultwarden | latest | `/volume1/docker/vaultwarden`, port 8222, `https://password.drydream.work` via cloudflared. Backup sidecar → `/volume1/container_backup/vaultwarden` daily, 14-day retention |
| nut | 2.8.2 (self-built) | `/volume1/docker/nut`, UPS monitor, `build: .` (alpine:3.20 base) — rebuilds image on every Container Manager project (re)create |

## EMQX

Auth: built-in DB SHA256. ACL: `drydream` full, `{deny,all}` fallback. `no_match=deny`, TCP 1883. Dashboard: `http://192.168.1.170:18083`

## Zigbee2MQTT

`/volume1/docker/zigbee2mqtt/configuration.yaml` — MQTT: `mqtt://localhost:1883`, Serial: `tcp://192.168.1.171:6638`, ch 25, TX 18, availability 10/1500min, `last_seen: ISO_8601`, `log_level: warning`

## Git

Remote: `https://github.com/drydream/homeassistant` (named `github`, not `origin`). `core.sshCommand = C:/Windows/System32/OpenSSH/ssh.exe` (set). History rewrite fails on Windows (colon in dwains-dashboard filename) — use orphan branch.

## Config Files

`configuration.yaml`, `automations.yaml`, `scripts.yaml`, `scenes.yaml`, `secrets.yaml` (gitignored)

## Devices

- Tuya / Zigbee lights & switches
- Zigbee gate relay (4s script)
- LG WebOS TV: `media_player.lg_webos_tv_65un7200ptf`
- Roborock vacuum, Mitsubishi washer
- Tapo C225 living room (IP `192.168.1.173`, SS cam ID 1): motion via **SS webhook** → `input_boolean.living_room_motion` + `timer.living_room_motion` (5min) → `living_room_no_motion_notify` after 30min off with lights on
- **Cameras (Synology SS, ONVIF)**: `camera.living_room` = SS proxy for C225 (dashboard card entity — snapshot-only more-info, matches carport style, no live video/breadcrumb). `camera.living_room_native` = Tapo direct integration for C225 (live video, community integration, not used on dashboard). `camera.carport` = Tapo C320WS (IP `192.168.1.111`, device_id `98:25:4a:e4:bb:d5`) via SS ONVIF port 2020. Both recorded to `/volume1/surveillance/<name>/`, 30-day retention, 2/2 free SS camera licenses used. Dashboard cards (`dashboard-home`, `responsive-ui`) live under the "ห้องนั่งเล่น" (living_room) and "รั้ว/ประตู" (carport) sections respectively.
- Google Calendar, Telegram bot, TTS (Google, Thai)
- YTMD (PC `192.168.1.186:9863`) — see YTMD section
- DryDrEaM PC: `switch.drydream_pc` (WoL) + `shell_command.shutdown_drydream_pc` (SSH)
- **Bedroom AC IR** HMS06CBU IP `192.168.1.177` device_id `ebb508d08d4b6d9050vjjr`: `shell_command.ac_bedroom_on/off` → `/config/send_ac_ir.py` (3s socket timeout, exits 1 on failure) → tinytuya local. Toggle: `script.toggle_bedroom_ac` checks `binary_sensor.sthaanaae_rh_ngn_n_contact`. Siri/HomeKit: `switch.ae_rh_ngn_n` "แอร์ห้องนอน" (template switch, `unique_id: bedroom_ac_switch`, state from same binary_sensor). `script.toggle_bedroom_ac` excluded from HomeKit to avoid conflict. **No cloud.**
  Reachability: `binary_sensor.bedroom_ir_blaster` (ping integration, config-entry-based). Toggle script + template switch turn_on/turn_off both guard on this sensor first — if offline, push-notify both phones and stop instead of hanging silently. Automation `automation.bedroom_ir_blaster_offline_notify` also alerts if offline >10min / recovered (covers both bedroom + living-room blasters).
  **Known failure mode:** after a power outage, WiFi module can reconnect in a half-alive state (answers UDP broadcast/tinytuya deviceScan, but ARP/unicast dead — `ping`/`errno 113`). Fix: unplug 30-60s (quick replug isn't always enough), recheck `binary_sensor.bedroom_ir_blaster`.
- **Living room IR** HMS06CBU IP `192.168.1.174` device_id `eb888f1616078e8d40oyr6`: still Tuya cloud scenes (not yet migrated). Reachability: `binary_sensor.living_room_ir_blaster`, same offline-notify automation.

## tinytuya / IR Blasters

tinytuya = Python lib (pip dep of tuya_local HACS). Runs inside HA container. IR codes stored in `/config/send_ac_ir.py`.

**Key facts:**
- dp 201 = send IR / enter study mode
- dp 202 = received IR code — arrives via **cloud MQTT only** (not local). `remote.learn_command` always times out. Workaround: check HA debug logs for dp 202 value.
- local_key: get from `iot.tuya.com → Cloud → Devices → Device Detail` (free, no subscription needed)
- Tuya IoT Core API subscription needed only for scene trigger calls — not for local control

**Add new IR device:**
```bash
# Find device
docker exec homeassistant python3 -c "import tinytuya; [print(ip,v['gwId'],v['version']) for ip,v in tinytuya.deviceScan(maxretry=5).items()]"

# Study mode (then press remote, check logs for dp 202)
docker exec homeassistant python3 -c "
import tinytuya,json; d=tinytuya.Device('<id>','<ip>','<key>',version=3.3)
d.set_value(201,json.dumps({'control':'study'}))"
docker logs homeassistant --since 1m 2>&1 | grep 'dpId.*202' -A1

# Send IR
docker exec homeassistant python3 -c "
import tinytuya,json; d=tinytuya.Device('<id>','<ip>','<key>',version=3.3)
d.set_value(201,json.dumps({'control':'send_ir','type':0,'head':'','key1':'1<code>'}))"
```
Add codes to `/config/send_ac_ir.py`, add `shell_command` in `configuration.yaml`, restart HA.

## Zigbee Devices

| IEEE | Name |
|------|------|
| 0x4c97a1fffecfbd11 | ไฟเตียง |
| 0x70b3d52b601208ff | เตาไฟฟ้า |
| 0x70c59cfffe8cce9c | ไฟแถวบนห้องนั่งเล่น |
| 0x70c59cfffe8cce82 | ไฟแถวล่างห้องนั่งเล่น |
| 0xa4c13866c17d9b8f | ปุ่มรั้ว |
| 0xa4c1387470b674ac | ไฟห้องนอน |
| 0x4c97a1fffecf7585 | ห้องน้ำ |
| 0xa4c13870413c4bda | ไฟห้องซักผ้า |
| 0xa4c13850b520fbed | ห้องน้ำชั้นล่าง |
| 0x4c97a1fffed02425 | ไฟบันไดชั้นบน |
| 0xa4c138ba63904305 | พัดลมห้องนั่งเล่น |
| 0xa4c1386801ede789 | motion1 |
| 0xa4c138e7bd3b8865 | สถานะแอร์ห้องนอน |
| 0x0cae5ffffefb206a | ไฟห้องครัว |
| 0x449fdafffe62add1 | ไฟบันไดชั้นล่าง |

## YTMD

PC `192.168.1.186:9863`. Token: `secrets.yaml` key `ytmd_token` (no Bearer prefix).  
Sensors (10s): `sensor.youtube_music{,_title,_artist,_album,_thumbnail,_duration,_progress}` — states: `playing|paused|buffering|idle`  
Commands: `rest_command.ytmd_{play_pause,next,previous,volume_up,volume_down,mute}`  
Re-auth: POST `/api/v1/auth/requestcode` → user clicks Allow → POST `/api/v1/auth/request` → token

## PC Remote Control (`192.168.1.186`)

- Wake: `switch.drydream_pc` (WoL, MAC `30:56:0F:1A:0E:B7`)
- Shutdown: `shell_command.shutdown_drydream_pc` — SSH key at `/config/.ssh/id_ed25519`, public key at `C:\ProgramData\ssh\administrators_authorized_keys`
- Status: `binary_sensor.192_168_1_185` (Ping, host is actually `.186`)
- `custom:button-card` toggle: use top-level JS-template `tap_action` — state-level `tap_action` overrides don't fire

## Conventions

- Timezone: Asia/Bangkok. Mixed Thai/English naming.
- Scripts: `action_object` pattern. `mode: single` default; `restart` for motion lights.
- Presence → lighting. MQTT via Zigbee2MQTT → EMQX. Utility meters enabled.

## UI

Mushroom Cards + Layout Card, mobile portrait. No default Lovelace cards.

## Guardrails

- `.storage/`: state plan first, backup file before any change. Prefer WebSocket API (`config/entity_registry/*` etc.) over direct file edit; direct edit via SSH+Python JSON only if no API path (stop HA first if file is hot). Never touch `auth*`/`*credentials*`.
- Always validate before applying. Restart only if required (prefer domain reload).
- `color_temp` → `color_temp_kelvin` (2026.3+)
- `panel_iframe` removed 2024.5 → use `type: iframe` card + `type: panel` view
- Ignore pre-existing webostv "Unable to turn on" warning in config check

## Workflow

1. Edit YAML → 2. Validate → 3. Reload domain (or restart if needed)

## Calendar

Dashboard: `/dashboard-calendar`. Source: `calendar.drydream_event_s`. Sensor: `sensor.calendar_events_list`. Scripts: `add_calendar_note`, `delete_calendar_event`, `load_event_for_edit`

## My List

Self-hosted on NAS (migrated off Vercel+Supabase, branch `feat/selfhost-sqlite` not yet merged to `main`). Docker container `/volume1/docker/myprivatelist`, port `3210`, SQLite at `./data/list.db` (sole data store, no backups yet). Redeploy: `git pull && docker compose up -d --build` in that dir. **No auth — LAN + Tailscale-only, never expose publicly.**

Dashboard: `/dashboard-mylist` (YAML, `dashboards/mylist/mylist.yaml`). Iframe URL: `https://drydream-rella.tail287113.ts.net/home` (Tailscale HTTPS — plain LAN HTTP gets mixed-content-blocked since HA is HTTPS). LAN-only access: `http://192.168.1.170:3210/home`. Tailscale proxy (`tailscale serve --bg --https=443 3210`) is NAS-level config, not in repo — reconfigure if port or tailnet node name changes; needs root, run manually by user.

Iframe card has `disable_sandbox: true` set — without it, HA sandboxes the iframe with `allow-popups` but no `allow-popups-to-escape-sandbox`, so `target="_blank"` links (e.g. YouTube links in item URLs) open as sandboxed/opaque-origin popups and get `ERR_BLOCKED_BY_RESPONSE` from sites enforcing COOP.

Local: `D:\claude-workspace\myprivatelist`. Old stack (retired, pending teardown): Vercel `https://mydrydreamlistnew.vercel.app/`, GitHub `https://github.com/drydream/mydrydreamlist`, Supabase.

## Plugin Update Check

NAS DSM Task Scheduler (`Control Panel → Task Scheduler`, weekly Mon 09:00, root, user-defined script) runs `/volume1/docker/homeassistant/scripts/ha-skill-check.sh`, which checks the `home-assistant-skills` repo's `main` branch via `git ls-remote` and, if the SHA changed since last check (tracked in `/volume1/docker/homeassistant/.ha_skill_last_sha`, only written on a successful notify), POSTs to HA webhook `ha_skill_update_check` → automation `ha_skill_update_check` in `automations.yaml` → mobile push notification. No auto-apply — when notified, run `claude plugin update home-assistant-skills@home-assistant-skills` manually, then summarize the changelog (git log in `~/.claude/plugins/marketplaces/home-assistant-skills`) — restart required to take effect.
