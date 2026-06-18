# CLAUDE.md

## AI Directives

- **Act as an expert.** Skip basic Home Assistant, Docker, YAML, or Git explanations.
- **Concise output.** Explain only what is necessary or what changed.
- **No snippet omissions.** When modifying code, output the full block — avoid `# ... existing code ...` unless the section is genuinely long.
- **Language.** Default English. Use Thai only when user explicitly requests it. Keep identifiers (`entity_id`, function names, variables) in `english_snake_case`.
- **Storage-mode dashboards.** Edit via HA UI only — never patch `.storage/lovelace*` directly.
- **Think before coding.** State assumptions explicitly. If multiple interpretations exist, present them. If unclear, stop and ask — don't guess silently.
- **Simplicity first.** Minimum code that solves the problem. No speculative features, unnecessary abstractions, or "flexibility" that wasn't requested.
- **Surgical changes.** Touch only what the request requires. Don't refactor adjacent code, fix style, or remove pre-existing dead code unless asked. Remove only what YOUR changes made unused.
- **Verify success.** For multi-step tasks, state a brief plan with a verifiable check per step. Weak goals ("make it work") require clarification first.

## Current Focus

- [ ] Update Calendar dashboard
- [ ] Create new automation for living room lights

*(Keep this list trimmed to active items only — remove completed ones.)*

## Project

Home Assistant 2026.5.0 (Docker on Synology NAS)

Paths: Host `/volume1/docker/homeassistant` → Container `/config`

## SSH / Docker Access

Claude Code SSH key (`~/.ssh/id_ed25519`) is authorized on NAS (`drydream@192.168.1.170`).  
Bash tool must use Windows OpenSSH explicitly: `/c/Windows/System32/OpenSSH/ssh.exe`  
Passwordless sudo for docker is configured via `/etc/sudoers.d/drydream-docker` — must use **full path** `/usr/local/bin/docker` (not `docker`) or sudo will still prompt.

```bash
# SSH from Bash tool
/c/Windows/System32/OpenSSH/ssh.exe -i /c/Users/DryDrEaM_Champ/.ssh/id_ed25519 -o StrictHostKeyChecking=no drydream@192.168.1.170 "sudo /usr/local/bin/docker exec homeassistant ..."

# Validate config
sudo /usr/local/bin/docker exec homeassistant python -m homeassistant --script check_config -c /config

# Restart
sudo /usr/local/bin/docker compose -f /volume1/docker/homeassistant/docker-compose.yml restart homeassistant
```

Docker path: `/usr/local/bin/docker` (symlink → `/var/packages/ContainerManager/target/usr/bin/docker`)

## Services

| Service | Version | Notes |
|---------|---------|-------|
| homeassistant | 2026.5.0 | host network |
| zigbee2mqtt | 2.10.0 | localhost:1883 |
| emqx | 6.2.0 | MQTT broker, host network |
| node-red | 4.1.8-22 | port 1880 |
| matter-server | stable | |
| homebridge | latest | |
| cloudflared | latest | |

Docker Compose: `/volume1/docker/homeassistant/docker-compose.yml`

## EMQX

- Auth: built-in DB, SHA256; ACL: `drydream` full, `{deny,all}` fallback
- `no_match=deny`, `deny_action=disconnect`, TCP 1883 only
- Data: `/volume1/docker/emqx/data` | ACL: `.../authz/acl.conf`
- Dashboard: `http://192.168.1.170:18083`

## Zigbee2MQTT

File: `/volume1/docker/zigbee2mqtt/configuration.yaml`
- MQTT: `mqtt://localhost:1883` | Serial: `tcp://192.168.1.171:6638`
- Channel: 25, TX power: 18
- Availability: active 10min / passive 1500min
- `last_seen: ISO_8601`, `log_level: warning`

## Git

Remote: `https://github.com/drydream/homeassistant` (GitHub)  
Windows git uses Windows OpenSSH: `core.sshCommand = C:/Windows/System32/OpenSSH/ssh.exe` (already set, no password prompts)  
Note: git history rewrite (filter-repo/filter-branch) fails on Windows due to colon in `dwains-dashboard/configs/cards/areas/living_room/custom:mushroom-template-card.yaml` — use orphan branch approach if history needs cleaning.

## Config Files

- `configuration.yaml` — root config
- `automations.yaml`, `scripts.yaml`, `scenes.yaml`
- `secrets.yaml` — gitignored

## Structure

- `custom_components/` — 3rd-party integrations
- `blueprints/`, `dwains-dashboard/`, `www/community/`
- `.storage/` — runtime, **do not edit**

## Devices

