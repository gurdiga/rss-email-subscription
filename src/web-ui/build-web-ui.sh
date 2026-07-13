#!/bin/sh
set -eu

# Bundle web-ui page entries as native browser ES modules.
# Usage: build-web-ui.sh <outdir> [--watch]

outdir=$1
watch_flag=${2:-}

set --
for entry in src/web-ui/*.ts; do
  case "$entry" in
    *.spec.ts) continue ;;
  esac
  set -- "$@" "$entry"
done

exec ./node_modules/.bin/esbuild \
  --bundle \
  --format=esm \
  --target=es2018 \
  --sourcemap \
  --outdir="$outdir/web-ui" \
  ${watch_flag:+"$watch_flag"} \
  "$@"
