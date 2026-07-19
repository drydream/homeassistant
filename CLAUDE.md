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

HA 2026.7.2 (Docker, Synology NAS). Host `/volume1/docker/homeassistant` → Container `/config`

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

- **HA MCP server** configured in Claude Code (user scope, `mcp__homeassistant__*`): entity states + Assist actions via `/api/mcp` — prefer over SSH for state checks/service calls.
- **hass-mcp** (user scope, `mcp__hass-mcp__*`, uvx): full REST access — all entities, `call_service_tool`, history, `get_error_log`, `search_entities_tool`. Prefer for anything the Assist MCP can't see.
- **nas-mcp** (user scope, `mcp__nas-mcp__*`, `tools/nas_mcp.py` in this repo, uv run --script): SSH wrapper — `ha_exec`, `ha_logs`, `ha_validate_config`, `container_action`, `nas_exec`. Prefer over raw Bash SSH commands. Raw SSH only as fallback.
- NAS: `drydream@192.168.1.170` — passwordless sudo via `/etc/sudoers.d/drydream-docker`
- Must use full path `/usr/local/bin/docker` (not `docker`) for sudo
- SCP not available on NAS — transfer files via base64: `echo '<b64>' | base64 -d > /tmp/file`

## Services

| Service | Version | Notes |
|---------|---------|-------|
| homeassistant | 2026.7.2 | host network |
| zigbee2mqtt | 2.12.1 | localhost:1883 |
| emqx | 6.2.2 | MQTT broker, host network |
| node-red | 4.1.8-22 | port 1880 |
| matter-server / homebridge / cloudflared | latest | |
| vaultwarden | latest | `/volume1/docker/vaultwarden`, port 8222, `https://password.drydream.work` via cloudflared. Backup sidecar → `/volume1/container_backup/vaultwarden` daily, 14-day retention |

## EMQX

Auth: built-in DB SHA256. ACL: `drydream` full, `{deny,all}` fallback. `no_match=deny`, TCP 1883. Dashboard: `http://192.168.1.170:18083`

## Zigbee2MQTT

`/volume1/docker/zigbee2mqtt/configuration.yaml` — MQTT: `mqtt://localhost:1883`, Serial: `tcp://192.168.1.171:6638`, ch 25, TX 18, availability 10/1500min, `last_seen: ISO_8601`, `log_level: warning`

## Git

Remote: `https://github.com/drydream/homeassistant`. `core.sshCommand = C:/Windows/System32/OpenSSH/ssh.exe` (set). History rewrite fails on Windows (colon in dwains-dashboard filename) — use orphan branch.

## Config Files

`configuration.yaml`, `automations.yaml`, `scripts.yaml`, `scenes.yaml`, `secrets.yaml` (gitignored)

## Devices

- Tuya / Zigbee lights & switches
- Zigbee gate relay (4s script)
- LG WebOS TV: `media_player.lg_webos_tv_65un7200ptf`
- Roborock vacuum, Mitsubishi washer
- Tapo C225 living room (IP `192.168.1.173`, SS cam ID 1): motion via **SS webhook** → `input_boolean.living_room_motion` + `timer.living_room_motion` (5min) → `living_room_no_motion_notify` after 30min off with lights on
- Google Calendar, Telegram bot, TTS (Google, Thai)
- YTMD (PC `192.168.1.186:9863`) — see YTMD section
- DryDrEaM PC: `switch.drydream_pc` (WoL) + `shell_command.shutdown_drydream_pc` (SSH)
- **Bedroom AC IR** HMS06CBU IP `192.168.1.177` device_id `ebb508d08d4b6d9050vjjr`: `shell_command.ac_bedroom_on/off` → `/config/send_ac_ir.py` → tinytuya local. Toggle: `script.toggle_bedroom_ac` checks `binary_sensor.sthaanaae_rh_ngn_n_contact`. Siri/HomeKit: `switch.ae_rh_ngn_n` "แอร์ห้องนอน" (template switch, `unique_id: bedroom_ac_switch`, state from same binary_sensor). `script.toggle_bedroom_ac` excluded from HomeKit to avoid conflict. **No cloud.**
- **Living room IR** HMS06CBU IP `192.168.1.174` device_id `eb888f1616078e8d40oyr6`: still Tuya cloud scenes (not yet migrated).

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

Dashboard: `/dashboard-mylist` (YAML, `dashboards/mylist/mylist.yaml`). Vercel: `https://mydrydreamlistnew.vercel.app/` (iframe). GitHub: `https://github.com/drydream/mydrydreamlist`. Local: `D:\claude-workspace\myprivatelist`. Auth: single-password, `sameSite:none`+`secure:true` cookie required for cross-site POST. Data: Supabase, `lib/actions/items.ts`, all mutations call `revalidatePath('/home')`.