- Tuya / Zigbee lights & switches
- Zigbee gate relay (4s script)
- LG WebOS TV (`media_player.lg_webos_tv_65un7200ptf`)
- Roborock vacuum
- Mitsubishi washer
- Tapo cameras/devices — living room camera C225: motion entity `binary_sensor.c225_cell_motion_detection` (replaces defunct `binary_sensor.tapo_c225_2a63_cell_motion_detection`); camera sends frequent false-positive `on` blips (sub-second) — use `template` trigger with `last_changed` duration check instead of `state` + `for:` to avoid timer resets
- Google Calendar, Telegram bot
- TTS (Google, Thai)
- YouTube Music Desktop (PC `192.168.1.186:9863`) — see below
- DryDrEaM PC power: `switch.drydream_pc` (WoL, wake) + `shell_command.shutdown_drydream_pc` (SSH shutdown) — see PC Remote Control below

## Zigbee Devices

| IEEE | Friendly Name |
|------|--------------|
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

## YouTube Music Desktop (YTMD)

App: `ytmdesktop/ytmdesktop` on PC `192.168.1.186:9863`  
Token: `secrets.yaml` key `ytmd_token` (no Bearer prefix in header)

Sensors (poll 10s): `sensor.youtube_music{,_title,_artist,_album,_thumbnail,_duration,_progress}`  
State values: `playing | paused | buffering | idle`  
Commands: `rest_command.ytmd_{play_pause,next,previous,volume_up,volume_down,mute}`

Auth flow (if re-auth needed):
1. `POST /api/v1/auth/requestcode` `{appId,appName,appVersion}` → `{code}`
2. User clicks Allow in YTMD (dialog may be delayed)
3. `POST /api/v1/auth/request` `{appId,code}` → `{token}`

## PC Remote Control (DryDrEaM PC `192.168.1.186`)

Windows user `DryDrEaM_Champ` (admin). Two services in HA:

- **Wake:** `switch.drydream_pc` — `wake_on_lan` platform, MAC `30:56:0F:1A:0E:B7`
- **Shutdown:** `shell_command.shutdown_drydream_pc` — SSH from container

SSH key inside HA container: `/config/.ssh/id_ed25519` (persisted via bind-mount).  
Public key authorized at: `C:\ProgramData\ssh\administrators_authorized_keys` on PC (admin keys MUST live here, ACLs locked to SYSTEM + Administrators).  
Known hosts: `/config/.ssh/known_hosts`.  

Shell command body:
```
ssh -i /config/.ssh/id_ed25519 -o UserKnownHostsFile=/config/.ssh/known_hosts -o BatchMode=yes -o ConnectTimeout=5 DryDrEaM_Champ@192.168.1.186 "shutdown /s /t 0"
```

Status sensor: `binary_sensor.192_168_1_185` (Ping integration — host updated to `.186`; entity_id is just a label).

Dashboard button (`custom:button-card`) uses top-level JS-template `tap_action` for toggle behavior — state-level `tap_action` overrides do NOT fire on this card version, only display fields (name/icon/color) merge.

## Conventions

- Mixed Thai/English naming, Timezone: Asia/Bangkok
- `entity_id`: `english_snake_case` | `alias`: Thai allowed
- Scripts: `action_object` pattern (e.g. `turn_on_gate_4s`)
- Presence → lighting automation | MQTT via Zigbee2MQTT → EMQX
- Utility meters enabled

## UI Rules

- Mushroom Cards + Layout Card, mobile portrait optimized
- Avoid default Lovelace cards
- Storage-mode dashboards → edit via UI only (not `.storage/`)

## Automation Style

- Descriptive aliases (Thai OK), always set `id`
- `mode: single` default; use `restart` for motion lights
- Scripts for reusable logic, non-blocking actions preferred
- No duplicate triggers

## Guardrails

- Do not modify `.storage/`
- Do not remove entities/automations unless asked
- Always validate YAML before applying (`python -m homeassistant --script check_config -c /config` or Dev Tools)
- Keep backward compatibility
- `color_temp` removed in 2026.3 → use `color_temp_kelvin`
- `panel_iframe` removed in HA 2024.5 — use YAML dashboard with `type: iframe` card + `type: panel` view
- Config check: ignore pre-existing "Unable to turn on" webostv warning — it's a known non-fatal error, not caused by config changes

## Workflow

1. Edit YAML
2. Validate: HA Container has no `ha` CLI — use  
   `sudo docker exec homeassistant python -m homeassistant --script check_config -c /config`  
   or HA Dev Tools → YAML → Check Configuration
3. Reload affected domain (restart only if required)

## Calendar

- Dashboard: `/dashboard-calendar`
- Source: `calendar.drydream_event_s`
- Sensor: `sensor.calendar_events_list`
- Scripts: `add_calendar_note`, `delete_calendar_event`, `load_event_for_edit`

## My List

- Dashboard: `/dashboard-mylist` (YAML mode, file: `dashboards/mylist/mylist.yaml`)
- Vercel app: `https://mydrydreamlistnew.vercel.app/` — embedded as full-screen iframe
- GitHub: `https://github.com/drydream/mydrydreamlist` | Local: `D:\claude-workspace\myprivatelist`
- Auth: single-password (`lib/actions/auth.ts`), session cookie `sameSite: 'none'` + `secure: true` required for cross-site iframe POST (Next.js server actions)
- Data: Supabase, `lib/actions/items.ts` — all mutations call `revalidatePath('/home')`
