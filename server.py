"""Local web console for AWS Emulator.

A small HTTP server that serves the UI and forwards API calls to the
emulator with boto3. It only ever talks to the local emulator endpoint,
using the throwaway keys the emulator writes on each start, so it can't
touch a real AWS account.
"""

import base64
import configparser
import datetime
import decimal
import io
import json
import mimetypes
import os
import sys
import threading
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import boto3
import botocore.exceptions
from botocore.config import Config
from botocore import xform_name

EMU_PORT = int(os.environ.get("EMULATOR_PORT", "9297"))
EMU_HOST = os.environ.get("EMULATOR_HOST", "127.0.0.1")
EMU_ENDPOINT = f"https://{EMU_HOST}:{EMU_PORT}"
EMU_DIR = Path.home() / ".aws" / "emulator" / str(EMU_PORT)
REGION = os.environ.get("EMULATOR_REGION", "us-east-1")
UI_PORT = int(os.environ.get("UI_PORT") or os.environ.get("PORT") or "8297")
STATIC = Path(__file__).parent / "static"
WEB_DIST = Path(__file__).parent / "web" / "dist"

CLIENT_CONFIG = Config(
    inject_host_prefix=False,
    retries={"max_attempts": 1, "mode": "standard"},
    connect_timeout=3,
    read_timeout=60,
    s3={"addressing_style": "path"},
    signature_version="s3v4",  # presigned URLs must be SigV4 for the emulator
)


class EmulatorNotRunning(Exception):
    pass


class Clients:
    """boto3 clients keyed by service; rebuilt when the emulator restarts
    (new keys are written to emulator_credentials on every start)."""

    def __init__(self):
        self._lock = threading.Lock()
        self._stamp = None
        self._session = None
        self._clients = {}
        self._meta_session = boto3.session.Session(region_name=REGION)

    def _load(self):
        creds_file = EMU_DIR / "emulator_credentials"
        ca_file = EMU_DIR / "ca.pem"
        if not creds_file.exists() or not ca_file.exists():
            raise EmulatorNotRunning(
                f"No emulator files in {EMU_DIR}. Start it with: aws-emulator"
            )
        stamp = (creds_file.stat().st_mtime_ns, ca_file.stat().st_mtime_ns)
        if stamp != self._stamp:
            cp = configparser.ConfigParser()
            cp.read(creds_file)
            sec = cp["default"]
            self._session = boto3.session.Session(
                aws_access_key_id=sec["aws_access_key_id"],
                aws_secret_access_key=sec["aws_secret_access_key"],
                region_name=REGION,
            )
            self._clients = {}
            self._stamp = stamp
        return str(ca_file)

    def get(self, service):
        with self._lock:
            ca = self._load()
            c = self._clients.get(service)
            if c is None:
                c = self._session.client(
                    service, endpoint_url=EMU_ENDPOINT, verify=ca, config=CLIENT_CONFIG
                )
                self._clients[service] = c
            return c

    def ca(self):
        with self._lock:
            return self._load()

    # --- metadata from the local SDK models (no network) ---
    def services(self):
        return self._meta_session.get_available_services()

    def model(self, service):
        loader = self._meta_session._session.get_component("data_loader")
        from botocore.model import ServiceModel

        return ServiceModel(loader.load_service_model(service, "service-2"), service)


CLIENTS = Clients()


def to_jsonable(o):
    if isinstance(o, (datetime.datetime, datetime.date)):
        return o.isoformat()
    if isinstance(o, decimal.Decimal):
        return float(o) if o % 1 else int(o)
    if isinstance(o, (bytes, bytearray)):
        try:
            return o.decode("utf-8")
        except UnicodeDecodeError:
            return {"__base64__": base64.b64encode(o).decode()}
    if hasattr(o, "read"):  # StreamingBody
        return to_jsonable(o.read())
    if isinstance(o, set):
        return sorted(o)
    return str(o)


def skeleton(shape, depth=0, seen=()):
    """Example input built from a botocore shape, for the API explorer."""
    if shape is None:
        return {}
    t = shape.type_name
    if shape.name in seen or depth > 6:
        return None
    seen = seen + (shape.name,)
    if t == "structure":
        out = {}
        req = set(shape.required_members)
        for name, m in shape.members.items():
            if name in req:
                out[name] = skeleton(m, depth + 1, seen)
        return out
    if t == "list":
        v = skeleton(shape.member, depth + 1, seen)
        return [v] if v is not None else []
    if t == "map":
        return {"KEY": skeleton(shape.value, depth + 1, seen)}
    if t == "string":
        enum = getattr(shape, "enum", None)
        return enum[0] if enum else ""
    if t in ("integer", "long"):
        return 0
    if t in ("float", "double"):
        return 0.0
    if t == "boolean":
        return False
    if t == "timestamp":
        return "2026-01-01T00:00:00Z"
    if t == "blob":
        return ""
    return None


def required_tree(shape, depth=0, seen=()):
    if shape is None or shape.type_name != "structure" or depth > 1:
        return []
    return list(shape.required_members)


