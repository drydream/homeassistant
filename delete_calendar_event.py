"""Delete a Google Calendar event by id (companion to google_calendar_history.py)."""
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, "/config")
from google_calendar_history import CALENDAR_ID, _get_access_token


def main():
    event_id = sys.argv[1]
    token = _get_access_token()
    url = (
        "https://www.googleapis.com/calendar/v3/calendars/"
        + urllib.parse.quote(CALENDAR_ID, safe="")
        + "/events/"
        + urllib.parse.quote(event_id, safe="")
    )
    req = urllib.request.Request(url, method="DELETE",
                                 headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as r:
        print(f"deleted {event_id}: HTTP {r.status}")  # expect 204


if __name__ == "__main__":
    main()
