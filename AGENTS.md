# AGENTS.md

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
| UPS follow-up tasks (executor plan) | `docs/ups-followup-plan.md` |
| Matter fabric recovery (Aqara lock/hub) | `docs/matter-recovery.md` |
| Hermes Discord gateway | `docs/hermes-discord.md` |
| Hermes Thai voice (STT/TTS; Assist status) | `docs/hermes-voice.md` |
| Wi-Fi/Zigbee tuning and known configure errors | `docs/optimize-2026-08-18.md` |
| My Private List deployment context | `myprivatelist-context.md` |

## Current Focus

- [ ] Update Calendar dashboard

## Project

HA 2026.8.2 (Docker, Synology NAS). Host `/volume1/docker/homeassistant` → Container `/config`

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
# Same rule applies to every Compose service (including `zigbee2mqtt`): a plain
# recreate can leave Synology Container Manager caching a transient `<id>_<service>` name.
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
| homeassistant | 2026.8.2 | host network |
| zigbee2mqtt | 2.14.1 | localhost:1883 |
| emqx | 6.2.3 | MQTT broker, host network. Built-in DB SHA256 auth, ACL `drydream` full + `{deny,all}` fallback, `no_match=deny`, TCP 1883. Dashboard `:18083` |
| node-red | 4.1.8-22 | port 1880 |
| matter-server / homebridge | latest | matter-server `/volume1/docker/matter`, host net, ws://localhost:5580. Aqara Hub M100 (bridges A100 lock) commissioned here. `chip.json` = fabric keys; improper shutdown corrupts it → new fabric → `Loaded 0 nodes` → re-commission (see `docs/matter-recovery.md`). Weekly cold backup → `/volume1/container_backup/matter/` via `scripts/ha-skill-check.sh`. |
| cloudflared | 2026.7.3 | `/volume1/docker/cloudflare`, token in `.env`, `network_mode: host` — **required**, HA trusted_proxies only allows `192.168.1.170` |
| vaultwarden | latest | `/volume1/docker/vaultwarden`, port 8222, `https://password.drydream.work`. Backup sidecar → `/volume1/container_backup/vaultwarden`, 14-day retention |
| nut | 2.8.2 (self-built) | `/volume1/docker/nut`, UPS monitor (Zircon AX, `nutdrv_qx`/krauler), `network_mode: host`. Host `upsmon` starts via DSM Task Scheduler `upsmon-autostart`; `SHUTDOWNCMD` uses `/volume1/docker/nut/shutdown-cmd.sh` → `synopoweroff -s`. `upssched` is broken; early shutdown is HA automation `ups_battery_safe_shutdown` after 2min on battery. Battery lasts ~5.5min at ~16% load; replacement likely. See `docs/ups-followup-plan.md`. |
| hermes-agent | 0.20.0 (self-built) | `/volume1/docker/hermes-agent`, host network. Pre-built image: never recreate-rebuild. Active profile is `default` at `/opt/data/config.yaml`; Telegram + Discord gateways live. Do not set `codex_app_server` (strips Hermes tools). Dashboard `0.0.0.0:9119` Basic Auth, Tailscale-only. See `docs/hermes-discord.md` / `docs/hermes-voice.md`. |
| nas-operator-mcp | general-purpose (self-built) | `/volume1/docker/nas-operator-mcp`, bearer-auth MCP sidecar on internal network `172.30.99.2:8765`; mutations require MCP elicitation accept. See `nas_operator_mcp_general_refactor` memory. |

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
⚠️ **Never put an SS-proxied camera on a dashboard with `camera_view: live`.** HA's stream worker wedges on SS RTSP, holding `Stream._start_stop_lock` and freezing every later `camera/stream`. Recover by reloading config entry `01JX4TXA6JEXA9ZYDPXCGDSA52`; this is not a Cloudflare issue.
- Dashboard cards use **direct** entities: `camera.living_room_native` (Tapo C225 `.173`) and `camera.carport_native` (ONVIF entry `carport_direct`, C320WS `.111:2020`).
- `camera.living_room` / `camera.carport` are SS proxies for recording + motion only; keep off dashboards.
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

---

## Agent Style (ported from Claude Code hooks + global CLAUDE.md)

**Think before coding.** State assumptions. Multiple interpretations → present them, don't pick silently. Unclear → stop and ask. Simpler approach exists → say so.

**Simplicity ladder** — stop at first rung that holds:
1. Does this need to exist? Speculative → skip, say so in one line.
2. Stdlib / native HA feature covers it? Use it. (built-in helper over template sensor, DB constraint over app code)
3. Already-installed dep solves it? Use it. Never add a dep for what a few lines do.
4. Can it be one line? One line.
5. Only then: minimum code that works.

Mark deliberate shortcuts `# ponytail: <what, and upgrade path if it has a ceiling>`.

**Surgical changes.** Touch only what's asked. Don't "improve" adjacent code/comments/formatting. Match existing style. Notice unrelated dead code → mention, don't delete. Remove only orphans *your* change created. Test: every changed line traces to the request.

