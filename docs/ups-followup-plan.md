# UPS follow-up plan (for Sonnet/Opus executor)

Handoff plan for the remaining UPS work after the 2026-08-28 outage rebuild.
Read `CLAUDE.md` Services→`nut` row + memory `ups_nut_setup` first. Do tasks in order; each has its own verify step. Stop and ask the user before anything marked **HUMAN-GATED**.

## Context recap (already done, do NOT redo)

- 2026-08-28 outage: `synoshutdown -s` refused ("critical operation in progress") → 44 failed FSD loops → battery died → NAS improper shutdown ×2. PC had no shutdown path at all.
- Fixed since: nut container → `network_mode: host`; `SHUTDOWNCMD` → `/volume1/docker/nut/shutdown-cmd.sh` (`synopoweroff -s`, backgrounded, logs to `/volume1/docker/nut/shutdown.log`); `upssched` abandoned (timer daemon busy-loops on this DSM build — never use it); HA automation `ups_battery_safe_shutdown` = 5 min On Battery → notify → PC shutdown → 60 s → `shell_command.nas_safe_shutdown` (forced-cmd SSH key `ha-nas-safe-shutdown` + `/etc/sudoers.d/nut-shutdown`); boot task `upsmon-autostart` re-asserts everything.
- Verified: SSH auth path (echo variant), NOTIFYCMD logging, config clean, both automations loaded.
- NOT yet verified: actual `synopoweroff -s` execution end-to-end.

## Tooling notes for the executor

- NAS access: `mcp__nas-mcp__nas_exec` / `ha_exec`. Sudo password: memory `nas_credentials`. Pattern: `printf '%s\n' "$P" | timeout 60 sudo -S -p '' bash -c '...'`. Keep every call under ~100 s or it backgrounds.
- `Z:\homeassistant` is a live mount of `/config` — edit YAML locally, then validate inside the container: `python -m homeassistant --script check_config -c /config`.
- Reload automations via `mcp__hass-mcp__call_service_tool` (`automation.reload`). No full restart needed for these tasks.
- Never touch `ups-usb.service` (must stay masked) or `/etc/ups/upssched.conf`.

## Task 1 — debounce "ไฟกลับมาแล้ว" notify — DONE 2026-08-29

`ups_power_outage_notify` trigger `back_online` got `for: "00:02:00"`. `on_battery` stays immediate. `trigger.from_state` guard kept. Config clean, reloaded, automation `on`.

Also done 2026-08-29 (user request after the live test): `ups_battery_safe_shutdown` — removed the PC-shutdown action (PC not on UPS) and the 60 s delay; trigger `for:` 5 min → **2 min** (battery only gave ~5.5 min in the test, synopoweroff is slow). Alias now "UPS ใช้แบต 2 นาที - shutdown NAS"; entity_id unchanged.

## Task 2 — investigate UPS output cut for auto-boot after mains restore (MEDIUM RISK, investigate-only)

Problem: after a clean `synopoweroff -s`, the UPS keeps output on. DSM "power on after power failure" only re-boots the NAS when its power *cycles*, so today it only auto-booted because the battery died. Goal: cut UPS output N minutes after NAS shutdown so mains-restore always power-cycles the NAS.

1. List instant commands: `docker exec nut upscmd -l zircon@localhost` (host: `sudo /usr/local/bin/docker exec ...`).
2. If `shutdown.return` (or `load.off.delay`) exists: report to user the exact command, proposed delay (must exceed synopoweroff worst case ≈ 4 min → use 300 s), and where it would go (end of `/volume1/docker/nut/shutdown-cmd.sh`, after the `setsid synopoweroff` line, fired via `upscmd -u monuser -p <pw from /etc/ups/upsmon.conf MONITOR line> zircon@localhost shutdown.return 300` — check exact arg syntax with `upscmd -l` output first).
3. **HUMAN-GATED — do not execute or deploy the command.** It cuts power to everything on the UPS. Only add it to `shutdown-cmd.sh` after the user approves, and it gets exercised only inside Task 3's live test.

### Task 2 findings (2026-08-28, investigation done)

