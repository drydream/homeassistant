# Hermes Voice Chat Plan

เป้าหมาย: คุยกับ hermes ด้วยเสียง (ไทย) จากมือถือ + PC ตอบกลับเป็นเสียง ฟรีทั้งหมด

สถานะ: **Phase 1 เสร็จ + verify แล้ว 2026-08-27** — TTS (ขาออก) + STT (ขาเข้า ผ่าน Groq) ทำงานทั้งคู่ server-side; เหลือ user เทสใน Telegram จริง

ข้อเท็จจริงที่ตรวจแล้ว (2026-08-27):

- Hermes มี voice pipeline ในตัว: gateway auto-transcribe voice note ขาเข้า (`/opt/hermes/tools/transcription_tools.py`), `/voice` command → ตอบเป็น voice bubble (`tools/tts_tool.py`)
- `/voice on` → mode `voice_only` (พูดเข้า→เสียงออก, พิมพ์เข้า→ข้อความออก); `/voice tts` → mode `all` (ทุกคำตอบเป็นเสียง); `/voice off` → ปิด. State เก็บใน `/opt/data/gateway/voice_modes.json` **persist ข้าม restart** ต่อ chat
- TTS = Edge TTS ฟรี ไม่ใช้ key. เสียงไทยยืนยันจาก `edge_tts.list_voices()`: `th-TH-NiwatNeural` (ชาย), `th-TH-PremwadeeNeural` (หญิง). ใช้อยู่: **Premwadee (หญิง)**
- `hermes serve` = JSON-RPC สำหรับ desktop app — **ไม่ใช่** OpenAI-compatible endpoint, HA ต่อตรงไม่ได้
- `openai` package มีใน venv แล้ว → Groq STT ต้องแค่ `GROQ_API_KEY` ไม่ต้องลง package
- **Persistence**: image seal `/opt/hermes` read-only + `HERMES_DISABLE_LAZY_INSTALLS=1` แต่มี durable target `HERMES_LAZY_INSTALL_TARGET=/opt/data/lazy-packages` (bind mount, append-only บน sys.path) → lazy install ลงตรงนั้น รอด container recreate. **ไม่ต้องแตะ Dockerfile**

---

## Phase 1 — Telegram voice สองทาง

ข้อจำกัดที่ยอมรับ: ฝั่งรับต้องกด play (มือถือยกแนบหู = raise-to-listen เล่นเอง + อัดตอบต่อได้เลย, PC ต้องคลิก)

### ✅ ครึ่ง TTS (ขาออก) — เสร็จ 2026-08-27

1. ~~ลง `edge-tts` เข้า durable store~~ — `docker exec -u hermes hermes python -c "from tools.lazy_deps import ensure; ensure('tts.edge')"` → ลง `edge-tts==7.2.7` ที่ `/opt/data/lazy-packages/`. verify: `import edge_tts` = 7.2.7
2. ~~แก้ `/opt/data/config.yaml`~~ — backup `config.yaml.bak.voice-20260827081921`; เพิ่ม:
   ```yaml
   tts:
     provider: edge
     edge:
       voice: th-TH-PremwadeeNeural   # voice อยู่ใต้ tts.edge.voice — ไม่ใช่ tts.voice
   ```
   + เปลี่ยน `stt.language: en` → `th`
   (2026-08-27 เปลี่ยนชาย Niwat → หญิง Premwadee ตามที่ user ขอ. backup `config.yaml.bak.voice-f-20260827083201`. สลับได้แค่แก้ค่านี้ + restart)
3. ~~restart~~ — `container_action restart hermes`. verify: 0 traceback, s6 services started, Telegram adapter reconnect, `load_config()` เห็น `tts.provider=edge`
4. ~~verify TTS จริง~~ — `text_to_speech_tool(text="สวัสดีครับ…")` → MP3 23KB 3.9s ที่ `/opt/data/cache/audio/`

**เหลือ**: user พิมพ์ `/voice tts` (หรือ `/voice on`) ใน Telegram → ยืนยันคำตอบกลับมาเป็น voice bubble เสียงไทย ทั้งมือถือ + Desktop

### ✅ ครึ่ง STT (ขาเข้า) ผ่าน Groq — เสร็จ 2026-08-27

1. ~~`GROQ_API_KEY` เข้า `/opt/data/.env`~~ (บรรทัดที่ 9). hermes โหลด `$HERMES_HOME/.env` ตอน start เอง — compose ไม่มี `env_file:`
2. ~~config: `stt.provider: groq`~~ (`stt.groq.model` default = `whisper-large-v3-turbo`). backup `config.yaml.bak.groq-20260827082708`
3. ~~restart~~ — 0 traceback; `_get_provider()` = `groq`
4. ~~เทส round-trip~~ — TTS ไทย → `transcribe_audio()` ผ่าน Groq → ข้อความไทยกลับมาเกือบเป๊ะ ("อุณภูมิ" ตกไป 1 ตัว), เร็ว

