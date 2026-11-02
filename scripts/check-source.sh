#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
node --check "$ROOT/chrome-extension/content.js"
node --check "$ROOT/chrome-extension/popup.js"
node --check "$ROOT/android/RepostCleaner/app/src/main/assets/cleaner.js"
python3 - "$ROOT/chrome-extension/manifest.json" "$ROOT/chrome-extension/content.js" <<'PY'
import json, sys
manifest_path, source_path = sys.argv[1:]
with open(manifest_path, encoding='utf-8') as f:
    manifest = json.load(f)
assert manifest['manifest_version'] == 3
assert manifest['version'] == '1.0.0'
assert manifest['permissions'] == ['activeTab']
assert manifest['content_scripts'][0]['matches'] == ['https://www.instagram.com/*']
with open(source_path, encoding='utf-8') as f:
    source = f.read()
assert 'const MAX_SCAN = 200' in source
assert 'Math.random' not in source
assert 'humanDelay' not in source
assert 'deleteAll' not in source
assert 'autoResume' not in source
assert 'document.cookie' not in source
assert 'sessionStorage' not in source
assert 'localStorage' not in source
print('Manifest and safety invariants passed')
PY
if grep -RniE 'fetch\(|XMLHttpRequest|sendBeacon|document\.cookie|chrome\.cookies|localStorage\.setItem|sessionStorage\.setItem|Math\.random|humanDelay|autoResume|deleteAllOneClick' \
  "$ROOT/chrome-extension" "$ROOT/android/RepostCleaner/app/src/main/assets"; then
  echo "Review: unexpected network, credential, random-delay, or auto-resume API found." >&2
  exit 1
fi
if grep -nE 'SslErrorHandler|SslError\)|onReceivedSslError' "$ROOT/android/RepostCleaner/app/src/main/java/com/repostcleaner/app/MainActivity.kt"; then
  echo "Review: custom SSL callback should not be present; Android WebView default rejects SSL errors." >&2
  exit 1
fi
echo "JavaScript syntax, manifest, safety invariants, and SSL callback checks passed."
