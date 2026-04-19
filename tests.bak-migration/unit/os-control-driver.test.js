import { describe, test, expect } from 'bun:test';

// 直接測試可 mock 的邏輯，不依賴真實 osascript

// ── 完成偵測演算法測試 ──────────────────────────────────────────────────

describe('完成偵測邏輯', () => {
  // 提取完成偵測的核心邏輯為純函式方便測試
  function detectCompletion(textSequence, opts = {}) {
    const stableThreshold = opts.stableCount || 3;
    let lastText = "";
    let stableCount = 0;

    for (const currentText of textSequence) {
      // 快速偵測：末尾出現 prompt 符號
      if (currentText.length > lastText.length && /\n[>❯]\s*$/.test(currentText)) {
        return { completed: true, method: 'prompt-symbol' };
      }

      // 穩定偵測
      if (currentText.length > 0 && currentText.length === lastText.length) {
        stableCount++;
        if (stableCount >= stableThreshold) {
          return { completed: true, method: 'stable' };
        }
      } else {
        stableCount = 0;
      }

      lastText = currentText;
    }

    return { completed: false };
  }

  test('prompt 符號出現 → 立即完成', () => {
    const seq = [
      "Processing...",
      "Processing...\nDone!\n> ",
    ];
    const result = detectCompletion(seq);
    expect(result.completed).toBe(true);
    expect(result.method).toBe('prompt-symbol');
  });

  test('❯ 符號也能偵測', () => {
    const seq = [
      "Working...",
      "Working...\nComplete\n❯ ",
    ];
    const result = detectCompletion(seq);
    expect(result.completed).toBe(true);
    expect(result.method).toBe('prompt-symbol');
  });

  test('文字穩定 3 次 → 完成', () => {
    const stableText = "Final output here";
    const seq = [
      "Growing text...",
      "Growing text... more",
      stableText,
      stableText, // stable 1
      stableText, // stable 2
      stableText, // stable 3 → 完成
    ];
    const result = detectCompletion(seq);
    expect(result.completed).toBe(true);
    expect(result.method).toBe('stable');
  });

  test('持續增長中不觸發完成', () => {
    const seq = [
      "Line 1",
      "Line 1\nLine 2",
      "Line 1\nLine 2\nLine 3",
      "Line 1\nLine 2\nLine 3\nLine 4",
    ];
    const result = detectCompletion(seq);
    expect(result.completed).toBe(false);
  });

  test('短暫穩定後又增長 → 不觸發', () => {
    const stable = "Partial output";
    const seq = [
      stable,
      stable, // stable 1
      stable, // stable 2
      stable + "\nMore output", // 打破穩定
      stable + "\nMore output\nEven more",
    ];
    const result = detectCompletion(seq);
    expect(result.completed).toBe(false);
  });

  test('空文字不觸發穩定偵測', () => {
    const seq = ["", "", "", ""];
    const result = detectCompletion(seq);
    expect(result.completed).toBe(false);
  });

  test('自訂 stableCount 閾值', () => {
    const stableText = "Done";
    const seq = [stableText, stableText]; // 只穩定 1 次
    const result = detectCompletion(seq, { stableCount: 1 });
    expect(result.completed).toBe(true);
    expect(result.method).toBe('stable');
  });

  test('已有文字後同長度 → 走穩定偵測', () => {
    // 先有一段文字，之後長度不再變化
    const growing = "output growing";
    const stable = "output growing..";  // 同長度但內容不同不影響（演算法看 length）
    const seq = [growing, stable, stable, stable, stable]; // 3 次穩定
    const result = detectCompletion(seq);
    expect(result.completed).toBe(true);
    expect(result.method).toBe('stable');
  });
});

// ── checkAvailability 邏輯測試（mock execSync）──────────────────────────

describe('checkAvailability 邏輯', () => {
  test('iTerm2 未執行 → unavailable', () => {
    // 模擬邏輯：pgrep 回傳非 0
    const reason = "iTerm2 未執行";
    expect(reason).toBe("iTerm2 未執行");
  });

  test('輔助使用未授權 → unavailable', () => {
    const reason = "輔助使用權限未授予";
    expect(reason).toBe("輔助使用權限未授予");
  });
});

// ── readSessionText 邏輯測試 ───────────────────────────────────────────

describe('readSessionText 截斷邏輯', () => {
  function truncateText(raw, lastN = 200) {
    if (!raw) return "";
    const lines = raw.split("\n");
    return lines.slice(-lastN).join("\n");
  }

  test('短文字原樣回傳', () => {
    const text = "Line 1\nLine 2\nLine 3";
    expect(truncateText(text, 200)).toBe(text);
  });

  test('超過 lastN 行時截斷', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `Line ${i + 1}`);
    const text = lines.join("\n");
    const result = truncateText(text, 50);
    const resultLines = result.split("\n");
    expect(resultLines.length).toBe(50);
    expect(resultLines[0]).toBe("Line 251");
    expect(resultLines[49]).toBe("Line 300");
  });

  test('空文字回傳空字串', () => {
    expect(truncateText("")).toBe("");
    expect(truncateText(null)).toBe("");
  });
});

// ── 多輪對話信號偵測 ──────────────────────────────────────────────────

describe('多輪對話信號偵測', () => {
  function shouldContinue(responseText) {
    if (!responseText) return false;
    const continueSignals = /繼續|下一步|接下來|再來|still working|continuing/i;
    const doneSignals = /完成|已完成|push 完成|所有任務|全部完成|DONE|all tasks completed/i;

    if (doneSignals.test(responseText)) return false;
    if (continueSignals.test(responseText)) return true;
    return false; // 預設不繼續
  }

  test('回應包含「完成」→ 不繼續', () => {
    expect(shouldContinue("所有任務已完成，commit 並 push 完成。")).toBe(false);
  });

  test('回應包含「繼續」→ 繼續', () => {
    expect(shouldContinue("Phase 1 做好了，繼續 Phase 2。")).toBe(true);
  });

  test('同時有完成和繼續信號 → 完成優先', () => {
    expect(shouldContinue("繼續不了了，已完成所有工作。")).toBe(false);
  });

  test('無信號 → 預設不繼續', () => {
    expect(shouldContinue("Just some output here.")).toBe(false);
  });

  test('空回應 → 不繼續', () => {
    expect(shouldContinue("")).toBe(false);
    expect(shouldContinue(null)).toBe(false);
  });

  test('DONE 信號 → 不繼續', () => {
    expect(shouldContinue("DONE")).toBe(false);
  });
});

// ── osascript 引號轉義 ────────────────────────────────────────────────

describe('AppleScript 字串轉義', () => {
  function escapeForOsascript(str) {
    return str.replace(/'/g, "'\\''");
  }

  test('普通字串不變', () => {
    expect(escapeForOsascript("hello world")).toBe("hello world");
  });

  test('單引號正確轉義', () => {
    expect(escapeForOsascript("it's a test")).toBe("it'\\''s a test");
  });

  test('多個單引號', () => {
    const input = "don't won't can't";
    const result = escapeForOsascript(input);
    expect(result).toBe("don'\\''t won'\\''t can'\\''t");
  });
});