def make_zip(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, content in files.items():
            info = zipfile.ZipInfo(name)
            info.external_attr = 0o644 << 16
            z.writestr(info, content)
    return buf.getvalue()


def call(service, operation, params):
    client = CLIENTS.get(service)
    method = operation if "_" in operation or operation.islower() else xform_name(operation)
    fn = getattr(client, method, None)
    if fn is None:
        raise ValueError(f"{service} has no operation {operation}")
    params = dict(params or {})
    # Special-case: blobs the UI sends as plain text
    if service == "lambda" and method == "invoke" and isinstance(params.get("Payload"), str):
        params["Payload"] = params["Payload"].encode()
    resp = fn(**params)
    resp.pop("ResponseMetadata", None)
    return resp


class Handler(BaseHTTPRequestHandler):
    server_version = "EmuConsole/1.0"

    def log_message(self, fmt, *args):
        if os.environ.get("UI_DEBUG"):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ---------- helpers ----------
    def _send(self, status, body, ctype="application/json", extra=None):
        if not isinstance(body, (bytes, bytearray)):
            body = json.dumps(body, default=to_jsonable).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _err(self, status, code, message):
        self._send(status, {"error": {"code": code, "message": message}})

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def _json(self):
        raw = self._body()
        return json.loads(raw) if raw else {}

    def _trusted(self):
        """Block other websites from driving this API through your browser."""
        host = (self.headers.get("Host") or "").split(":")[0]
        if host not in ("127.0.0.1", "localhost"):
            return False
        origin = self.headers.get("Origin")
        if origin and urlparse(origin).hostname not in ("127.0.0.1", "localhost"):
            return False
        return self.headers.get("X-Emu-Console") == "1"

    def _api(self, fn):
        if not self._trusted():
            return self._err(403, "Forbidden", "Request not allowed")
        try:
            result = fn()
            if result is not None:
                self._send(200, result)
        except EmulatorNotRunning as e:
            self._err(503, "EmulatorNotRunning", str(e))
        except botocore.exceptions.EndpointConnectionError:
            self._err(503, "EmulatorNotRunning", f"Can't reach the emulator at {EMU_ENDPOINT}. Is it running?")
        except botocore.exceptions.ClientError as e:
            err = e.response.get("Error", {})
            status = e.response.get("ResponseMetadata", {}).get("HTTPStatusCode", 400)
            self._send(
                status if 400 <= status < 600 else 400,
                {"error": {"code": err.get("Code", "ClientError"), "message": err.get("Message", str(e)), "status": status}},
            )
        except botocore.exceptions.ParamValidationError as e:
            self._err(400, "ParamValidationError", str(e).replace("Parameter validation failed:\n", ""))
        except botocore.exceptions.BotoCoreError as e:
            self._err(502, type(e).__name__, str(e))
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as e:
            self._err(400, type(e).__name__, str(e))
        except Exception as e:  # noqa: BLE001
            self._err(500, type(e).__name__, str(e))

    # ---------- routes ----------
    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        p = u.path
        if p == "/api/health":
            return self._api(self.health)
        if p == "/api/meta/services":
            return self._api(lambda: {"services": CLIENTS.services()})
        if p == "/api/meta/operations":
            return self._api(lambda: self.operations(q["service"]))
        if p == "/api/meta/operation":
            return self._api(lambda: self.operation(q["service"], q["operation"]))
        if p == "/api/s3/download":
            return self._download(q)
        return self._static(p)

    def do_POST(self):
        p = urlparse(self.path).path
        if p == "/api/call":
            def run():
                b = self._json()
                return {"result": call(b["service"], b["operation"], b.get("params"))}
            return self._api(run)
        if p == "/api/s3/upload":
            return self._api(self.upload)
        if p == "/api/lambda/code":
            return self._api(self.lambda_code)
        if p == "/api/s3/presign":
            def presign():
                b = self._json()
                op = b.get("method", "get_object")
                if op not in ("get_object", "put_object"):
                    raise ValueError("method must be get_object or put_object")
                params = {"Bucket": b["bucket"], "Key": b["key"]}
                if b.get("versionId"):
                    params["VersionId"] = b["versionId"]
                url = CLIENTS.get("s3").generate_presigned_url(op, Params=params, ExpiresIn=int(b.get("expires", 3600)))
                return {"url": url}
            return self._api(presign)
        return self._err(404, "NotFound", p)

    def health(self):
        import urllib.request, ssl

        try:
            ca = CLIENTS.ca()
        except EmulatorNotRunning as e:
            return {"up": False, "endpoint": EMU_ENDPOINT, "message": str(e)}
        ctx = ssl.create_default_context(cafile=ca)
        try:
            with urllib.request.urlopen(f"{EMU_ENDPOINT}/__admin/health", context=ctx, timeout=2) as r:
                ok = r.status == 200
        except Exception as e:  # noqa: BLE001
            return {"up": False, "endpoint": EMU_ENDPOINT, "message": str(e)}
        return {"up": ok, "endpoint": EMU_ENDPOINT, "region": REGION, "account": "000000000000"}

    def operations(self, service):
        m = CLIENTS.model(service)
        return {"service": service, "title": m.metadata.get("serviceFullName", service), "operations": sorted(m.operation_names)}

    def operation(self, service, operation):
        m = CLIENTS.model(service)
        op = m.operation_model(operation)
        doc = op.documentation or ""
        return {
            "service": service,
            "operation": operation,
            "required": required_tree(op.input_shape),
            "optional": [
                f"{n} ({m.type_name})"
                for n, m in (op.input_shape.members.items() if op.input_shape else [])
                if n not in required_tree(op.input_shape)
            ],
            "skeleton": skeleton(op.input_shape),
            "documentation": doc,
        }

    def upload(self):
        q = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
        data = self._body()
        ctype = self.headers.get("X-File-Type") or mimetypes.guess_type(q["key"])[0] or "application/octet-stream"
        extra = {}
        raw = self.headers.get("X-Upload-Options")
        if raw:
            allowed = {"StorageClass", "Metadata", "Tagging", "ServerSideEncryption", "SSEKMSKeyId", "BucketKeyEnabled",
                       "ACL", "CacheControl", "ContentDisposition", "ContentEncoding", "ContentLanguage", "Expires",
                       "WebsiteRedirectLocation", "ChecksumAlgorithm", "ObjectLockMode", "ObjectLockRetainUntilDate",
                       "ObjectLockLegalHoldStatus", "ContentType"}
            opts = json.loads(base64.b64decode(raw).decode())
            extra = {k: v for k, v in opts.items() if k in allowed and v not in (None, "", {})}
        extra.setdefault("ContentType", ctype)
        r = CLIENTS.get("s3").put_object(Bucket=q["bucket"], Key=q["key"], Body=data, **extra)
        return {"ok": True, "key": q["key"], "size": len(data), "versionId": r.get("VersionId"), "etag": r.get("ETag")}

    def lambda_code(self):
        b = self._json()
        filename = b.get("filename") or "index.py"
        z = make_zip({filename: b["code"]})
        lam = CLIENTS.get("lambda")
        if b.get("update"):
            r = lam.update_function_code(FunctionName=b["name"], ZipFile=z)
        else:
            params = {
                "FunctionName": b["name"],
                "Runtime": b["runtime"],
                "Handler": b["handler"],
                "Role": b.get("role") or "arn:aws:iam::000000000000:role/lambda-role",
                "Code": {"ZipFile": z},
                "Timeout": int(b.get("timeout") or 30),
                "MemorySize": int(b.get("memory") or 128),
            }
            if b.get("env"):
                params["Environment"] = {"Variables": b["env"]}
            r = lam.create_function(**params)
        r.pop("ResponseMetadata", None)
        return {"result": r}

    def _download(self, q):
        # Plain link navigation can't add headers, so check host/referer instead.
        host = (self.headers.get("Host") or "").split(":")[0]
        ref = self.headers.get("Referer")
        if host not in ("127.0.0.1", "localhost") or (ref and urlparse(ref).hostname not in ("127.0.0.1", "localhost")):
            return self._err(403, "Forbidden", "Request not allowed")
        try:
            extra_args = {"VersionId": q["versionId"]} if q.get("versionId") else {}
            obj = CLIENTS.get("s3").get_object(Bucket=q["bucket"], Key=q["key"], **extra_args)
            data = obj["Body"].read()
        except botocore.exceptions.ClientError as e:
            return self._err(404, e.response["Error"].get("Code", "Error"), e.response["Error"].get("Message", ""))
        except (EmulatorNotRunning, botocore.exceptions.EndpointConnectionError) as e:
            return self._err(503, "EmulatorNotRunning", str(e))
        name = q["key"].rsplit("/", 1)[-1] or "download"
        disp = "inline" if q.get("inline") else "attachment"
        ctype = obj.get("ContentType") or "application/octet-stream"
        if disp == "inline" and not ctype.startswith(("text/", "image/", "application/json")):
            ctype = "text/plain; charset=utf-8"
        extra = {"Content-Disposition": f'{disp}; filename="{name}"'}
        if disp == "inline":
            extra["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
        self._send(200, data, ctype, extra)

    def _static(self, p):
        # /legacy/* -> first-version pages; everything else -> React app (web/dist)
        if p == "/legacy":
            self.send_response(301); self.send_header("Location", "/legacy/"); self.end_headers(); return
        if p.startswith("/legacy/"):
            root, rel = STATIC, p[len("/legacy/"):] or "index.html"
        else:
            root, rel = WEB_DIST, p.lstrip("/") or "index.html"
            if not (root / rel).is_file() and "." not in rel.rsplit("/", 1)[-1]:
                rel = "index.html"  # SPA fallback
        f = (root / rel).resolve()
        if not str(f).startswith(str(root.resolve())) or not f.is_file():
            if root is WEB_DIST and not WEB_DIST.exists():
                return self._err(404, "NotBuilt", "Run: cd web && npm install && npm run build")
            return self._err(404, "NotFound", p)
        ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        self._send(200, f.read_bytes(), ctype)


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", UI_PORT), Handler)
    print(f"Emulator console: http://127.0.0.1:{UI_PORT}  (emulator: {EMU_ENDPOINT})", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
