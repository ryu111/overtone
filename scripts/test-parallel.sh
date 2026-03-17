#!/bin/bash
# test-parallel.sh — 真多核並行測試
# 每組獨立 bun 進程 + 獨立 log，避免 xargs stdout 丟失

TEST_DIR="$(cd "$(dirname "$0")/../tests/unit" && pwd)"
CORES=$(sysctl -n hw.ncpu)
WORKERS=$((CORES * 3 / 4))
[ $WORKERS -lt 2 ] && WORKERS=2

# 收集所有測試檔案，按大小排序（大檔優先，避免尾端等待）
ALL_FILES=($(ls -S "$TEST_DIR"/*.test.js))
TOTAL_FILES=${#ALL_FILES[@]}

echo "╔══ 真多核並行測試 ══╗"
echo "║ CPU: ${CORES} 核 / Workers: ${WORKERS}"
echo "║ 檔案: ${TOTAL_FILES}"
echo "╚═══════════════════╝"

LOGDIR=$(mktemp -d)
START=$(python3 -c 'import time; print(int(time.time()*1000))')

# 分成 WORKERS 組（round-robin 分配，平衡負載）
for ((i=0; i<WORKERS; i++)); do
  GROUP_FILES=()
  for ((j=i; j<TOTAL_FILES; j+=WORKERS)); do
    GROUP_FILES+=("${ALL_FILES[$j]}")
  done
  if [ ${#GROUP_FILES[@]} -gt 0 ]; then
    bun test "${GROUP_FILES[@]}" > "$LOGDIR/w${i}.log" 2>&1 &
  fi
done

# 等待所有 worker
wait

END=$(python3 -c 'import time; print(int(time.time()*1000))')
ELAPSED=$((END - START))

# 彙總
TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_TESTS=0

for logfile in "$LOGDIR"/w*.log; do
  [ -f "$logfile" ] || continue
  P=$(grep -o '[0-9]* pass' "$logfile" | awk '{s+=$1}END{print s+0}')
  F=$(grep -o '[0-9]* fail' "$logfile" | tail -1 | awk '{print $1+0}')
  T=$(grep -o 'Ran [0-9]* tests' "$logfile" | awk '{s+=$2}END{print s+0}')
  TOTAL_PASS=$((TOTAL_PASS + P))
  TOTAL_FAIL=$((TOTAL_FAIL + F))
  TOTAL_TESTS=$((TOTAL_TESTS + T))
done

echo ""
echo "════════════════════"
echo "  ${TOTAL_TESTS} tests / ${TOTAL_PASS} pass / ${TOTAL_FAIL} fail"
echo "  耗時: ${ELAPSED}ms (${WORKERS} workers)"

if [ $TOTAL_FAIL -eq 0 ]; then
  echo "  ✅ ALL PASS"
else
  echo "  ❌ HAS FAILURES"
  echo ""
  echo "── 失敗詳情 ──"
  for logfile in "$LOGDIR"/w*.log; do
    grep -E '\(fail\)' "$logfile" 2>/dev/null
  done
fi

# 清理
find "$LOGDIR" -name 'w*.log' -delete 2>/dev/null
rmdir "$LOGDIR" 2>/dev/null

exit $TOTAL_FAIL
