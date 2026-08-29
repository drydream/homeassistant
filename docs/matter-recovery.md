# Matter fabric recovery (Aqara Hub M100 + A100 lock)

The Aqara Smart Lock A100 is **not** a direct Zigbee device in HA. It is bridged
into Matter by the **Aqara Hub M100** (`is_bridge: true`, node 1), which is
commissioned to `python-matter-server` (`/volume1/docker/matter`, host network,
ws://localhost:5580/ws). All `lock.aqara_smart_lock_a100*` /
`*.aqara_hub_m100*` entities come from that one node.

## Fast diagnosis

```bash
sudo /usr/local/bin/docker logs matter-server 2>&1 | grep -E "Loaded 0 nodes|Allocating new controller"
```

- **Both lines present** → the Matter fabric keys in `/volume1/docker/matter/chip.json`
  were lost/corrupted. The CHIP stack generated a *fresh* fabric (new
  compressed-fabric-id → new storage filename), so the server starts with 0 nodes.
  The hub is still paired to the **old** fabric, whose private key is gone.
  **Re-commissioning is the only fix** — the orphaned `<old-id>.json` node file is
  not recoverable without the matching key in `chip.json`.
- **Neither line** → node is commissioned; problem is elsewhere (hub offline,
  Wi-Fi, HA subscription). Check `get_nodes` `available` flag.

Seen 2026-08-28: NAS improper shutdown (UPS event) truncated `chip.json` →
`[chip.storage] ERROR Expecting value: line 1 column 1 (char 0)` at boot → new
fabric `A94B59757EAADA76` (was `24561DF2EBB238B6`) → lock `unavailable` for ~18h.

## Re-commission (no HA UI needed)

1. Aqara Home app → Hub M100 → Settings → Matter → remove the stale controller
   entry (shows as **"TestVendor"** — that's `python-matter-server`, vendor
   `0xFFF1`) → generate a new pairing code (11 digits).
2. Feed the code straight to the server over WS:

```bash
sudo /usr/local/bin/docker exec matter-server python3 -c "
import asyncio, aiohttp, json
async def main():
    async with aiohttp.ClientSession() as s:
        async with s.ws_connect('ws://localhost:5580/ws') as ws:
            print(await ws.receive_json())
            await ws.send_json({'message_id':'c1','command':'commission_with_code',
                                'args':{'code':'<11-DIGIT-CODE>','network_only':True}})
            while True:
                m = await ws.receive_json()
                if m.get('message_id') == 'c1':
                    print(json.dumps(m)[:800]); break
asyncio.run(main())
"
```

`network_only: True` works because the hub is already on Wi-Fi. HA's Matter
integration listens for `node_added` and recreates the devices automatically —
no restart, no config-entry reload.

## Cleanup after re-commission

New fabric = new unique_id prefix → HA keeps the same **device** rows but adds
new **entities** with a `_2` suffix; the old ones go stale. To restore the bare
entity_ids (so dashboards / the disabled HomeKit accessory entry keep working):

- Stop HA, edit `.storage/core.entity_registry` on the host
  (`/volume1/docker/homeassistant/.storage/`), start HA.
- Delete every entity whose `unique_id` starts with the **old** prefix; strip the
  `_2` suffix from every entity whose `unique_id` starts with the **new** prefix
  (leave new-only entities like `sensor.*_boot_reason`, `update.*_firmware`).
- Drive it off the `unique_id` prefix, never a name filter. Assert the counts
  before writing (2026-08-28 case: 11 old, 13 new).

## Prevention

`/volume1/docker/matter/backup-matter.sh` — **cold** backup (stops the container
so `chip.json` is never captured mid-write) → `/volume1/container_backup/matter/`,
4 kept. Called weekly from `scripts/ha-skill-check.sh` (DSM task id 3, Wed 09:00).
Restore = stop container, untar over `/volume1/docker/matter`, start.

Root-cause prevention of the shutdown itself is the UPS work in
`docs/ups-followup-plan.md`.
