#!/usr/bin/env python3
"""Exports Edge cookies to /tmp/dn-edge-cookies.json for demo recording.

Live-site GIFs (bilibili etc.) need a logged-in session. Copying the Edge
profile does not work: the cookie key lives in the macOS Keychain, so the
values stay encrypted. This decrypts them with that key and writes a JSON
file that `scripts/record-demo.cjs` feeds to Playwright.

Only cookies for the demo domains are exported, and only to /tmp.
"""
import hashlib
import json
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

EDGE_PROFILE = Path.home() / "Library/Application Support/Microsoft Edge/Default"
KEYCHAIN_SERVICE = "Microsoft Edge Safe Storage"
OUTPUT = Path("/tmp/dn-edge-cookies.json")
DOMAINS = ("bilibili", "youtube", "xiaohongshu")


def keychain_password():
    try:
        return subprocess.check_output(
            ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
            stderr=subprocess.DEVNULL,
        ).strip()
    except subprocess.CalledProcessError:
        sys.exit(f"No keychain entry for {KEYCHAIN_SERVICE!r}. Open Edge once first.")


def decrypt(encrypted, key):
    if not encrypted or encrypted[:3] != b"v10":
        return None
    result = subprocess.run(
        ["openssl", "enc", "-d", "-aes-128-cbc", "-K", key.hex(), "-iv", (b" " * 16).hex()],
        input=encrypted[3:],
        capture_output=True,
    )
    if result.returncode != 0:
        return None
    plaintext = result.stdout
    # Newer Chromium builds prefix the value with SHA256(host_key).
    for offset in (32, 0):
        try:
            value = plaintext[offset:].decode("utf-8")
        except UnicodeDecodeError:
            continue
        if value and all(32 <= ord(c) < 127 for c in value[:40]):
            return value
    return None


def main():
    password = keychain_password()
    key = hashlib.pbkdf2_hmac("sha1", password, b"saltysalt", 1003, 16)

    # Work on a copy: Edge keeps the live database locked.
    with tempfile.TemporaryDirectory() as tmp:
        copy = Path(tmp) / "Cookies"
        shutil.copy2(EDGE_PROFILE / "Cookies", copy)
        connection = sqlite3.connect(f"file:{copy}?mode=ro", uri=True)
        rows = connection.execute(
            "SELECT host_key, name, encrypted_value, path, expires_utc, is_secure, is_httponly "
            "FROM cookies"
        ).fetchall()
        connection.close()

    cookies = []
    for host, name, encrypted, path, expires, secure, http_only in rows:
        if not any(domain in host for domain in DOMAINS):
            continue
        value = decrypt(encrypted, key)
        if value is None:
            continue
        # Chromium epoch starts 1601-01-01.
        expires_s = int(expires / 1_000_000 - 11_644_473_600) if expires else -1
        cookies.append(
            {
                "name": name,
                "value": value,
                "domain": host,
                "path": path or "/",
                "expires": expires_s,
                "secure": bool(secure),
                "httpOnly": bool(http_only),
                "sameSite": "Lax",
            }
        )

    OUTPUT.write_text(json.dumps(cookies))
    OUTPUT.chmod(0o600)
    print(f"Exported {len(cookies)} cookies to {OUTPUT}")


if __name__ == "__main__":
    main()
