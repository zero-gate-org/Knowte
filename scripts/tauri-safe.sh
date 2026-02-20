#!/usr/bin/env bash
set -euo pipefail

# Snap-provided terminals can inject dynamic loader vars that break host-linked binaries.
for key in "${!LD_@}"; do
  unset "$key"
done
for key in "${!SNAP@}"; do
  unset "$key"
done

# whisper-rs-sys can use pre-generated bindings; this avoids requiring clang/libclang.
export WHISPER_DONT_GENERATE_BINDINGS=1

if ! command -v cmake >/dev/null 2>&1; then
  echo "error: cmake is required to build whisper.cpp (via whisper-rs-sys)." >&2
  echo "install with: sudo apt update && sudo apt install -y cmake build-essential pkg-config" >&2
  exit 1
fi

exec tauri "$@"
