#!/bin/zsh
set -e
cd -- "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  print '请先安装 Node.js 22.12 或更新版本，再运行本工具。'
  read -r '?按回车关闭。'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci
fi
npm run desktop
