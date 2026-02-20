#!/usr/bin/env bash
set -euo pipefail

# Snap-provided terminals can inject dynamic loader vars that break host-linked binaries.
for key in "${!LD_@}"; do
  unset "$key"
done
for key in "${!SNAP@}"; do
  unset "$key"
done

exec tauri "$@"
