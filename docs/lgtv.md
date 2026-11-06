# LG TV (webOS) — sideload / root environment

LG 65UN7200PTF, `192.168.1.115`, webOS 5.6.2, Dev Mode + rooted (Homebrew Channel). Both PCs work from `lgtv/` in this repo (NAS-live via `Z:`, pushed to the **public** GitHub repo → no secrets in git).

## Layout

| Path | What |
|------|------|
| `lgtv/tv.sh` | helper (Git Bash): `sh`, `root`, `install`, `pack` |
| `lgtv/pack.py` | ipk builder (same layout as ares-package, no JS minify) |
| `lgtv/apps/<name>/` | app sources we build ourselves (FreeMyTV fork, repacked 3rd-party apps) |
| `lgtv/out/` | built ipks (gitignored) |
| `lgtv/apps/*/config.js` | per-app secrets (gitignored) — master copy in `champ\ha-secrets\` |
| `\\100.103.51.128\champ\ha-secrets\webos_tv_rsa` | decrypted Dev Mode SSH key; `tv.sh` copies it to `~/.ssh/webos_tv_rsa` each run (falls back to `ssh nas cat` when the UNC path is unreadable) |

```bash
cd /z/homeassistant/lgtv
./tv.sh sh   'ls /media/developer/apps/usr/palm/applications'
./tv.sh root 'cat /home/root/.config/lginputhook/keybinds.json'   # any shell, quoting-safe (base64)
./tv.sh pack apps/freemytv            # → out/*.ipk via pack.py (no ares/npx); copies apps/<name>/config.js from ha-secrets/<name>-config.js if missing
./tv.sh install out/x.ipk org.example.app
```

Catalog apps (repo.webosbrew.org): install through HB Channel's own service, the TV downloads + checks sha256 + elevates services — `luna-send-pub -i luna://org.webosbrew.hbchannel.service/install '{"ipkUrl":..,"ipkHash":<sha256 from the app manifest>,"subscribe":true}'`. Run it in the background on the TV and poll its output: the subscription never closes by itself and busybox `timeout` does not kill it.

## Key rotation

Key + passphrase change when the Dev Mode app is reinstalled / re-logged. Open Dev Mode app on the TV (Key Server `:9991` only listens while it is open), then:

```bash
curl -s http://192.168.1.115:9991/webos_rsa -o /tmp/k && ssh-keygen -p -P <on-screen passphrase> -N "" -m PEM -f /tmp/k
cp /tmp/k //100.103.51.128/champ/ha-secrets/webos_tv_rsa && rm /tmp/k
```

Also update secret `lg_devmode_renew_url` (token in `/var/luna/preferences/devmode_enabled`).

## Gotchas

- TV sshd needs RSA-SHA1: `-o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa` (else `no mutual signature supported`).
- `errorCode -5 "ipk verified failed"` is **not** reliably about the file: on 2026-11-06 the same FreeMyTV ipk failed 4× then installed unchanged (with `PmLogCtl set AppInstallD debug` + `pkgVerifier debug` on, which shows nothing useful at info level). Modes (777/666 are normal), ar mtime and odd member size were all ruled out. Retry before rebuilding. Aerial screensaver still fails (upstream ipk too) — pending.
- Reinstalling a homebrew app through dev install drops its service elevation → its luna calls return nothing. Fix: `./tv.sh root '/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service <service id>'`.
- Input Hook after a reinstall: `luna-send-pub luna://org.webosbrew.inputhook.service/autostart '{}'` then `/start` (creates `/var/lib/webosbrew/init.d/inputhook`).
- Dev Mode lapse wipes **every** dev app incl. HB Channel, root does not protect them (2026-10-31). Things outside app dirs survive: `/home/root/.config/lginputhook/keybinds.json`, `/var/lib/webosbrew/*` (startup.sh, nospy state), `/var/luna/preferences/*`.
- busybox: `timeout -t 45`, not `timeout 45`.
- Input Hook UI: never press "Save changes" if it loaded before a file edit — overwrites keybinds with stale data.
- Dev apps can't call `listLaunchPoints` / `tvpower` → icons pulled via HA (aiowebostv), screensaver test triggered as root.

## Reinstall checklist (after a Dev Mode wipe)

1. Re-root, HB Channel → check `./tv.sh sh "luna-send-pub -n 1 luna://org.webosbrew.hbchannel.service/getConfiguration '{}'"` → `root:true`, `blockUpdates:true`.
2. From HB Channel UI: LG Input Hook, Life's Good Without Spying, Moonfin (Jellyfin NAS :8096), Moonlight, YouTube AdFree (official YouTube must be removed as root first, same app id), Twitch AdFree.
3. nospy: `init/nospy-ctl.sh set/enable` as root with `domains.updates=on` (its hosts bind-mount replaces HB's update block), thinq/lan.block off (HA needs them).
4. Aerial screensaver `org.rchalaaa.webos.custom-screensaver` (repack), system `general.screenSaverEnabled=on` via root `luna-send .../settingsservice/setSystemSettings`.
5. FreeMyTV fork `org.webos.freemytv` from `lgtv/apps/freemytv` (+ `config.js` with HA user **TV** token from secrets).
6. Shelf: YT, Netflix, Moonfin, Moonlight | Chromecast, Twitch | Browser, Homebrew.
