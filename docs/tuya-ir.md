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
| Bedroom (HMS06CBU) | 192.168.1.177 | `ebb508d08d4b6d9050vjjr` | Local (tuya_local), no cloud |
| Living room (HMS06CBU) | 192.168.1.174 | `eb888f1616078e8d40oyr6` | Still Tuya cloud scenes, not migrated |

Reachability sensors: `binary_sensor.bedroom_ir_blaster`, `binary_sensor.living_room_ir_blaster` (ping integration, config-entry-based). `automation.bedroom_ir_blaster_offline_notify` alerts if either is offline >10min / recovered.

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

- `shell_command.ac_bedroom_on/off` → `/config/send_ac_ir.py` (3s socket timeout, exit 1 on failure)
- `script.toggle_bedroom_ac` checks `binary_sensor.sthaanaae_rh_ngn_n_contact`
- Siri/HomeKit: `switch.ae_rh_ngn_n` "แอร์ห้องนอน" (template switch, `unique_id: bedroom_ac_switch`, state from the same binary_sensor). `script.toggle_bedroom_ac` is excluded from HomeKit to avoid a conflict
- Both the toggle script and the template switch guard on the ping sensor first — if offline, push-notify both phones and stop rather than hanging silently
