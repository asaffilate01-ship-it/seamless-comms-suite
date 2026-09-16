"""Signed server-to-server identity; browser-supplied roles are never accepted."""
import base64
import hashlib
import hmac
import json
import re
import time
from .engine import Actor
from knowledge_core.types import APIError, fields, identifier

def verify(engine, raw, headers, secret, now=None):
    if len(secret) < 32:
        raise RuntimeError("TRANSFORMATION_SIGNING_KEY must contain at least 32 characters")
    now = int(time.time()) if now is None else now
    stamp = headers.get("X-OQ-Timestamp", "")
    nonce = headers.get("X-OQ-Nonce", "")
    context = headers.get("X-OQ-Context", "")
    supplied = headers.get("X-OQ-Signature", "")
    if not stamp.isdigit() or abs(now-int(stamp)) > 90 or not re.fullmatch(r"[a-zA-Z0-9-]{16,100}", nonce) or len(context) > 4000:
        raise APIError(401, "Invalid or expired signed request")
    payload = stamp.encode()+b"\n"+nonce.encode()+b"\n"+context.encode()+b"\n"+raw
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, supplied):
        raise APIError(401, "Invalid request signature")
    try:
        identity = json.loads(base64.urlsafe_b64decode(context + "=" * (-len(context) % 4)))
        fields(identity, {"tenant", "user", "tenant_role"}, {"tenant", "user", "tenant_role"})
        actor = Actor(identifier(identity["tenant"], "tenant"), identifier(identity["user"], "user"), identity["tenant_role"])
        if actor.tenant_role not in {"owner", "admin", "manager", "member", "agent", "viewer"}:
            raise ValueError()
    except (ValueError, TypeError, KeyError, APIError):
        raise APIError(401, "Invalid signed identity") from None
    with engine.connection(actor=actor) as db:
        db.execute("DELETE FROM nonces WHERE expires<?", (now,))
        if db.execute("SELECT 1 FROM nonces WHERE id=?", (nonce,)).fetchone():
            raise APIError(409, "Signed request already consumed")
        db.execute("INSERT INTO nonces VALUES(?,?)", (nonce, now+180))
    return actor
