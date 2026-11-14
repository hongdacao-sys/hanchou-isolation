#!/usr/bin/env bash
# 翰畴隔震 CHC / CHD / JZ / JTD / JTE / JW 产品页本地预览
# 三维模型需要通过本地服务器打开（浏览器直接双击 index.html 时，Chrome 会拦截 GLB）。
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8765}"
URL="http://127.0.0.1:${PORT}/"
echo "翰畴隔震产品页预览"
echo "请在浏览器打开：${URL}"
echo "CHC：${URL}chc/"
echo "CHD：${URL}chd/"
echo "JZ： ${URL}jz/"
echo "JTD：${URL}jtd/"
echo "JTE：${URL}jte/"
echo "JW： ${URL}jw/"
echo "按 Ctrl+C 结束。"
if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
fi
exec python -m http.server "$PORT" --bind 127.0.0.1
