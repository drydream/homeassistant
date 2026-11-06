#!/usr/bin/env bash
# LG TV (webOS, rooted) helper. Same on both PCs; key comes from NAS secrets.
#   tv.sh sh '<cmd>'            run as prisoner (dev mode user)
#   tv.sh root '<cmd>'          run as root via Homebrew Channel exec
#   tv.sh install <ipk> <id>    sideload ipk through appInstallService
#   tv.sh pack <app_dir>        build ipk with pack.py into ./out (config.js pulled from NAS if missing)
set -euo pipefail

TV=${TV_HOST:-192.168.1.115}
KEY=~/.ssh/webos_tv_rsa
NAS_KEY=//100.103.51.128/champ/ha-secrets/webos_tv_rsa
OPENSSH=/c/Windows/System32/OpenSSH
OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=no
      -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa -i "$KEY")
HERE=$(cd "$(dirname "$0")" && pwd)

sync_key() {
  if cp "$NAS_KEY" "$KEY.new" 2>/dev/null ||
     "$OPENSSH/ssh.exe" -n -o BatchMode=yes drydream@100.103.51.128 \
       cat /volume1/champ/ha-secrets/webos_tv_rsa > "$KEY.new"; then
    [ -s "$KEY.new" ] && mv "$KEY.new" "$KEY"
  fi
  rm -f "$KEY.new"
  [ -s "$KEY" ] || { echo "no TV key at $KEY" >&2; exit 1; }
}

tv_ssh() { "$OPENSSH/ssh.exe" "${OPTS[@]}" -p 9922 "prisoner@$TV" "$@"; }

root() {
  local b64 json
  b64=$(printf '%s' "$1" | base64 -w0)
  json=$(tv_ssh "luna-send-pub -n 1 luna://org.webosbrew.hbchannel.service/exec '{\"command\":\"sh -c \\\"\$(echo $b64 | base64 -d)\\\" </dev/null\"}'")
  node -e 'const r=JSON.parse(process.argv[1]);
    process.stdout.write(r.stdoutString||"");process.stderr.write(r.stderrString||r.errorText||"");
    process.exit(r.returnValue?0:1)' "$json"
}

install() {
  local ipk=$1 id=$2 dest=/media/developer/temp/$2.ipk
  "$OPENSSH/scp.exe" "${OPTS[@]}" -P 9922 "$(cygpath -w "$ipk")" "prisoner@$TV:$dest"
  tv_ssh "luna-send-pub -n 30 -w 60000 luna://com.webos.appInstallService/dev/install '{\"id\":\"$id\",\"ipkUrl\":\"$dest\",\"subscribe\":true}' | grep -m1 -E '\"(installed|failed)\"|errorCode'; rm -f $dest"
}

case ${1:-} in
  sh)      sync_key; tv_ssh "$2" ;;
  root)    sync_key; root "$2" ;;
  install) sync_key; install "$2" "$3" ;;
  pack)    [ -f "$2/config.js" ] || cp "//100.103.51.128/champ/ha-secrets/$(basename "$2")-config.js" "$2/config.js" 2>/dev/null || true
           python -I "$HERE/pack.py" "$2" "$HERE/out" ;;
  *)       sed -n '2,7p' "$0"; exit 1 ;;
esac
