"""Server-configured model adapters. One stateless JSON decision per request."""
import json
import os
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, quote
from urllib.request import Request, build_opener, HTTPRedirectHandler

from knowledge_core.types import APIError


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def endpoint(url, local=False):
    p = urlsplit(url)
    if not p.hostname or p.username or p.password or p.query or p.fragment:
        raise ValueError("Invalid operator endpoint")
    if p.scheme != "https" and not (local and p.scheme == "http" and p.hostname in {"localhost", "127.0.0.1", "::1"}):
        raise ValueError("Endpoint requires HTTPS, or an explicitly local loopback endpoint")
    return url.rstrip("/")


def secret(name):
    if not isinstance(name, str) or not re.fullmatch(r"OQ_SECRET_[A-Z0-9_]+", name):
        raise APIError(503, "Invalid operator credential reference")
    value = os.environ.get(name, "")
    if not value or "\n" in value or "\r" in value:
        raise APIError(503, "A required server credential is unavailable")
    return value


def request_json(url, body=None, headers=None, method="POST", timeout=20):
    """No redirects, bounded response, sanitised errors. URLs come from operator config."""
    req = Request(url, data=json.dumps(body, allow_nan=False).encode() if body is not None else None,
                  headers={"Content-Type": "application/json", "Accept": "application/json", **(headers or {})}, method=method)
    try:
        with build_opener(NoRedirect()).open(req, timeout=timeout) as response:
            raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ValueError("Response too large")
        value = json.loads(raw)
        if not isinstance(value, (dict, list)):
            raise ValueError("Invalid JSON response")
        return value
    except HTTPError as exc:
        raise APIError(502, f"Upstream request failed (HTTP {exc.code}); check operator configuration") from None
    except (URLError, TimeoutError, ValueError, OSError):
        raise APIError(502, "Upstream service unavailable or returned invalid data") from None


PROVIDERS = {"openai", "azure_openai", "anthropic", "gemini", "bedrock", "ollama"}


class ModelAdapter:
    def __init__(self, config, transport=request_json, bedrock_client=None):
        self.config = config
        self.kind = config["provider"]
        self.model = config["model"]
        self.transport = transport
        self.bedrock_client = bedrock_client

    def decide(self, system, context, max_tokens):
        prompt = json.dumps(context, ensure_ascii=False, allow_nan=False)
        if len(prompt) + len(system) > 64000:
            raise APIError(413, "Agent context is full; start a narrower run")
        kind, c = self.kind, self.config
        headers = {}
        if kind in {"openai", "azure_openai"}:
            url = "https://api.openai.com/v1/responses" if kind == "openai" else endpoint(c["endpoint"])+"/openai/v1/responses"
            headers = {"Authorization": "Bearer "+secret(c["credential_env"])} if kind == "openai" else {"api-key": secret(c["credential_env"])}
            body = {"model": self.model, "instructions": system, "input": prompt, "max_output_tokens": max_tokens,
                    "store": False, "text": {"format": {"type": "json_object"}}}
        elif kind == "anthropic":
            url = "https://api.anthropic.com/v1/messages"
            headers = {"x-api-key": secret(c["credential_env"]), "anthropic-version": "2023-06-01"}
            body = {"model": self.model, "system": system, "messages": [{"role": "user", "content": prompt}], "max_tokens": max_tokens}
        elif kind == "gemini":
            url = "https://generativelanguage.googleapis.com/v1beta/models/"+quote(self.model, safe="")+":generateContent"
            headers = {"x-goog-api-key": secret(c["credential_env"])}
            body = {"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"maxOutputTokens": max_tokens, "responseMimeType": "application/json"}}
        elif kind == "ollama":
            url = endpoint(c["endpoint"], local=True)+"/api/chat"
            headers = {"Authorization": "Bearer "+secret(c["credential_env"])} if c.get("credential_env") else {}
            body = {"model": self.model, "stream": False, "format": "json", "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}], "options": {"num_predict": max_tokens}}
        elif kind == "bedrock":
            try:
                client = self.bedrock_client
                if client is None:
                    import boto3
                    from botocore.config import Config
                    client = boto3.Session(profile_name=c.get("aws_profile") or None, region_name=c["region"]).client("bedrock-runtime", config=Config(connect_timeout=5, read_timeout=20, retries={"total_max_attempts": 1}))
                result = client.converse(modelId=self.model, system=[{"text": system}], messages=[{"role": "user", "content": [{"text": prompt}]}], inferenceConfig={"maxTokens": max_tokens})
            except ImportError:
                raise APIError(503, "Install the optional Bedrock dependencies") from None
            except Exception:
                raise APIError(502, "Bedrock request failed; check operator credentials and model access") from None
            return self.parse(result)
        else:
            raise APIError(503, "Unknown model provider")
        return self.parse(self.transport(url, body, headers))

    def parse(self, result):
        """Never use a truncated, refused or non-JSON model decision."""
        try:
            kind = self.kind
            if kind in {"openai", "azure_openai"}:
                if result["status"] != "completed": raise ValueError()
                blocks = [c for o in result["output"] if o.get("type") == "message" for c in o.get("content", [])]
                if any(c.get("type") == "refusal" for c in blocks): raise ValueError()
                raw = "".join(c["text"] for c in blocks if c.get("type") == "output_text")
                u = result.get("usage", {})
                usage = {"input_tokens": u.get("input_tokens"), "output_tokens": u.get("output_tokens")}
            elif kind == "anthropic":
                if result["stop_reason"] != "end_turn": raise ValueError()
                raw = "".join(b["text"] for b in result["content"] if b.get("type") == "text")
                u = result.get("usage", {})
                usage = {"input_tokens": u.get("input_tokens"), "output_tokens": u.get("output_tokens")}
            elif kind == "gemini":
                candidate = result["candidates"][0]
                if candidate["finishReason"] != "STOP": raise ValueError()
                raw = "".join(p["text"] for p in candidate["content"]["parts"] if "text" in p and not p.get("thought"))
                u = result.get("usageMetadata", {})
                output = u.get("candidatesTokenCount")
                usage = {"input_tokens": u.get("promptTokenCount"), "output_tokens": output + u.get("thoughtsTokenCount", 0) if type(output) is int else None}
            elif kind == "ollama":
                if result.get("done") is not True or result.get("done_reason") == "length": raise ValueError()
                raw = result["message"]["content"]
                usage = {"input_tokens": result.get("prompt_eval_count"), "output_tokens": result.get("eval_count")}
            else:
                if result["stopReason"] != "end_turn": raise ValueError()
                raw = "".join(c["text"] for c in result["output"]["message"]["content"] if "text" in c)
                u = result.get("usage", {})
                usage = {"input_tokens": u.get("inputTokens"), "output_tokens": u.get("outputTokens")}
            if not isinstance(raw, str) or len(raw) > 48000: raise ValueError()
            data = json.loads(raw, parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))
            if not isinstance(data, dict): raise ValueError()
            if any(v is not None and (type(v) is not int or not 0 <= v <= 10000000) for v in usage.values()): raise ValueError()
            return data, usage
        except (KeyError, IndexError, ValueError, TypeError, AttributeError):
            raise APIError(502, "Model returned a refused, incomplete or invalid JSON decision") from None
