#!/bin/bash
# test-parallel.sh — 真多核並行測試
# Phase 1: unit 測試多核並行（快）
# Phase 2: integration 測試獨立跑（慢，含 execSync）

SCRIPT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR="$SCRIPT_ROOT/tests/unit"
INTEG_DIR="$SCRIPT_ROOT/tests/integration"
CORES=$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)
WORKERS=$((CORES * 3 / 4))
[ $WORKERS -lt 2 ] && WORKERS=2

UNIT_FILES=($(ls -S "$UNIT_DIR"/*.test.js 2>/dev/null))
INTEG_FILES=($(ls "$INTEG_DIR"/*.test.js 2>/dev/null))
UNIT_COUNT=${#UNIT_FILES[@]}
INTEG_COUNT=${#INTEG_FILES[@]}

echo "╔══ 真多核並行測試 ══╗"
echo "║ CPU: ${CORES} 核 / Workers: ${WORKERS}"
echo "║ Unit: ${UNIT_COUNT} 檔 / Integration: ${INTEG_COUNT} 檔"
echo "╚═══════════════════╝"

LOGDIR=$(mktemp -d)
START=$(python3 -c 'import time; print(int(time.time()*1000))')
TOTAL_PASS=0; TOTAL_FAIL=0; TOTAL_TESTS=0

# ── Phase 1: Unit 多核並行 ──
echo ""
echo "▸ Phase 1: Unit（${WORKERS} workers）"

for ((i=0; i<WORKERS; i++)); do
  GROUP=()
  for ((j=i; j<UNIT_COUNT; j+=WORKERS)); do
    GROUP+=("${UNIT_FILES[$j]}")
  done
  [ ${#GROUP[@]} -gt 0 ] && bun test "${GROUP[@]}" > "$LOGDIR/u${i}.log" 2>&1 &
done
wait

UNIT_END=$(python3 -c 'import time; print(int(time.time()*1000))')
UNIT_MS=$((UNIT_END - START))

for logfile in "$LOGDIR"/u*.log; do
  [ -f "$logfile" ] || continue
  P=$(grep -o '[0-9]* pass' "$logfile" | awk '{s+=$1}END{print s+0}')
  F=$(grep -o '[0-9]* fail' "$logfile" | tail -1 | awk '{print $1+0}')
  T=$(grep -o 'Ran [0-9]* tests' "$logfile" | awk '{s+=$2}END{print s+0}')
  TOTAL_PASS=$((TOTAL_PASS + P)); TOTAL_FAIL=$((TOTAL_FAIL + F)); TOTAL_TESTS=$((TOTAL_TESTS + T))
done
echo "  ${TOTAL_TESTS} tests / ${TOTAL_PASS} pass / ${TOTAL_FAIL} fail（${UNIT_MS}ms）"

# ── Phase 2: Integration 獨立跑 ──
if [ $INTEG_COUNT -gt 0 ]; then
  echo ""
  echo "▸ Phase 2: Integration（${INTEG_COUNT} 檔）"
  bun test "${INTEG_FILES[@]}" > "$LOGDIR/integ.log" 2>&1
  IP=$(grep -o '[0-9]* pass' "$LOGDIR/integ.log" | awk '{s+=$1}END{print s+0}')
  IF=$(grep -o '[0-9]* fail' "$LOGDIR/integ.log" | tail -1 | awk '{print $1+0}')
  IT=$(grep -o 'Ran [0-9]* tests' "$LOGDIR/integ.log" | awk '{s+=$2}END{print s+0}')
  TOTAL_PASS=$((TOTAL_PASS + IP)); TOTAL_FAIL=$((TOTAL_FAIL + IF)); TOTAL_TESTS=$((TOTAL_TESTS + IT))
  INTEG_END=$(python3 -c 'import time; print(int(time.time()*1000))')
  INTEG_MS=$((INTEG_END - UNIT_END))
  echo "  ${IT} tests / ${IP} pass / ${IF} fail（${INTEG_MS}ms）"
fi

END=$(python3 -c 'import time; print(int(time.time()*1000))')
ELAPSED=$((END - START))

echo ""
echo "════════════════════"
echo "  合計: ${TOTAL_TESTS} tests / ${TOTAL_PASS} pass / ${TOTAL_FAIL} fail"
echo "  耗時: ${ELAPSED}ms（unit ${UNIT_MS}ms + integ ${INTEG_MS:-0}ms）"

if [ $TOTAL_FAIL -eq 0 ]; then
  echo "  ✅ ALL PASS"
else
  echo "  ❌ HAS FAILURES"
  echo ""
  echo "── 失敗詳情 ──"
  for logfile in "$LOGDIR"/*.log; do
    grep -E '\(fail\)' "$logfile" 2>/dev/null
  done
fi

find "$LOGDIR" -name '*.log' -delete 2>/dev/null
rmdir "$LOGDIR" 2>/dev/null

exit $TOTAL_FAIL
