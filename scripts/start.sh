#!/usr/bin/env sh
set -e
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo '请先安装 Node.js 22.12 或更新版本。'
  exit 1
fi
if [ ! -d node_modules ]; then npm ci; fi
npm run build
CG_OPEN_BROWSER=1 npm start
