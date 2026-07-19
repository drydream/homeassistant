# /// script
# requires-python = ">=3.10"
# dependencies = ["mcp"]
# ///
"""NAS MCP — token-cheap wrapper over SSH to Synology NAS / HA container.

Registered in Claude Code as `nas-mcp` (stdio). Auth: existing SSH key, no new secrets.
"""
import shlex
import subprocess

from mcp.server.fastmcp import FastMCP

SSH = [
    r"C:\Windows\System32\OpenSSH\ssh.exe",
    "-i", r"C:\Users\DryDrEaM_Champ\.ssh\id_ed25519",
    "-o", "StrictHostKeyChecking=no",
    "drydream@192.168.1.170",
]
DOCKER = "sudo /usr/local/bin/docker"
COMPOSE_YML = "/volume1/docker/homeassistant/docker-compose.yml"

mcp = FastMCP("nas-mcp")


def _ssh(remote_cmd: str, timeout: int = 120) -> str:
    r = subprocess.run(SSH + [remote_cmd], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=timeout)
    out = (r.stdout + r.stderr).strip()
    return out if r.returncode == 0 else f"[exit {r.returncode}]\n{out}"


@mcp.tool()
def ha_exec(command: str, timeout: int = 120) -> str:
    """Run a shell command inside the homeassistant container (as root)."""
    return _ssh(f"{DOCKER} exec homeassistant sh -c {shlex.quote(command)}", timeout)


@mcp.tool()
def ha_logs(since: str = "5m", grep: str = "") -> str:
    """Tail homeassistant container logs. since: e.g. 5m, 1h. grep: optional filter."""
    cmd = f"{DOCKER} logs homeassistant --since {shlex.quote(since)} 2>&1"
    if grep:
        cmd += f" | grep -i {shlex.quote(grep)}"
    cmd += " | tail -n 100"
    return _ssh(cmd) or "(no matching log lines)"


@mcp.tool()
def ha_validate_config() -> str:
    """Validate HA YAML config (check_config). Takes ~1 min."""
    return _ssh(f"{DOCKER} exec homeassistant python -m homeassistant "
                "--script check_config -c /config", timeout=300)


@mcp.tool()
def container_action(name: str, action: str) -> str:
    """start/stop/restart a docker container on the NAS, or `ps` (name ignored) to list all."""
    if action == "ps":
        return _ssh(f"{DOCKER} ps -a --format 'table {{{{.Names}}}}\t{{{{.Status}}}}'")
    if action not in ("start", "stop", "restart"):
        return "action must be start|stop|restart|ps"
    return _ssh(f"{DOCKER} {action} {shlex.quote(name)}", timeout=180)


@mcp.tool()
def nas_exec(command: str, timeout: int = 120) -> str:
    """Run a shell command on the NAS itself (user drydream, passwordless sudo available)."""
    return _ssh(command, timeout)


if __name__ == "__main__":
    mcp.run()
