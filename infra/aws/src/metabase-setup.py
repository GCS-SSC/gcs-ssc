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


def verify_administrator():
    request = Request(
        f"{BASE}/api/session",
        data=json.dumps({"username": os.environ["METABASE_ADMIN_EMAIL"],
                         "password": os.environ["METABASE_ADMIN_PASSWORD"]}).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urlopen(request, timeout=30) as response:
        session = json.load(response)
    try:
        request = Request(f"{BASE}/api/user/current", headers={"X-Metabase-Session": session["id"]})
        with urlopen(request, timeout=10) as response:
            user = json.load(response)
        if user.get("email") != os.environ["METABASE_ADMIN_EMAIL"] or user.get("is_superuser") is not True:
            raise RuntimeError("Metabase expected administrator verification failed")
    finally:
        request = Request(f"{BASE}/api/session", headers={"X-Metabase-Session": session["id"]}, method="DELETE")
        with urlopen(request, timeout=10):
            pass


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
    if token:
        payload = {
            "token": token,
            "user": {
                "first_name": "GCS", "last_name": "Demo Admin",
                "email": os.environ["METABASE_ADMIN_EMAIL"],
                "password": os.environ["METABASE_ADMIN_PASSWORD"],
            },
            "prefs": {"site_name": "GCS-SSC Demo"},
        }
        request = Request(f"{BASE}/api/setup", data=json.dumps(payload).encode(),
                          headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urlopen(request, timeout=30):
                pass
        except HTTPError:
            # Replacement tasks may race; only verified credentials establish success.
            if properties().get("setup-token"):
                raise
    verify_administrator()
    print("Metabase administrator verified", flush=True)


if __name__ == "__main__":
    main()
