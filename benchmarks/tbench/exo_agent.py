"""Harbor agent that runs Claude Code with one plugin dir loaded.

  PYTHONPATH=benchmarks/tbench harbor run -d terminal-bench/terminal-bench-2-1 \
    -a exo_agent:ExoClaudeCode --ak plugin_dir=/abs/path/to/plugin ...

An arm with no plugin_dir runs stock Claude Code. The OAuth token is read from
~/.config/exo/tbench.env when a trial starts and reaches the trial only through
the exec environment; it is not written to the job config or a log.
"""

import hashlib
import shlex
import shutil
import tempfile
import urllib.request
from pathlib import Path

from pydantic import Field

from harbor.agents.installed.claude_code import ClaudeCode, ClaudeCodeOptions

PINNED_CLAUDE_CODE = "2.1.302"
MAX_TURNS = 60
TOKEN_FILE = Path.home() / ".config" / "exo" / "tbench.env"
TOKEN_KEY = "CLAUDE_CODE_OAUTH_TOKEN"
NODE_VERSION = "v22.23.3"
NODE_DIST = f"https://nodejs.org/dist/{NODE_VERSION}"
NODE_CACHE = Path.home() / ".cache" / "exo" / "tbench"
NODE_ARCH = {"x86_64": "x64", "aarch64": "arm64", "arm64": "arm64"}
PLUGIN_TARGET = "/opt/exo-plugin"
SKIP = shutil.ignore_patterns(".git", "benchmarks", "node_modules", ".exo", ".worktrees", ".claude", "docs")


def read_token(path=TOKEN_FILE):
    """The token in an env file of KEY=value lines; None when absent."""
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError:
        return None
    for line in text.splitlines():
        key, separator, value = line.strip().removeprefix("export ").partition("=")
        if separator and key.strip() == TOKEN_KEY:
            return value.strip().strip("'\"") or None
    return None


def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def node_tarball(machine, cache=NODE_CACHE, get=fetch):
    """Path of the cached Node tarball for `uname -m` output, SHA256-checked against nodejs.org."""
    arch = NODE_ARCH.get(machine)
    if arch is None:
        raise RuntimeError(f"no Node 22 tarball for container arch {machine!r}")
    name = f"node-{NODE_VERSION}-linux-{arch}.tar.gz"
    target = Path(cache) / name
    sums = get(f"{NODE_DIST}/SHASUMS256.txt").decode()
    expected = next((line.split()[0] for line in sums.splitlines() if line.endswith(f" {name}")), None)
    if expected is None:
        raise RuntimeError(f"{name} not listed in {NODE_DIST}/SHASUMS256.txt")
    if not target.is_file():
        target.parent.mkdir(parents=True, exist_ok=True)
        part = target.with_suffix(".part")
        part.write_bytes(get(f"{NODE_DIST}/{name}"))
        part.replace(target)
    actual = hashlib.sha256(target.read_bytes()).hexdigest()
    if actual != expected:
        raise RuntimeError(f"SHA256 mismatch for {target}: expected {expected}, got {actual}; delete it to refetch")
    return target


class ExoClaudeCodeOptions(ClaudeCodeOptions):
    plugin_dir: str | None = Field(default=None, description="Host plugin directory uploaded and loaded with --plugin-dir.")


class ExoClaudeCode(ClaudeCode):
    options_model = ExoClaudeCodeOptions

    def __init__(self, *args, plugin_dir=None, **kwargs):
        kwargs.setdefault("version", PINNED_CLAUDE_CODE)
        kwargs.setdefault("max_turns", MAX_TURNS)
        super().__init__(*args, **kwargs)
        self._plugin_dir = Path(plugin_dir).resolve() if plugin_dir else None
        if self._plugin_dir is not None and not self._plugin_dir.is_dir():
            raise FileNotFoundError(f"plugin_dir is not a directory: {self._plugin_dir}")

    @staticmethod
    def name() -> str:
        return "exo-claude-code"

    def _env_sources(self):
        token = read_token()
        if token is None:
            raise RuntimeError(f"{TOKEN_KEY} not found in {TOKEN_FILE}; run `claude setup-token` and save it there")
        # why: last, so the host's own ANTHROPIC_API_KEY or token never decides the arm's auth.
        return (*super()._env_sources(), {TOKEN_KEY: token, "CLAUDE_FORCE_OAUTH": "1"})

    async def _install_node(self, environment):
        """Node from the host cache, so Harbor's install finds node and npm and skips apt."""
        machine = (await environment.exec(command="uname -m")).stdout.strip()
        tarball = node_tarball(machine)
        await environment.exec(command="mkdir -p /opt/node", user="root")
        await environment.upload_file(tarball, "/opt/node.tar.gz")
        await environment.exec(
            command=(
                "tar -xzf /opt/node.tar.gz -C /opt/node --strip-components=1 && rm /opt/node.tar.gz && "
                "for bin in node npm npx; do ln -sf /opt/node/bin/$bin /usr/local/bin/$bin; done"
            ),
            user="root",
        )

    async def install(self, environment):
        await self._install_node(environment)
        await super().install(environment)
        if self._plugin_dir is not None:
            with tempfile.TemporaryDirectory() as staging:
                copy = Path(staging) / "plugin"
                shutil.copytree(self._plugin_dir, copy, ignore=SKIP, symlinks=True)
                await environment.exec(command=f"rm -rf {PLUGIN_TARGET} && mkdir -p {PLUGIN_TARGET}", user="root")
                await environment.upload_dir(copy, PLUGIN_TARGET)
        # why: $HOME/.local/bin/claude is a symlink to the binary, so it is replaced, never written through.
        flag = f" --plugin-dir {PLUGIN_TARGET}" if self._plugin_dir is not None else ""
        await self.exec_as_agent(
            environment,
            command=(
                'export PATH="$HOME/.local/bin:$PATH"; '
                'REAL=$(readlink -f "$(command -v claude)"); '
                'mkdir -p "$HOME/.local/bin"; rm -f "$HOME/.local/bin/claude"; '
                f"printf '#!/bin/sh\\nexec %s%s \"$@\"\\n' \"$REAL\" {shlex.quote(flag)} > \"$HOME/.local/bin/claude\"; "
                'chmod +x "$HOME/.local/bin/claude"; cat "$HOME/.local/bin/claude"; claude --version'
            ),
        )
