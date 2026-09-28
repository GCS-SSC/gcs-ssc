"""Initialize a fresh Metabase task before its CloudFront endpoint is enabled."""

import json
import os
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE = os.environ.get("METABASE_BASE_URL", "http://127.0.0.1:3000")


def properties():
    with urlopen(f"{BASE}/api/session/properties", timeout=5) as response:
        return json.load(response)


def main():
    for _ in range(120):
        try:
            current = properties()
            break
        except (HTTPError, URLError, TimeoutError):
            time.sleep(5)
    else:
        raise RuntimeError("Metabase did not become ready for administrator setup")

    token = current.get("setup-token")
    if not token:
        print("Metabase administrator already initialized", flush=True)
        return

    payload = {
        "token": token,
        "user": {
            "first_name": "GCS",
            "last_name": "Demo Admin",
            "email": os.environ["METABASE_ADMIN_EMAIL"],
            "password": os.environ["METABASE_ADMIN_PASSWORD"],
        },
        "prefs": {"site_name": "GCS-SSC Demo"},
    }
    request = Request(
        f"{BASE}/api/setup",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30):
            pass
    except HTTPError:
        # A replacement task may race a previous task's successful setup.
        if properties().get("setup-token"):
            raise
    print("Metabase administrator initialized", flush=True)


if __name__ == "__main__":
    main()
