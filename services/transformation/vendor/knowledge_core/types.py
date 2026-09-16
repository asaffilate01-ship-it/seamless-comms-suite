from dataclasses import dataclass
from datetime import date
import json
import re
from urllib.parse import urlparse


class APIError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def text(value, name, maximum=200, minimum=1):
    if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum:
        raise APIError(422, f"{name} must contain {minimum}–{maximum} characters")
    return value.strip()


def identifier(value, name):
    value = text(value, name, 100)
    if not re.fullmatch(r"[a-zA-Z0-9_.:-]+", value):
        raise APIError(422, f"Invalid {name}")
    return value


def integer(value, name, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise APIError(422, f"{name} must be an integer between {minimum} and {maximum}")
    return value


def iso_date(value, name):
    try:
        if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value:
            raise ValueError()
    except ValueError:
        raise APIError(422, f"{name} must be YYYY-MM-DD") from None
    return value


def fields(data, allowed, required=()):
    if not isinstance(data, dict):
        raise APIError(422, "Expected a JSON object")
    if set(data) - set(allowed):
        raise APIError(422, "Unexpected fields: " + ", ".join(sorted(set(data) - set(allowed))))
    if set(required) - set(data):
        raise APIError(422, "Missing required fields")


def source_uri(value):
    value = text(value, "source_uri", 1000)
    parsed = urlparse(value)
    if not ((parsed.scheme == "https" and parsed.hostname and not parsed.username)
            or (parsed.scheme == "urn" and parsed.path)):
        raise APIError(422, "source_uri must be an https URL or urn identifier")
    return value


@dataclass(frozen=True)
class Scope:
    project: str
    tenant: str
    collection: str

    @property
    def key(self):
        return json.dumps([self.project, self.tenant, self.collection], separators=(",", ":"))


@dataclass(frozen=True)
class Principal:
    project: str
    tenant: str
    collections: tuple
    capabilities: tuple
    key_id: str

    def scope(self, collection, capability):
        collection = identifier(collection, "collection")
        if capability not in self.capabilities or collection not in self.collections:
            raise APIError(403, "Access denied")
        return Scope(self.project, self.tenant, collection)
