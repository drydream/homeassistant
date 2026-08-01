#!/bin/sh
# Weekly check: home-assistant-skills plugin + pinned docker image versions -> notify HA
STATE_DIR="/volume1/docker/homeassistant"
COMPOSE="$STATE_DIR/docker-compose.yml"
WEBHOOK="http://localhost:8123/api/webhook/ha_skill_update_check"

MSG=""
add_msg() {
    MSG="${MSG:+$MSG / }$1"
}

# 1. home-assistant-skills plugin (main branch)
SKILLS_LATEST=$(git ls-remote https://github.com/homeassistant-ai/skills.git refs/heads/main | cut -f1)
SKILLS_LAST=""
[ -f "$STATE_DIR/.ha_skill_last_sha" ] && SKILLS_LAST=$(cat "$STATE_DIR/.ha_skill_last_sha")
if [ -n "$SKILLS_LATEST" ] && [ "$SKILLS_LATEST" != "$SKILLS_LAST" ]; then
    add_msg "home-assistant-skills: new commit ($(echo "$SKILLS_LATEST" | cut -c1-7))"
fi

# 2. pinned docker images vs latest GitHub release
check_release() {
    # $1=display name  $2=owner/repo  $3=currently pinned version
    latest=$(curl -s "https://api.github.com/repos/$2/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)
    latest="${latest#v}"
    if [ -n "$latest" ] && [ "$latest" != "$3" ]; then
        add_msg "$1: $3 -> $latest"
    fi
}

HA_CUR=$(sed -n 's#.*homeassistant/home-assistant:\([0-9.]*\).*#\1#p' "$COMPOSE" | head -1)
Z2M_CUR=$(sed -n 's#.*koenkk/zigbee2mqtt:\([0-9.]*\).*#\1#p' "$COMPOSE" | head -1)
EMQX_CUR=$(sed -n 's#.*emqx/emqx:\([0-9.]*\).*#\1#p' "$COMPOSE" | head -1)

check_release "Home Assistant" "home-assistant/core" "$HA_CUR"
check_release "Zigbee2MQTT" "Koenkk/zigbee2mqtt" "$Z2M_CUR"
check_release "EMQX" "emqx/emqx" "$EMQX_CUR"

[ -z "$MSG" ] && exit 0

if curl -sf -X POST -H "Content-Type: application/json" \
    -d "{\"message\":\"$(printf '%s' "$MSG" | sed 's/"/\\"/g')\"}" \
    "$WEBHOOK" >/dev/null; then
    [ -n "$SKILLS_LATEST" ] && echo "$SKILLS_LATEST" > "$STATE_DIR/.ha_skill_last_sha"
fi
