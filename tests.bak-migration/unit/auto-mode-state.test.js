import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const SCRIPTS = join(homedir(), ".claude/scripts");
const DATA_DIR = "/Users/sbu/projects/nova-manager/data";
const statePath = join(DATA_DIR, "auto-mode-state.json");
const progressPath = join(DATA_DIR, "auto-mode-progress.jsonl");
const backupState = join(DATA_DIR, "auto-mode-state.json.test-bak");
const backupProgress = join(DATA_DIR, "auto-mode-progress.jsonl.test-bak");

// 每次 import 需要不同快取 key，用時間戳讓 Bun 重新載入
let _mod;
async function getMod() {
  if (!_mod) {
    _mod = await import(`${join(SCRIPTS, "auto-mode-state.js")}?t=${Date.now()}`);
  }
  return _mod;
}

describe("auto-mode-state", () => {
  beforeEach(() => {
    // 備份現有檔案
    if (existsSync(statePath)) {
      writeFileSync(backupState, readFileSync(statePath));
      unlinkSync(statePath);
    }
    if (existsSync(progressPath)) {
      writeFileSync(backupProgress, readFileSync(progressPath));
      unlinkSync(progressPath);
    }
    // 清快取讓下次 import 重新讀檔
    _mod = null;
  });

  afterEach(() => {
    // 清理測試產生的檔案
    try { unlinkSync(statePath); } catch { /* 無需處理 */ }
    try { unlinkSync(progressPath); } catch { /* 無需處理 */ }
    // 還原備份
    if (existsSync(backupState)) {
      writeFileSync(statePath, readFileSync(backupState));
      unlinkSync(backupState);
    }
    if (existsSync(backupProgress)) {
      writeFileSync(progressPath, readFileSync(backupProgress));
      unlinkSync(backupProgress);
    }
  });

  test("defaultAutoState 回傳完整結構", async () => {
    const { defaultAutoState } = await getMod();
    const state = defaultAutoState();
    expect(state.target).toBeNull();
    expect(state.current).toBeNull();
    expect(state.staleCount).toBe(0);
    expect(Array.isArray(state.directions)).toBe(true);
    expect(state.directions).toHaveLength(0);
    expect(state.round).toBe(0);
    expect(state.lastUpdated).toBeNull();
  });

  test("readAutoState 檔案不存在時回傳 default", async () => {
    const { readAutoState } = await getMod();
    const state = readAutoState();
    expect(state.target).toBeNull();
    expect(state.round).toBe(0);
    expect(Array.isArray(state.directions)).toBe(true);
  });

  test("updateAutoState 寫入 state 並追加 progress log", async () => {
    const { updateAutoState, readAutoState } = await getMod();

    const updated = updateAutoState({ round: 1, current: "測試步驟" });
    expect(updated.round).toBe(1);
    expect(updated.current).toBe("測試步驟");
    expect(updated.lastUpdated).toBeTruthy();

    // 讀回驗證
    const state = readAutoState();
    expect(state.round).toBe(1);
    expect(state.current).toBe("測試步驟");

    // progress 有記錄
    expect(existsSync(progressPath)).toBe(true);
    const progressLine = readFileSync(progressPath, "utf-8").trim();
    const entry = JSON.parse(progressLine);
    expect(entry.round).toBe(1);
    expect(entry.current).toBe("測試步驟");
    expect(typeof entry.ts).toBe("number");
  });

  test("updateAutoState 合併而非覆蓋既有欄位", async () => {
    const { updateAutoState } = await getMod();

    updateAutoState({ target: "目標A", round: 1 });
    _mod = null; // 清快取讓第二次 import 重新讀檔
    const { updateAutoState: update2 } = await getMod();
    const result = update2({ round: 2 });

    expect(result.target).toBe("目標A"); // 保留
    expect(result.round).toBe(2);         // 更新
  });

  test("readAutoTarget 檔案不存在時回傳 null", async () => {
    const targetPath = join(DATA_DIR, "auto-mode-target.json");
    // 確保不存在
    try { unlinkSync(targetPath); } catch { /* 無需處理 */ }

    const { readAutoTarget } = await getMod();
    const result = readAutoTarget();
    expect(result).toBeNull();
  });

  test("writeAutoTarget 寫入後 readAutoTarget 可讀回", async () => {
    const targetPath = join(DATA_DIR, "auto-mode-target.json");
    let bakTarget = null;

    // 備份
    if (existsSync(targetPath)) {
      bakTarget = readFileSync(targetPath);
      unlinkSync(targetPath);
    }

    try {
      const { writeAutoTarget } = await getMod();
      const target = { goal: "提升測試覆蓋率", deadline: "2026-04-01" };
      writeAutoTarget(target);

      _mod = null;
      const { readAutoTarget: read2 } = await getMod();
      const result = read2();
      expect(result).toEqual(target);
    } finally {
      try { unlinkSync(targetPath); } catch { /* 無需處理 */ }
      if (bakTarget) writeFileSync(targetPath, bakTarget);
    }
  });
});
