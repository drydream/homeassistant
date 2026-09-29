"""Set kanban status on a Google Calendar event (extendedProperties.private.status)."""
import json
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, "/config")
from google_calendar_history import CALENDAR_ID, _get_access_token

ALLOWED = ("planning", "ongoing", "done")


def main():
    event_id, status = sys.argv[1], sys.argv[2]
    if status not in ALLOWED:
        sys.exit(f"bad status: {status}")
    token = _get_access_token()
    url = (
        "https://www.googleapis.com/calendar/v3/calendars/"
        + urllib.parse.quote(CALENDAR_ID, safe="")
        + "/events/"
        + urllib.parse.quote(event_id, safe="")
    )
    body = json.dumps({"extendedProperties": {"private": {"status": status}}}).encode()
    req = urllib.request.Request(url, data=body, method="PATCH",
                                 headers={"Authorization": f"Bearer {token}",
                                          "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        print(f"status {event_id} -> {status}: HTTP {r.status}")  # expect 200


if __name__ == "__main__":
    main()
