# Plugin Update Check

Weekly notification when the `home-assistant-skills` plugin has new commits, or when HA/Z2M/EMQX have a newer pinned-image release available. No auto-apply.

## Chain

DSM Task Scheduler (task id 3 `claude-ha-skill-update`, Control Panel → Task Scheduler, weekly Wed 09:00, root, user-defined script)
→ `/volume1/docker/homeassistant/scripts/ha-skill-check.sh`
→ (1) `git ls-remote` against the skills repo's `main` branch; SHA changed since last check (tracked in `/volume1/docker/homeassistant/.ha_skill_last_sha`, written **only** on a successful notify) → flag
→ (2) `GET /repos/<owner>/<repo>/releases/latest` for HA/Z2M/EMQX vs version pinned in `docker-compose.yml`; flagged only if `sort -V` puts the release above the pinned version (not just "different" — see gotcha below)
→ POST to HA webhook `ha_skill_update_check`
→ automation `ha_skill_update_check` in `automations.yaml`
→ mobile push notification

## Gotcha: GitHub `/releases/latest` is not "highest version"

It's the most **recently published** release, not the highest semver. Repos with parallel
release branches (e.g. `emqx/emqx` ships 6.1.x, 6.2.x, and enterprise `e5.x` concurrently) can
publish a patch on an older branch *after* a newer branch's release — `/releases/latest` then
returns the older-looking tag. Seen 2026-08-10: pinned EMQX 6.2.2, script reported
"6.2.2 -> 6.1.4" (a fake downgrade) because 6.1.4 was published after 6.2.2. Fixed by comparing
with `sort -V` and only flagging when the fetched tag is actually higher than the pinned one.

## On notification

```bash
claude plugin update home-assistant-skills@home-assistant-skills
git -C ~/.claude/plugins/marketplaces/home-assistant-skills log   # summarize the changelog
```

Restart required to take effect.
