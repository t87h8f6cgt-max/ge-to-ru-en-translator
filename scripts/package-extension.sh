#!/usr/bin/env bash
# Build a clean Chrome Web Store ZIP (excludes dev / harvest / agent files).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")"
OUT="dist/GE-to-RU-EN-translator-${VERSION}.zip"
mkdir -p dist
rm -f "$OUT"
zip -r "$OUT" . \
  -x "*.git*" \
  -x "*node_modules*" \
  -x "*glossary-data*" \
  -x "*dist*" \
  -x "*store-assets*" \
  -x "*.DS_Store" \
  -x "*CHROMEWEBSTORE.md" \
  -x "*README.md" \
  -x "*DEV.md" \
  -x "*index.html" \
  -x "*.cursor/*" \
  -x "*.agents/*" \
  -x "*scripts/*" \
  -x "*.zip" \
  -x "*.map" \
  -x "*.pem" \
  >/dev/null
echo "Created $OUT"
unzip -l "$OUT" | head -60
echo "..."
unzip -l "$OUT" | tail -5