**Output shape.** Lead with the action (command / path / snippet first, prose after). Number multi-step work, one bounded action per step. No preamble ("Let me…", "Great question"), no recap, no closer ("Hope this helps"). Errors: state cause + fix, no "uh oh". Lists cap at 5, ranked. Time estimates in concrete units. End with ONE next action doable in <2 min.

**Prose register.** Terse. Drop articles/filler/hedging, fragments fine, short synonyms. Technical terms exact, errors quoted verbatim. **Write normal prose for:** code, commits, PRs, security warnings, destructive-action confirmations, and anything the user asked to have explained.

**Never simplify away:** input validation at trust boundaries, error handling that prevents data loss, security measures, anything explicitly requested. Hardware needs a calibration knob — real sensors drift.

**Non-trivial logic leaves one runnable check** (assert-based `demo()` or one small `test_*.py`). No frameworks. Trivial one-liners need no test.

## Session Memory

Facts from past sessions live in `C:\Users\DryDrEaM_Champ\.claude\projects\Z--homeassistant\memory\*.md` — one fact per file. Read a file when its line below is relevant; don't preload all of them.

- `ytmd_setup.md` — YTMD PC .186:9863, REST sensors + rest_commands in configuration.yaml
- `pc_remote_control.md` — shutdown_drydream_pc SSHes container→.186; key /config/.ssh, pubkey in administrators_authorized_keys
- `button_card_quirks.md` — custom:button-card `state[]` only merges visual fields; per-state actions need top-level tap_action with `[[[ ]]]` JS
- `git_windows_ssh.md` — core.sshCommand → Windows OpenSSH so git uses ssh-agent
- `ha_storage_utf8_bom.md` — PS 5.1: Get-Content kills Thai, Set-Content -Encoding utf8 writes BOM (HA quarantines). Use `[IO.File]::ReadAllText/WriteAllText` + `UTF8Encoding($false)`
- `nas_credentials.md` — drydream@.170 sudo pw; plink for non-interactive SSH from Windows; HA Container has no `ha` CLI
- `siri_gate_shortcut.md` — "นิดเดียว" gate cmd is an iOS Shortcut, not HomeKit voice
- `feedback_config_check_noise.md` — webostv "turn on tv" error is pre-existing, ignore during validation
- `mylist_project.md` — My List moved Vercel+Supabase → NAS Docker+SQLite :3210; HA iframe uses Tailscale HTTPS, not LAN
- `tuya_ir_migration.md` — HMS06CBU bedroom IR blaster, Tuya cloud scenes → tuya_local, needs local_key
- `gate_homekit_fix.md` — pending: device_class gate→shutter in configuration.yaml:148 (drops Face ID, enables HomePod)
- `hass_mcp_setup.md` — hass-mcp full REST; nas-mcp = tools/nas_mcp.py SSH wrapper
- `synology_cm_stale_container.md` — compose recreate leaves ghost `<id>_homeassistant` in CM UI; update via stop+rm then up -d
- `nas_storage_layout.md` — DS1520+ disk/cache/volume map; spare 256GB NVMe unused (M.2 pool unsupported on this model)
- `tuya_wifi_half_alive.md` — after power outage deviceScan sees it but ARP dead; needs 30-60s power-off, not quick replug
- `z_drive_live_mount.md` — `Z:\homeassistant\*` writes straight to /config. No base64/SSH push needed
- `ups_nut_setup.md` — Zircon UPS via Docker NUT at /volume1/docker/nut + host upsmon; ups-usb.service must stay masked
- `feedback_docker_update_workflow.md` — every container update: prune old image + bump AGENTS.md version table, same turn
- `cloudflared_network_mode_host.md` — must be host, else HA trusted_proxies 400s it
- `power_clamp_pending.md` — Tuya WiFi clamp not installed yet; needs tuya_local + power card
- `feedback_prefer_api_over_browser.md` — hass-mcp/nas-mcp or server-side patch script before browser automation
- `hermes_agent_deployment.md` — Hermes on NAS, Telegram + HA integration, openai-codex runtime details
- `nas_operator_mcp.md` — internal authenticated MCP sidecar; tool naming, allowlists, and confirmation guardrails
- `hermes_desktop_direct_tailscale.md` — Hermes Desktop remote gateway via direct Tailscale IP, gated auth + DSM Firewall
- `gate_unknown_dp105_root_cause.md` — controller drops WiFi → unmapped dp105=1; fixed w/ trigger-based template, protocol stays 3.5
- `mea_not_pea_bill_card.md` — house is MEA not PEA; card `mea-electric-bill-card.js`, rates from Sep-2569 bill
- `mea_shared_tariff.md` — shared MEA tariff snapshots, billing-date selection, manual Ft renewal; see `docs/mea-tariff.md`
- `communication_modes.md`, `MEMORY.md` — Claude Code-specific, ignore under Codex

New durable fact learned? Write it as a new file in that dir, same format, and add a line here.
