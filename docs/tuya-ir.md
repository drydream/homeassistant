# tinytuya / IR Blasters

Read this before adding or debugging an IR blaster.

tinytuya = pip dep of tuya_local (HACS), runs inside the HA container. IR codes live in `/config/send_ac_ir.py`.

## Key facts

- dp 201 = send IR / enter study mode
- dp 202 = received IR code — **cloud MQTT only**, not local. `remote.learn_command` always times out; read the dp 202 value from HA debug logs instead
- local_key: `iot.tuya.com → Cloud → Devices → Device Detail` (free). An IoT Core subscription is only needed for cloud scene calls, never for local control

## Hardware

| Blaster | IP | device_id | Status |
|---------|-----|-----------|--------|
| Bedroom (ZS05, Zigbee) | — | IEEE `0xbc8d7efffe8c511a`, Z2M name "ไออาร์ห้องนอน" | **Migrated 2026-09-22** from the old WiFi HMS06CBU to a Zigbee ZS05. IR sent via `text.set_value` on `text.0xbc8d7efffe8c511a_ir_code_to_send` (see below). AC remote is single-button toggle — same code for on/off. Old WiFi unit (192.168.1.177, `ebb508d08d4b6d9050vjjr`) retired. |
| Living room (HMS06CBU) | 192.168.1.174 | `eb888f1616078e8d40oyr6` | Still Tuya cloud scenes, not migrated |

`binary_sensor.living_room_ir_blaster` (ping) still tracks the living room WiFi unit. The old `binary_sensor.bedroom_ir_blaster` ping sensor and `automation.bedroom_ir_blaster_offline_notify` guard are now stale — the bedroom blaster is Zigbee, not IP-based; no availability entity is wired up for it yet in Z2M (legacy availability not enabled for this device).

## ZS05 (Zigbee IR blaster) send/learn

- Learn: press `button.<ieee>_switch_learn_ir_code`, then point the real remote at it within a few seconds.
- **`sensor.<ieee>_learned_ir_code` is TRUNCATED to 255 chars** (HA's `text`/`sensor` state string cap) — AC remote codes are routinely 600-800+ chars. Never copy the code from this sensor's state for anything but short-code devices. Get the real value from raw MQTT instead: subscribe to `zigbee2mqtt/<friendly_name>` and read the `learned_ir_code` field from the JSON payload directly.
- Send: **`mqtt.publish`** with `topic: zigbee2mqtt/<friendly_name>/set`, `payload: '{"ir_code_to_send": "<full code>"}'`. Do NOT use `text.set_value` on `text.<ieee>_ir_code_to_send` for long codes — that entity also has `attributes.max: 255` and silently truncates on the way out, which is why the AC didn't respond on the first attempt (truncated learn value sent through a second 255-cap on send — a double truncation, not a Zigbee transport bug).
- The `infrared.<ieee>_ir_emitter` / `infrared.<ieee>_learned_ir_timings` entities are NOT directly callable from automations (HA core `infrared` domain has no generic send service) — always go through MQTT.
- If the device drops off the Zigbee mesh ("left the network" in z2m logs), re-pair: enable Z2M permit_join, then hold the device's pairing button ~5s until its LED blinks fast.
- z2m error `zhc:zosung: Unexpected IR code position` during a *learn* is often a red herring — it can still land a usable (if truncated-in-HA) code. Don't assume it means "retry the physical button press"; check the real MQTT payload length first.

## Known failure mode

After a power outage the WiFi module can come back **half-alive** — it answers UDP broadcast / `tinytuya.deviceScan`, but ARP/unicast is dead (`ping` fails, `errno 113`). Fix: unplug 30-60s (a quick replug is not always enough), then recheck the ping sensor.

## Add a new IR device

```bash
# Find device
docker exec homeassistant python3 -c "import tinytuya; [print(ip,v['gwId'],v['version']) for ip,v in tinytuya.deviceScan(maxretry=5).items()]"

# Study mode (then press the remote, check logs for dp 202)
docker exec homeassistant python3 -c "
import tinytuya,json; d=tinytuya.Device('<id>','<ip>','<key>',version=3.3)
d.set_value(201,json.dumps({'control':'study'}))"
docker logs homeassistant --since 1m 2>&1 | grep 'dpId.*202' -A1

# Send IR
docker exec homeassistant python3 -c "
import tinytuya,json; d=tinytuya.Device('<id>','<ip>','<key>',version=3.3)
d.set_value(201,json.dumps({'control':'send_ir','type':0,'head':'','key1':'1<code>'}))"
```

Then add the code to `/config/send_ac_ir.py`, add a `shell_command` in `configuration.yaml`, restart HA.

## Bedroom AC wiring

- `switch.ae_rh_ngn_n` template switch (`unique_id: bedroom_ac_switch`) has SEPARATE `turn_on`/`turn_off` IR codes — remote's power button is NOT a toggle at the IR level despite being a single physical button; each learn only captures whatever state the button happened to send. Both call `mqtt.publish` to `zigbee2mqtt/ไออาร์ห้องนอน/set`.
- `script.toggle_bedroom_ac` just calls `switch.toggle` on `switch.ae_rh_ngn_n` — no IR code duplicated here, single source of truth is the template switch.
- State comes from `binary_sensor.sthaanaae_rh_ngn_n_contact` (unrelated to the blaster itself — a separate sensor on the AC unit)
- Siri/HomeKit: `switch.ae_rh_ngn_n` "แอร์ห้องนอน" — entity_id/unique_id unchanged by the WiFi→Zigbee migration, so HomeKit needed no reconfiguration. `script.toggle_bedroom_ac` is excluded from HomeKit to avoid a conflict
- No offline guard currently — the old ping-based check doesn't apply to the Zigbee device; add one later if the blaster proves unreliable (watch z2m logs for "left the network")
