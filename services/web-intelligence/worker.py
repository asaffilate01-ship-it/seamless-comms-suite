"""Omniqora's limited Scrapling snapshot worker.

No tenant-provided URL or general-purpose browser automation is accepted.
No Supabase credentials: the worker only calls the private, scoped job API.
Production MUST add outbound egress rules that deny all private/link-local/
metadata ranges to guard against DNS rebinding after validation.
"""
from __future__ import annotations

import hashlib
import ipaddress
import json
import logging
import os
import re
import socket
import time
from html.parser import HTMLParser
from urllib import error, request, robotparser
from urllib.parse import urlsplit

USER_AGENT = "OmniqoraWebIntelligence/0.1 (public research; compliance contact: operator)"
MAX_HTML_BYTES = 2_000_000
MAX_ROBOTS_BYTES = 128_000
LOGGER = logging.getLogger("omniqora.web_intelligence")


def validate_target(url: str, approved_hostname: str) -> None:
    """Refuse non-HTTPS, IP literals, credentials, ports and non-public DNS."""
    parsed = urlsplit(url)
    hostname = (parsed.hostname or "").lower()
    if (parsed.scheme != "https" or parsed.username or parsed.password
        or parsed.port is not None or parsed.fragment
        or hostname != approved_hostname.lower()
        or len(hostname) > 253
        or not re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)+", hostname)
        or hostname.endswith((".local", ".internal", ".localhost"))):
        raise ValueError("Source URL does not match an approved public HTTPS hostname")
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        raise ValueError("Literal IP addresses are not permitted")

    answers = socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
    if not answers:
        raise ValueError("Hostname does not resolve")
    for entry in answers:
        address = ipaddress.ip_address(entry[4][0])
        if not address.is_global:
            raise ValueError("Source resolves to a non-public IP")


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def robots_allowed(url: str, approved_hostname: str) -> bool:
    """Fail closed for unreachable/denied robots.txt; a genuine 404 is allowed."""
    robots_url = f"https://{approved_hostname}/robots.txt"
    opener = request.build_opener(request.ProxyHandler({}), NoRedirect)
    req = request.Request(robots_url, headers={"User-Agent": USER_AGENT})
    try:
        with opener.open(req, timeout=8) as response:
            if response.status != 200:
                return False
            contents = response.read(MAX_ROBOTS_BYTES + 1)
            if len(contents) > MAX_ROBOTS_BYTES:
                return False
    except error.HTTPError as exc:
        if exc.code == 404:
            return True
        return False
    except (OSError, ValueError):
        return False
    rules = robotparser.RobotFileParser()
    rules.parse(contents.decode("utf-8", errors="replace").splitlines())
    return rules.can_fetch(USER_AGENT, url)


class VisibleText(HTMLParser):
    """Produce untrusted plain text; never execute/render HTML from sources."""
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.parts: list[str] = []
        self.skip_tags = {"script", "style", "svg", "noscript", "template"}

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in self.skip_tags:
            self.skip += 1
        if tag in {"p", "div", "article", "section", "h1", "h2", "h3", "li", "tr"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.skip_tags and self.skip:
            self.skip -= 1

    def handle_data(self, data: str) -> None:
        if not self.skip:
            self.parts.append(data)


def extract_plain_text(html: str, max_chars: int) -> str:
    parser = VisibleText()
    parser.feed(html)
    text = "".join(parser.parts)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text).strip()
    return text[:max_chars]


def snapshot(job: dict) -> dict:
    """Fetch one approved page with redirects/JS/stealth/CAPTCHA solving OFF."""
    url = str(job["url"])
    hostname = str(job["hostname"])
    max_chars = min(int(job["maxChars"]), 50_000)
    validate_target(url, hostname)
    if not robots_allowed(url, hostname):
        raise ValueError("robots_disallowed_or_unavailable")
    # A second DNS check narrows rebinding opportunities; outbound network
    # ACLs remain mandatory. No proxies or browser-based fetching is enabled.
    validate_target(url, hostname)
    from scrapling.fetchers import Fetcher  # imported only when a job runs

    page = Fetcher.get(
        url,
        follow_redirects=False,
        stealthy_headers=False,
        timeout=15,
        retries=1,
        headers={"User-Agent": USER_AGENT},
        verify=True,
    )
    status = int(getattr(page, "status", 0))
    if status != 200:
        raise ValueError(f"source_http_{status}")
    headers = getattr(page, "headers", {}) or {}
    media_type = str(headers.get("content-type", headers.get("Content-Type", "text/html"))).lower()
    if not (media_type.startswith("text/html")
            or media_type.startswith("application/xhtml+xml")):
        raise ValueError("unsupported_source_content_type")

    html = page.css("html").get() or ""
    if len(html.encode("utf-8")) > MAX_HTML_BYTES:
        raise ValueError("source_exceeds_html_limit")
    content = extract_plain_text(html, max_chars)
    if not content:
        raise ValueError("source_has_no_visible_text")
    title = str(page.css("title::text").get() or job["sourceName"]).strip()[:200]
    return {
        "operation": "finish",
        "jobId": job["jobId"],
        "leaseToken": job["leaseToken"],
        "success": True,
        "title": title,
        "content": content,
        "contentSha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
        "httpStatus": 200,
        "failure": None,
    }


def api_call(endpoint: str, secret: str, payload: dict) -> dict:
    encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    req = request.Request(
        endpoint,
        data=encoded,
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    # This is a trusted platform endpoint configured by the operator, not a
    # tenant URL. Only the platform returns approved URLs in claimed jobs.
    with request.urlopen(req, timeout=20) as response:
        return json.load(response)


def run_once(endpoint: str, secret: str) -> bool:
    data = api_call(endpoint, secret, {"operation": "claim"})
    job = data.get("job")
    if not job:
        return False
    try:
        report = snapshot(job)
    except Exception as exc:
        # Do not transmit source HTML, URLs, credentials or tracebacks.
        category = type(exc).__name__.lower()
        LOGGER.warning("Snapshot failed (%s) for claimed job", category)
        report = {
            "operation": "finish",
            "jobId": job["jobId"],
            "leaseToken": job["leaseToken"],
            "success": False,
            "title": None,
            "content": None,
            "contentSha256": None,
            "httpStatus": None,
            "failure": f"snapshot_{category}",
        }
    api_call(endpoint, secret, report)
    return True


def main() -> None:
    endpoint = os.environ.get("OMNIQORA_WEB_INTEL_ENDPOINT", "")
    secret = os.environ.get("WEB_INTELLIGENCE_WORKER_SECRET", "")
    parsed = urlsplit(endpoint)
    if (parsed.scheme != "https" or not parsed.hostname
        or not parsed.path.endswith("/api/platform/web-intelligence/worker")
        or parsed.username or parsed.password or parsed.fragment
        or len(secret) < 32):
        raise SystemExit("Worker requires a HTTPS Omniqora endpoint and 32+ character secret")
    logging.basicConfig(level=logging.INFO)
    delay = max(15, min(int(os.environ.get("WEB_INTEL_POLL_SECONDS", "30")), 600))
    while True:
        try:
            run_once(endpoint, secret)
        except Exception:
            LOGGER.warning("Worker API unavailable; retrying without changing job state")
        time.sleep(delay)


if __name__ == "__main__":
    main()