**เหลือ**: user ส่ง voice note ไทยใน Telegram → ยืนยัน hermes echo transcript + ตอบ

หมายเหตุ mixed ไทย+อังกฤษ: เทส `stt.language: th` vs `''` ได้ผลเท่ากันเป๊ะ (ไม่ต่าง) — Groq turbo ถอดคำอังกฤษที่พูดในประโยคไทยเป็นอักษรไทยอยู่ดี (แต่เทสนี้ใช้ TTS เสียงไทยออกเสียงอังกฤษเพี้ยน = pessimistic; คนพูดอังกฤษชัด ๆ น่าจะดีกว่า). คง `th` ไว้ — ไม่เสียหาย ช่วยเคสไทยล้วนซึ่งเป็นส่วนใหญ่

Fallback ถ้าเลิกใช้ Groq: `docker exec -u hermes hermes python -c "from tools.lazy_deps import ensure; ensure('stt.local')"` + `stt.provider: local` + `stt.local.model: small` — ฟรี offline แต่ J4125 ช้า 10–30 วิ/ประโยค, ไทยแม่นน้อยกว่า

---

## Phase 2 — HA Assist hands-free

เป้า: กดไมค์ใน HA companion app / เว็บ → พูด → เสียงตอบเล่นอัตโนมัติ ไม่ต้องกด play

### 🔴 BLOCKER พบ 2026-08-27: hermes agent latency

hermes มี OpenAI-compatible API server ในตัว (`gateway/platforms/api_server.py`, `POST /v1/chat/completions` รัน agent เต็ม). เปิดแล้ว:
- `API_SERVER_KEY` ใน `/opt/data/.env` (bind localhost:8642 เท่านั้น, LAN เข้าไม่ได้ — verify แล้ว), key เก็บที่ session scratchpad `/tmp/hermes_api_key.txt`
- `/v1/models` + `/v1/chat/completions` ทำงาน, รองรับ `X-Hermes-Session-Id` header (session continuity)

**วัด latency (curl, host localhost):**
| call | prompt tokens | เวลา | หมายเหตุ |
|---|---|---|---|
| cold, tool ("ไฟห้องนั่งเล่นเปิดไหม") | 113k | **38s** | ตอบถูก terse |
| warm, no tool ("กี่โมง") | 48k | 12s | ตอบผิด (UTC) |
| warm, tool ("เปิดไฟห้องนั่งเล่น") | 24k | 7s | ไม่ทำ — ถามกลับ "6 ดวง ดวงไหน?" |

7–38s + ไม่สม่ำเสมอ + บางทีถามกลับ → **ใช้เป็น hands-free voice ไม่ได้** (voice ต้องการ <5s). สาเหตุ: prompt 100k+ (toolset+memory เต็ม) ทุก call + codex `gpt-5.6-terra` ช้า + agentic loop

### ทางเลือก (รอ user ตัดสิน)

1. **หยุด Phase 2** — Telegram raise-to-listen (Phase 1) ได้เสียงสองทาง สมองเดียวกัน อยู่แล้ว. Phase 2 เพิ่ม dead air 7–38s + ต้อง restart HA แลกกับได้ไม่มาก
2. **แยกสมอง** — HA native Assist (conversation.home_assistant + LLM tool-calling) คุมบ้านเร็ว 1–3s; hermes-by-voice อยู่แค่ Telegram. ต่างงานต่างเครื่องมือ
3. **ลด latency hermes** — เพิ่ม `platform_toolsets.api_server:` ใน config เหลือ `[homeassistant, clarify]` → prompt ลงเหลือ ~10–20k, น่าจะ 3–8s. ต้องลอง, payoff ไม่แน่. ถ้าได้ → เขียน custom `conversation` + `stt` component (~60–80 บรรทัด, ยิง Groq STT ตรง + hermes /v1) — HA `openai_conversation` built-in **ไม่มี** base_url option (เช็คแล้ว), Extended OpenAI Conversation HACS เสี่ยง 2026.8 compat

### แผนเดิม (ถ้าเดินหน้า option 3)

- STT: Groq `/openai/v1/audio/transcriptions` ตรง (reuse key) — ไม่ต้อง wyoming container (J4125 ช้า, ตัดทิ้งไปแล้ว)
- Agent: custom `conversation` platform → hermes localhost:8642 + `X-Hermes-Session-Id`
- TTS: `tts.google_translate_en_com` ตั้ง `language: th` ตอนเรียก (entity ปัจจุบันเป็น en) หรือเพิ่ม entry ที่ 2 / edge-tts HACS
- Pipeline + companion app
- ⚠️ ต้อง restart HA (custom_components + config entry) — ระบบที่บ้านใช้อยู่

ปฏิเสธไปแล้ว: Piper TTS (เสียงไทยคุณภาพต่ำ), wyoming-whisper local (J4125 ช้า), container เว็บ voice page เขียนเอง
