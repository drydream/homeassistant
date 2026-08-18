# Zigbee Devices

IEEE → friendly name map (Z2M). Also visible in the Z2M UI at `http://192.168.1.170:8080`.

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

## Z2M config

`/volume1/docker/zigbee2mqtt/configuration.yaml` — MQTT `mqtt://localhost:1883`, Serial `tcp://192.168.1.171:6638`, ch 25, TX 20 (bumped from 18, 2026-08-18 — SLZB/CC2652P supports +20dBm, helps far devices like เตาไฟฟ้า LQI 40), availability 10/1500min, `last_seen: ISO_8601`, `log_level: warning`
