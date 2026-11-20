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

`org.webosbrew.vncserver` on `192.168.1.115:5900`, 960x540, autostart via `/var/lib/webosbrew/init.d/webos-vncserver` (created by `configure {"autostart":true}`) → its `autostart.sh`. Password (8 chars, VNC limit) in `champ\ha-secrets\lgtv-vnc-password`. Screenshot from either PC:

```bash
python -m venv ~/vncv && ~/vncv/Scripts/pip install vncdotool   # once per PC
~/vncv/Scripts/vncdo -s 192.168.1.115::5900 -p "$(cat //100.103.51.128/champ/ha-secrets/lgtv-vnc-password)" capture tv.png
```

After a (re)install its service file may still go through `jailer` → `start` returns `Message status unknown` → run `elevate-service org.webosbrew.vncserver.service` (see Gotchas), then `configure '{"password":"…","autostart":true}'`.

## Debugging a dev app (CDP)

Dev Mode exposes Chrome DevTools on `http://192.168.1.115:9998/json` for dev-installed web apps. `Runtime.evaluate` over its `webSocketDebuggerUrl` reads/sets live JS state (e.g. FreeMyTV `window.owlFps`).

Screensaver: removed 2026-11-20 (user doesn't want one). Aerial mod (`org.rchalaaa.webos.custom-screensaver`, a bind-mount of its QML over `com.webos.app.screensaver/qml/main.qml` from init.d `50-custom-screensaver-aerial`) unapplied + deleted, system `general.screenSaverEnabled=off`, FreeMyTV's 3-min idle trigger and camera pause gone.

## Carport PiP

`lgtv/apps/carportpip` (`org.drydream.carportpip`): web app with `"defaultWindowType": "overlay"` → transparent window on top of any app, Netflix keeps playing (its media pipeline is untouched). Shows `params.src` (HA `camera_proxy_stream` MJPEG of `camera.carport_direct_minorstream`, ~18 fps, token from the camera's rotating `entity_picture`, so no HA secret in the app) top-right 640x360 for `params.secs` (10 s from the automation), then `window.close()`. Back closes it early. Launched by automation `lg_tv_carport_pip_on_motion` via `webostv.command` `system.launcher/launch` on `binary_sensor.carport_direct_cell_motion_detection` → on (skipped when TV off or on Free My TV, 60 s cooldown).

Checking it: VNC captures only black while Netflix (DRM) plays, and an app launched over SSAP does not show in `applicationManager/running`. Use `grep carportpip /var/log/messages` → `LSM NL_VSC visible:true/false` lines.

## Castle theme (owl + castle backdrop)

FreeMyTV wears the castle scene and owl from [ikevinadams/hogwarts-tv-home](https://github.com/ikevinadams/hogwarts-tv-home) (Android TV APK; only its web page was ported). `owl-perch.js` = owl perched on the focused `.app-tile`, hops to the next (sprites + `OWL_SHEETS` from the repo's TV-packed `hogwarts-tv/app/src/main/assets/www/owl/`). `castle.js` = backdrop, TV-mode subset (`www/img/`: castle.jpg, mist.png, windows_a_crop.png, layers.js, points.js): candle windows, moon glow, mist, stars, lake glints, shooting star. `castle.js` also restyles the clock + hero title in the Harry P font (dafont `harry_p`, free personal use → `castle/harryp.ttf`, gitignored: `curl -sL -o hp.zip 'https://dl.dafont.com/dl/?f=harry_p'`, unzip `HARRYP__.TTF`), lifts the hero text clear of the owl and hides the "Favorite Apps" label (always under the owl). Theme music `castle/theme.mp3` (gitignored) loops at volume 0.6 (thunder 0.25) only while FreeMyTV is in front (pauses on `visibilitychange`); rebuild: `yt-dlp -x --audio-format mp3 -o src.%(ext)s https://youtu.be/6gN6-vt6Uf8` then `ffmpeg -ss 2.6 -i src.mp3 -af "afade=t=in:d=0.4,afade=t=out:st=31.0:d=2.0" -b:a 128k theme.mp3` (drops the lead silence, fades the seam). Owl landing = lightning strike: full-screen canvas (hidden between strikes), jagged bolt + flash + blue-white frame flare, `castle/thunder.mp3` (gitignored): real recording [Thunder crack 2B](https://commons.wikimedia.org/wiki/File:Thunder_crack_2B.ogg) by Jud McCranie, CC BY-SA 4.0, cut so the crack lands ~0.1 s after the bolt: `ffmpeg -ss 3.45 -t 6 -i Thunder_crack_2B.ogg -af "afade=t=in:d=0.03,afade=t=out:st=3.5:d=2.5,loudnorm=I=-16:TP=-1.5,aresample=44100" -ac 2 -b:a 128k thunder.mp3` (a synthesized one sounded silly). Skipped when the owl is about to spring on. Frame times during a hop ~31 ms avg, 67-117 ms spikes around the strike (2026-11-20).

Assets are fan art (personal use) → **gitignored** (`lgtv/.gitignore`), not in this public repo. Fresh checkout / other PC, before `tv.sh pack`:

```bash
cd /z/homeassistant/lgtv/apps/freemytv; R=ikevinadams/hogwarts-tv-home W=hogwarts-tv/app/src/main/assets/www
mkdir -p owl castle
for n in hop.webp idle.webp owl.js; do curl -sL -o owl/$n https://raw.githubusercontent.com/$R/main/$W/owl/$n; done
for n in castle.jpg mist.png windows_a_crop.png layers.js points.js; do curl -sL -o castle/$n https://raw.githubusercontent.com/$R/main/$W/img/$n; done
```

Perf (CDP `window.owlFps`, 2026-11-20): plain FreeMyTV ~60, + owl ~58 (hop 44-55), + full castle ~33 → dropped the original's slow camera drift (~10 fps) and the separate full-screen shade layer (~5 fps, shade now painted into the photo's own background) → ~51. Skipped: library + greenhouse scenes (films only open a search in TH).

## Key rotation

Key + passphrase change when the Dev Mode app is reinstalled / re-logged. Open Dev Mode app on the TV (Key Server `:9991` only listens while it is open), then:

```bash
curl -s http://192.168.1.115:9991/webos_rsa -o /tmp/k && ssh-keygen -p -P <on-screen passphrase> -N "" -m PEM -f /tmp/k
cp /tmp/k //100.103.51.128/champ/ha-secrets/webos_tv_rsa && rm /tmp/k
```

Also update secret `lg_devmode_renew_url` (token: from the Dev Mode app / LG dev site; `/var/luna/preferences/devmode_enabled` is a directory on this TV now, see Gotchas).

## Gotchas

- TV sshd needs RSA-SHA1: `-o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa` (else `no mutual signature supported`).
- `errorCode -5 "ipk verified failed"` = timestamps inside the ipk are **ahead of the TV clock**. TV time is correct; the notebook's clock was +78 s (w32time never synced, fixed 2026-11-06 → time.google.com). A fresh build failed until real time caught up, which is why "retry 2-3×" used to work. `pack.py` stamps everything 1 day back → installs first try (verified 2026-11-06, fresh vs backdated 2/2). Any other packager: backdate mtimes the same way.
- Installing over the **foreground** app closes it → TV falls back to the last input (HDMI 3 Chromecast). Looks like "the TV jumps to Chromecast by itself"; check `/var/log/messages` for `last_input_handler` next to `NL_APP_INSTALLED`. `tv.sh install` relaunches the app if it was in front.
- Reinstalling a homebrew app through dev install drops its service elevation → its luna calls return nothing. Fix: `./tv.sh root '/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service <service id>'`.
- Input Hook after a reinstall: `luna-send-pub luna://org.webosbrew.inputhook.service/autostart '{}'` then `/start` (creates `/var/lib/webosbrew/init.d/inputhook`).
- Wipe protection (fixed 2026-11-20, read from the TV's scripts): the boot script is **systemd `/lib/systemd/system/scripts/devmode.sh`** (`/etc/init/devmode.conf` is an unused upstart copy). It runs LG's signed `start-devmode.sh`, which (online) sends `$(cat /var/luna/preferences/devmode_enabled)` as `sessionToken` to `CheckDevModeSession.dev` and on `"result":"fail"` does `rm -rf devmode_enabled`; it also removes it when the Dev Mode app version differs from `login.json` (both `1.12.2` now). `devmode.sh` then wipes `/media/developer` + `/var/palm/ls2-dev` when the flag is missing — normally only at the **next** boot, because `start-devmode.sh` never returns (it runs `sshd -D`). The 2026-11-06 "empty directory" trick was wrong: `cat` of a directory gives an empty token → `fail` → flag removed at the 2026-11-20 boot (apps survived only because of the blocking sshd), next boot would have wiped everything. **Now `devmode_enabled` is a 64-byte file holding the live session token** (same token as HA secret `lg_devmode_renew_url`), which is LG's own normal state; simulated the boot check on the TV → `success`. **Verified by a real reboot 2026-11-20 19:54**: flag file kept, `devSessionTime` rewritten (984 h), all 11 dev apps there, `root:true`, `/dev/install` back (`tv.sh install` of FreeMyTV 1.3.1 OK). Keeps working as long as the session stays alive (HA renew) — if the token ever changes (Dev Mode app re-login writes `download/sessionToken`, which `start-devmode.sh` moves into the flag file by itself), update the HA secret. HB's `startup.sh` already clears the `dc*` reboot counter each boot. Still wiped by: uninstalling/updating LG's Dev Mode app, factory reset, firmware update (blocked).
- Dev Mode lapse wipes **every** dev app incl. HB Channel, root does not protect them (2026-10-31). Things outside app dirs survive: `/home/root/.config/lginputhook/keybinds.json`, `/var/lib/webosbrew/*` (startup.sh, nospy state), `/var/luna/preferences/*`.
- 2026-11-20: after the 19:06 boot `appInstallService/dev/install` answered `Unknown method "install" for category "/dev"` (flag removed by the session check above, see Wipe protection). Workaround while `/dev` is missing: copy files straight into `/media/developer/apps/usr/palm/applications/<id>/` as root (scp to `/media/developer/temp`, then `tar -x`), then `location.reload()` over CDP. `/dev` comes back after a reboot with a valid flag.
- busybox: `timeout -t 45`, not `timeout 45`.
- Root exec scripts must not reach `sh` on stdin (`... | base64 -d | sh`): `luna-send` reads stdin and silently swallows the rest of the script. `tv.sh root` runs `sh -c "<script>" </dev/null`.
- nospy: `nospy-ctl.sh apply` runs as a background job — poll `status` until `job=done`, read `joblog`.
- Input Hook UI: never press "Save changes" if it loaded before a file edit — overwrites keybinds with stale data.
- Dev apps can't call `listLaunchPoints` / `tvpower` → icons pulled via HA (aiowebostv).

## Reinstall checklist (after a Dev Mode wipe)

1. Re-root, HB Channel → check `./tv.sh sh "luna-send-pub -n 1 luna://org.webosbrew.hbchannel.service/getConfiguration '{}'"` → `root:true`, `blockUpdates:true`.
2. From HB Channel UI: LG Input Hook, Life's Good Without Spying, Moonfin (Jellyfin NAS :8096), Moonlight, YouTube AdFree (official YouTube must be removed as root first, same app id), Twitch AdFree.
3. nospy: `init/nospy-ctl.sh set/enable` as root with `domains.updates=on` (its hosts bind-mount replaces HB's update block), thinq/lan.block off (HA needs them).
4. (no screensaver: Aerial removed 2026-11-20; keep `general.screenSaverEnabled=off`)
5. FreeMyTV fork `org.webos.freemytv` from `lgtv/apps/freemytv` (+ `config.js` with HA user **TV** token from secrets).
6. VNCServer + Open Service Menu from HB (one HB install at a time, parallel = `duplicate command`), then the VNC steps above.
7. Shelf (8 tiles; 9 still fits 1920px, 10 overflows): YT, Netflix, Moonfin, Moonlight, Twitch | Chromecast | Browser, Homebrew. VNC + Service Menu in Customize only.
