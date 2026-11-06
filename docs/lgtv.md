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

## VNC (see the TV screen)

`org.webosbrew.vncserver` on `192.168.1.115:5900`, 960x540, autostart via `/var/lib/webosbrew/init.d/vncserver` → its `autostart.sh`. Password (8 chars, VNC limit) in `champ\ha-secrets\lgtv-vnc-password`. Screenshot from either PC:

```bash
python -m venv ~/vncv && ~/vncv/Scripts/pip install vncdotool   # once per PC
~/vncv/Scripts/vncdo -s 192.168.1.115::5900 -p "$(cat //100.103.51.128/champ/ha-secrets/lgtv-vnc-password)" capture tv.png
```

After a (re)install its service file may still go through `jailer` → `start` returns `Message status unknown` → run `elevate-service org.webosbrew.vncserver.service` (see Gotchas), then `configure '{"password":"…","autostart":true}'`.

## Key rotation

Key + passphrase change when the Dev Mode app is reinstalled / re-logged. Open Dev Mode app on the TV (Key Server `:9991` only listens while it is open), then:

```bash
curl -s http://192.168.1.115:9991/webos_rsa -o /tmp/k && ssh-keygen -p -P <on-screen passphrase> -N "" -m PEM -f /tmp/k
cp /tmp/k //100.103.51.128/champ/ha-secrets/webos_tv_rsa && rm /tmp/k
```

Also update secret `lg_devmode_renew_url` (token in `/var/luna/preferences/devmode_enabled`).

## Gotchas

- TV sshd needs RSA-SHA1: `-o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa` (else `no mutual signature supported`).
- `errorCode -5 "ipk verified failed"` = timestamps inside the ipk are **ahead of the TV clock**. TV time is correct; the notebook's clock was +78 s (w32time never synced, fixed 2026-11-06 → time.google.com). A fresh build failed until real time caught up, which is why "retry 2-3×" used to work. `pack.py` stamps everything 1 day back → installs first try (verified 2026-11-06, fresh vs backdated 2/2). Any other packager: backdate mtimes the same way.
- Reinstalling a homebrew app through dev install drops its service elevation → its luna calls return nothing. Fix: `./tv.sh root '/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service <service id>'`.
- Input Hook after a reinstall: `luna-send-pub luna://org.webosbrew.inputhook.service/autostart '{}'` then `/start` (creates `/var/lib/webosbrew/init.d/inputhook`).
- Dev Mode lapse wipes **every** dev app incl. HB Channel, root does not protect them (2026-10-31). Things outside app dirs survive: `/home/root/.config/lginputhook/keybinds.json`, `/var/lib/webosbrew/*` (startup.sh, nospy state), `/var/luna/preferences/*`.
- busybox: `timeout -t 45`, not `timeout 45`.
- Root exec scripts must not reach `sh` on stdin (`... | base64 -d | sh`): `luna-send` reads stdin and silently swallows the rest of the script. `tv.sh root` runs `sh -c "<script>" </dev/null`.
- nospy: `nospy-ctl.sh apply` runs as a background job — poll `status` until `job=done`, read `joblog`.
- Input Hook UI: never press "Save changes" if it loaded before a file edit — overwrites keybinds with stale data.
- Dev apps can't call `listLaunchPoints` / `tvpower` → icons pulled via HA (aiowebostv), screensaver test triggered as root.

## Reinstall checklist (after a Dev Mode wipe)

1. Re-root, HB Channel → check `./tv.sh sh "luna-send-pub -n 1 luna://org.webosbrew.hbchannel.service/getConfiguration '{}'"` → `root:true`, `blockUpdates:true`.
2. From HB Channel UI: LG Input Hook, Life's Good Without Spying, Moonfin (Jellyfin NAS :8096), Moonlight, YouTube AdFree (official YouTube must be removed as root first, same app id), Twitch AdFree.
3. nospy: `init/nospy-ctl.sh set/enable` as root with `domains.updates=on` (its hosts bind-mount replaces HB's update block), thinq/lan.block off (HA needs them).
4. Aerial screensaver `org.rchalaaa.webos.custom-screensaver` (repack), system `general.screenSaverEnabled=on` via root `luna-send .../settingsservice/setSystemSettings`.
5. FreeMyTV fork `org.webos.freemytv` from `lgtv/apps/freemytv` (+ `config.js` with HA user **TV** token from secrets).
6. VNCServer + Open Service Menu from HB (one HB install at a time, parallel = `duplicate command`), then the VNC steps above.
7. Shelf (max 9 tiles, 10 overflows 1920px): YT, Netflix, Moonfin, Moonlight, Twitch | Chromecast | Browser, Homebrew, VNC. Service Menu sits in Customize only.