- `shutdown.return` IS supported ("Turn off the load and return when power is back").
- `ups.delay.shutdown` is **runtime-writable** via `upsrw` (RANGE 12–600 s) — an actual SET to the UPS firmware, not a driver-computed override, so far more likely to stick than `override.battery.charge.low` did. Currently 30 s.
- `ups.delay.start` = 180 s (UPS re-energizes 180 s after mains returns). DSM `support_power_recovery=yes` → NAS boots on power-cycle. Total mains-return → NAS-up ≈ 4.5 min.
- `driver.flag.allow_killpower = 0` (killpower locked); DSM's `synoups`/`upsdrvctl shutdown` path is dead (native UPS disabled), so `POWERDOWNFLAG /etc/killpower` in upsmon.conf currently does nothing. Must issue `shutdown.return` explicitly.
- **Danger with default 30 s:** issuing `shutdown.return` cuts UPS power 30 s later, but `synopoweroff -s` needs 2–4 min on a 5-bay → would cut mid-shutdown = the exact failure we fixed. Must raise `ups.delay.shutdown` first.

Proposed patch to `/volume1/docker/nut/shutdown-cmd.sh`, inserted BEFORE the `setsid ... synopoweroff` line (needs user approval + Task 3 to verify the UPS firmware actually honors the delayed cut + restore):

```sh
PW=$(awk '/^MONITOR/{print $5}' /etc/ups/upsmon.conf)
/usr/local/bin/docker exec nut upsrw -s ups.delay.shutdown=420 -u monuser -p "$PW" zircon@localhost >>"$LOG" 2>&1
/usr/local/bin/docker exec nut upscmd -u monuser -p "$PW" zircon@localhost shutdown.return >>"$LOG" 2>&1
```

Residual risk (only the live test resolves): whether this cheap Megatec/krauler firmware honors `S<420>R<180>` accurately and actually re-energizes on mains return. If it does not, outcome is no worse than today (manual power button).

## Task 3 — end-to-end live test

### Run 1 — 2026-08-28 23:13 (PARTIAL PASS)

Input unplugged. 23:13:07 ONBATT → 23:18:39 UPS raised its **own** LOWBATT (~5.5 min) → 23:18:44 upsmon FSD → 23:19:16 `shutdown-cmd.sh` ran (`ppid 9074` = upsmon path). 23:26:03 NAS booted, **DSM log clean — no "improper shutdown"**. `synopoweroff -s` verified. BUT the HA→SSH `nas_safe_shutdown` path never ran (upsmon's hardware LOWBATT beat the old 5-min timer). Battery `charge` 88→50% in 60 s (sag), voltage bottomed ~11.2 V.

### Run 2 — TODO (verifies the HA/SSH path now that the trigger is 2 min)

Only run with user physically present + ready to re-plug. Battery ≥80% first.
1. Pre-flight: `sudo bash -c 'cat /volume1/docker/nut/{events,shutdown}.log'` cleared; note `sensor.zircon_status`. PC state irrelevant now (not shut down).
2. T+0:00 human unplugs UPS **input**. Within ~60 s: `sensor.zircon_status` = "On Battery", notify "ไฟดับ!", `events.log` ONBATT.
3. T+2:00 expect: notify "UPS ไฟดับต่อเนื่อง 2 นาที — สั่ง shutdown NAS", then `shutdown.log` "SHUTDOWNCMD invoked (ppid=<N>)". **Check `ppid` — it must be an sshd child (`ps` shows `sshd: drydream`), NOT upsmon** — that confirms the HA/SSH path fired, not the backstop.
4. SSH drops as the NAS halts — success, not an error. Don't retry against the NAS.
5. Human waits for NAS LEDs + fans fully off, re-plugs wall power, presses NAS power button (no auto-boot without Task 2).
6. Post-boot verify: `sqlite3 -readonly /var/log/synolog/.SYNOSYSDB "select datetime(time,'unixepoch','localtime'),msg from logs order by time desc limit 10;"` — no "improper shutdown". Check nut container up, upsmon reconnected, HA sensors back. Record battery curve → memory.

Abort: T+3:30 NAS still fully up and no new `shutdown.log` line → human re-plugs immediately; diagnose via HA automation trace + `events.log` before retry.

## Task 4 — commit (after Tasks 1–3 outcomes known)

Repo-side changes to commit: `automations.yaml`, `configuration.yaml` (`nas_safe_shutdown`), `CLAUDE.md` (nut row), this file. Pre-existing uncommitted work (`washer_done_notify` automation, `energy_meter_bill_cycle`, browser_mod/tuya_local vendor churn) is NOT part of this — commit only the UPS files, conventional-commit style, remote name is `github`.

## Out of scope (do not attempt)

- Battery replacement / bench discharge test beyond the curve recorded in Task 3.
- Any change to EMQX/Z2M/other containers.
- upssched in any form.
