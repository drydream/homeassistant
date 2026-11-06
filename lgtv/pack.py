"""Build a webOS ipk from an app dir (layout as ares-package makes it, without JS minify)."""
import io
import json
import os
import sys
import tarfile
import time

# TV rejects ipks (-5 "ipk verified failed") whose timestamps are ahead of its own clock.
# A PC clock running fast (notebook was +78 s, never NTP-synced) triggers it. Stamp a day back.
STAMP = int(time.time()) - 86400


def tgz(entries):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz", format=tarfile.USTAR_FORMAT) as t:
        for name, data in entries:
            info = tarfile.TarInfo(name)
            info.mtime = STAMP
            if data is None:
                info.type, info.mode = tarfile.DIRTYPE, 0o777
                t.addfile(info)
            else:
                info.size, info.mode = len(data), 0o666
                t.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def pack(app_dir, out_dir):
    info = json.load(open(os.path.join(app_dir, "appinfo.json"), encoding="utf-8"))
    app_id, ver = info["id"], info["version"]
    base = f"usr/palm/applications/{app_id}"
    pkg = f"usr/palm/packages/{app_id}"
    data = [(d, None) for d in ("usr", "usr/palm", "usr/palm/applications", "usr/palm/packages", base, pkg)]
    size = 0
    for root, dirs, files in os.walk(app_dir):
        dirs.sort()
        rel = os.path.relpath(root, app_dir).replace("\\", "/")
        if rel != ".":
            data.append((f"{base}/{rel}", None))
        for f in sorted(files):
            body = open(os.path.join(root, f), "rb").read()
            size += len(body)
            data.append((f"{base}/{f}" if rel == "." else f"{base}/{rel}/{f}", body))
    pinfo = json.dumps({"id": app_id, "version": ver, "app": app_id}, indent=2).encode() + b"\n"
    data.append((f"{pkg}/packageinfo.json", pinfo))
    control = (f"Package: {app_id}\nVersion: {ver}\nSection: misc\nPriority: optional\nArchitecture: all\n"
               f"Installed-Size: {size}\nMaintainer: N/A <nobody@example.com>\n"
               "Description: This is a webOS application.\nwebOS-Package-Format-Version: 2\n"
               "webOS-Packager-Version: x.y.x\n").encode()
    members = [("debian-binary", b"2.0\n"), ("control.tar.gz", tgz([("control", control)])), ("data.tar.gz", tgz(data))]
    out = bytearray(b"!<arch>\n")
    for name, body in members:
        out += f"{name:<16}{STAMP:<12}{0:<6}{0:<6}{'100644':<8}{len(body):<10}`\n".encode()
        out += body + (b"\n" if len(body) & 1 else b"")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{app_id}_{ver}_all.ipk")
    open(path, "wb").write(out)
    print(path)


if __name__ == "__main__":
    pack(sys.argv[1], sys.argv[2])
