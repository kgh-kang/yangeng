#!/usr/bin/env bash
# E2E 테스트에 쓰는 외부 파일을 tests/.cache 에 준비한다 (네트워크로 npm 레지스트리 접근 필요).
#  - Anthropic SDK를 브라우저용 ESM 한 파일로 묶은 것 (CDN 대신 테스트에서 주입)
#  - KaTeX
# 사용: bash tests/prepare.sh && SDK_BUNDLE=tests/.cache/sdk.bundle.mjs KATEX_FILE=tests/.cache/katex.min.js node tests/e2e.js
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .cache && cd .cache
SDK_VER=0.131.0   # app/js/api.js 의 SDK_URL 버전과 같아야 함
KATEX_VER=0.16.22 # app/js/app.js 의 KATEX_URL 버전과 같아야 함
[ -d node_modules/esbuild ] || npm i --silent --no-save --prefix . esbuild@0.25 >/dev/null
npm pack --silent "@anthropic-ai/sdk@$SDK_VER" >/dev/null && rm -rf sdk && mkdir sdk && tar xzf anthropic-ai-sdk-$SDK_VER.tgz -C sdk
echo 'export class Webhook { constructor() { throw new Error("not available in browser"); } }' > webhook-stub.mjs
echo 'export { default } from "./sdk/package/index.mjs"; export * from "./sdk/package/index.mjs";' > entry.mjs
node_modules/.bin/esbuild entry.mjs --bundle --format=esm --platform=browser --alias:standardwebhooks=./webhook-stub.mjs --outfile=sdk.bundle.mjs --log-level=warning
npm pack --silent "katex@$KATEX_VER" >/dev/null && rm -rf katex && mkdir katex && tar xzf katex-$KATEX_VER.tgz -C katex && cp katex/package/dist/katex.min.js .
echo "준비 완료: $(pwd)/sdk.bundle.mjs, $(pwd)/katex.min.js"
