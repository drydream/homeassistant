"""Fetch full-history Google Calendar events, bypassing HA's built-in -90 day sync limit."""
import json
import urllib.error
import urllib.parse
import urllib.request

CALENDAR_ID = "2c891ae567b92be9efbc16f6de84f6a8654958495bbd71e9ba7770325060f508@group.calendar.google.com"
TIME_MIN = "2025-01-01T00:00:00Z"
TIME_MAX = "2028-01-01T00:00:00Z"


def _get_access_token():
    with open("/config/.storage/application_credentials", encoding="utf-8") as f:
        creds = json.load(f)["data"]["items"]
    cred = next(c for c in creds if c["domain"] == "google")

    with open("/config/.storage/core.config_entries", encoding="utf-8") as f:
        entries = json.load(f)["data"]["entries"]
    entry = next(e for e in entries if e["domain"] == "google")
    refresh_token = entry["data"]["token"]["refresh_token"]

    body = urllib.parse.urlencode({
        "client_id": cred["client_id"],
        "client_secret": cred["client_secret"],
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }).encode()
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=body)
    with urllib.request.urlopen(req) as r:
        return json.load(r)["access_token"]


def main():
    access_token = _get_access_token()
    url = (
        "https://www.googleapis.com/calendar/v3/calendars/"
        + urllib.parse.quote(CALENDAR_ID, safe="")
        + "/events?"
        + urllib.parse.urlencode({
            "timeMin": TIME_MIN,
            "timeMax": TIME_MAX,
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": "2500",
        })
    )
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {access_token}"})
    with urllib.request.urlopen(req) as r:
        items = json.load(r)["items"]

    events = []
    for it in items:
        events.append({
            "start": it["start"].get("dateTime", it["start"].get("date")),
            "end": it["end"].get("dateTime", it["end"].get("date")),
            "summary": it.get("summary", ""),
            "description": it.get("description", ""),
        })

    print(json.dumps({"events": events}, ensure_ascii=False))


if __name__ == "__main__":
    main()
