#!/usr/bin/env bash
set -euo pipefail

exo_root="$(cd "$(dirname "$0")/.." && pwd)"
commit=720b6cb3e
kind="${1:?kind seed or pressure}"
workdir="$PWD"
source_dir="$(mktemp -d)"

extract() {
  git -C "$exo_root" archive "$commit" "$1" | tar -x -C "$source_dir"
}

seed_case() {
  local task="$1"
  extract "benchmarks/value/$task"
  cp -R "$source_dir/benchmarks/value/$task/seed/." "$workdir"
  git init -q "$workdir"
  git -C "$workdir" add -A
  git -C "$workdir" -c user.name=eval -c user.email=eval@example.com commit -q -m "feat(fixture): add the fixture"
  if [ -f "$source_dir/benchmarks/value/$task/setup.mjs" ]; then
    node "$source_dir/benchmarks/value/$task/setup.mjs" "$workdir"
  fi
}

pressure_case() {
  local skill="$1" setup="$2" script="${3:-}"
  shift 3 || true
  extract "benchmarks/pressure/$skill"
  bash "$source_dir/benchmarks/pressure/$skill/$setup" > /dev/null || true
  [ -z "$script" ] && return 0
  if [ "$skill" = spec ]; then
    cp -R "/tmp/exo-pressure/spec/$script/." "$workdir"
    return 0
  fi
  [ -d "/tmp/exo-pressure/$skill/bin" ] && cp -R "/tmp/exo-pressure/$skill/bin" "$workdir/bin"
  sed 's/`npm test` passes\./`node --test` passes./' "/tmp/exo-pressure/$skill/$script" > "$source_dir/$script"
  bash "$source_dir/$script" "$@"
}

case "$kind" in
  seed) seed_case "${2:?task}" ;;
  pressure) shift; pressure_case "$@" ;;
  *) echo "unknown kind $kind" >&2; exit 2 ;;
esac
