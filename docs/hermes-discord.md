# Hermes Discord Gateway

สถานะ: **LIVE + verified 2026-09-01** — Discord เป็น gateway ที่ 2 คู่กับ Telegram. แต่ละ thread/channel มี session context แยก. verify แล้ว: @mention ใน `#test-jarvis` → auto-thread → JARVIS ตอบ HA query ("ไฟเปิดกี่จุด") ถูกเป็นภาษาไทย.

## สิ่งที่ deploy จริง (ต่างจากแผนเดิม)

แผนเดิมคาดว่าต้องเขียน `discord:` YAML block เต็ม (require_mention, auto_thread, allow_mentions, …). **ไม่จริง** — image 0.20.0 มี Discord เป็น bundled plugin (`/opt/hermes/plugins/platforms/discord/`, โครงเดียวกับ telegram plugin) และ tuning ทุกตัวเป็น `DISCORD_*` env var ที่ default ตรงกับที่อยากได้อยู่แล้ว.

### 0. ตรวจ image
- `discord.py` = **2.7.1** อยู่ใน image, ไม่ต้อง lazy-install
- adapter: `plugins/platforms/discord/adapter.py` (bundled, `plugin.yaml` name `discord-platform`)
- adapter บังคับ `intents.message_content = True` + `intents.members` → **ต้องเปิด privileged intent ทั้งสองใน Dev Portal**

### 1. Discord Dev Portal (ทำเอง)
- App: **JARVIS**, application id `1544336773633810452`
- Bot → Privileged Gateway Intents → เปิด **Message Content** + **Server Members** → Save
- Invite: `https://discord.com/oauth2/authorize?client_id=1544336773633810452&scope=bot+applications.commands&permissions=274878286912`
- Guild: **drydream** (`283605828504649728`)
- ไม่ต้อง App Verification (จำเป็นแค่ >100 server)

### 2. `/opt/data/.env` (host `/volume1/docker/hermes-agent/data/.env`)
backup `.env.bak.discord-<ts>`. เพิ่ม:
```
DISCORD_BOT_TOKEN=<token>
DISCORD_ALLOWED_USERS=122670170857668608
```
compose ไม่มี `env_file:` — hermes โหลด `$HERMES_HOME/.env` เอง.

### 3. `/opt/data/config.yaml` — **profile `default` เท่านั้น**
⚠️ gateway รัน profile `default` = `/opt/data/config.yaml`. Profiles `coding`/`daily`/`research` แค่ registered ไม่ start (ดู `s6-supervise gateway-*` — มี python proc แค่ `gateway-default`). อย่าไปแก้ profile copies.

backup `config.yaml.bak.discord-<ts>`. สองแก้:
```yaml
platforms:
  discord:
    enabled: true
```
```yaml
platform_toolsets:
  discord:                 # เดิม [hermes-discord] → mirror telegram list
    - bfl
    - clarify
    - code_execution
    - cronjob
    - delegation
    - file
    - homeassistant
    - kanban
    - memory
    - session_search
    - skills
    - terminal
    - todo
    - tts
    - web
```
`group_sessions_per_user: true` มีอยู่แล้ว — ไม่แตะ.

### 4. restart
`container_action restart hermes`. verify: session ใหม่ใน `/opt/data/sessions/sessions.json` key `agent:main:discord:thread:<id>:<id>`, Telegram ยังต่อ.

## Session / thread model (verified)

| บริบท | Session key | Session |
|---|---|---|
| DM | `agent:main:discord:dm:<user>` | เดียว persist |
| @mention ใน channel (`AUTO_THREAD=true`) | สร้าง thread → `…:thread:<tid>:<tid>` | thread = session แยก context เต็ม |
| ใน thread (`THREAD_REQUIRE_MENTION=false`) | เดิมของ thread | ต่อ session |
| คนละ channel | `…:channel:<cid>` | คนละ session |

thread ใหม่ (auto หรือสร้างเอง) = session ใหม่เสมอ.

## Env knobs (default = ที่ใช้อยู่)

| env | default | ผล |
|---|---|---|
| `DISCORD_REQUIRE_MENTION` | `true` | channel เงียบจนกว่า @JARVIS |
| `DISCORD_AUTO_THREAD` | `true` | @mention → เปิด thread |
| `DISCORD_THREAD_REQUIRE_MENTION` | `false` | ใน thread พิมพ์ได้เลย |
| `DISCORD_REACTIONS` | `true` | |
| `DISCORD_HISTORY_BACKFILL` / `_LIMIT` | `true` / `50` | |
| `DISCORD_FREE_RESPONSE_CHANNELS` | — | channel id ที่ตอบโดยไม่ต้อง mention |
| `DISCORD_HOME_CHANNEL` | — | ปลายทาง cron / cross-platform (หรือ `/sethome` ใน channel) |

## ข้อควรระวัง

- Message Content Intent ปิด = connect fail / บอทเงียบ (troubleshoot อันดับ 1)
- `Slash command sync failed: Server disconnected` ตอน boot = Discord API สะดุด, self-heal, ไม่ตาย
- latency = agent เดียวกับ Telegram (prompt ~20-100k, 7-38s) — ไม่เร็วกว่า. ปุ่มลด: ตัด `platform_toolsets.discord` ให้เหลือ `[homeassistant, clarify]`
- token 2026-09-01 หลุดเข้า Claude Code transcript ตอน setup → **ต้อง Reset Token ใน portal** + swap ใน `.env`
