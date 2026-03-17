#!/bin/bash
# test-parallel.sh — 真多核並行測試
# 策略：快的檔案分組並行 + 慢的（tool-matcher）同時跑

set -e

CORES=$(sysctl -n hw.ncpu)
WORKERS=$((CORES * 3 / 4))
[ $WORKERS -lt 2 ] && WORKERS=2

TEST_DIR="$(cd "$(dirname "$0")/../tests/unit" && pwd)"
SLOW="tool-matcher.test.js"

# 分離快/慢測試
FAST_FILES=()
SLOW_FILES=()
for f in "$TEST_DIR"/*.test.js; do
  name=$(basename "$f")
  if [ "$name" = "$SLOW" ]; then
    SLOW_FILES+=("$f")
  else
    FAST_FILES+=("$f")
  fi
done

FAST_COUNT=${#FAST_FILES[@]}
GROUP_SIZE=$(( (FAST_COUNT + WORKERS - 1) / WORKERS ))

echo "╔══ 真多核並行測試 ══╗"
echo "║ CPU: ${CORES} 核 / Workers: ${WORKERS}"
echo "║ 快速: ${FAST_COUNT} 檔 / 慢速: ${#SLOW_FILES[@]} 檔"
echo "╚═══════════════════╝"

TMPDIR_BASE=$(mktemp -d)
FAIL=0
START=$(python3 -c 'import time; print(int(time.time()*1000))')

# Phase 1: 快速測試分組並行
printf '%s\n' "${FAST_FILES[@]}" | xargs -n"$GROUP_SIZE" -P"$WORKERS" bun test > "$TMPDIR_BASE/fast.log" 2>&1 &
FAST_PID=$!

# Phase 2: 慢速測試同時跑
if [ ${#SLOW_FILES[@]} -gt 0 ]; then
  bun test "${SLOW_FILES[@]}" > "$TMPDIR_BASE/slow.log" 2>&1 &
  SLOW_PID=$!
fi

# 等待
wait $FAST_PID || FAIL=1
[ -n "$SLOW_PID" ] && { wait $SLOW_PID || FAIL=1; }

END=$(python3 -c 'import time; print(int(time.time()*1000))')
ELAPSED=$((END - START))

# 彙總結果
FAST_PASS=$(grep -o '[0-9]* pass' "$TMPDIR_BASE/fast.log" | awk '{s+=$1}END{print s+0}')
FAST_FAIL=$(grep -o '[0-9]* fail' "$TMPDIR_BASE/fast.log" | awk '{s+=$1}END{print s+0}')
SLOW_PASS=0; SLOW_FAIL=0
if [ -f "$TMPDIR_BASE/slow.log" ]; then
  SLOW_PASS=$(grep -o '[0-9]* pass' "$TMPDIR_BASE/slow.log" | awk '{s+=$1}END{print s+0}')
  SLOW_FAIL=$(grep -o '[0-9]* fail' "$TMPDIR_BASE/slow.log" | awk '{s+=$1}END{print s+0}')
fi

TOTAL_PASS=$((FAST_PASS + SLOW_PASS))
TOTAL_FAIL=$((FAST_FAIL + SLOW_FAIL))

echo ""
echo "════════════════════"
echo "  $TOTAL_PASS pass / $TOTAL_FAIL fail"
echo "  耗時: ${ELAPSED}ms"

if [ $TOTAL_FAIL -eq 0 ] && [ $FAIL -eq 0 ]; then
  echo "  ✅ ALL PASS"
else
  echo "  ❌ HAS FAILURES"
  echo ""
  echo "── 失敗詳情 ──"
  grep -E 'fail\)' "$TMPDIR_BASE/fast.log" "$TMPDIR_BASE/slow.log" 2>/dev/null
fi

rm -rf "$TMPDIR_BASE"
exit $TOTAL_FAIL
