'use strict';
/**
 * wording.js — 措詞正確性偵測模組
 *
 * 提供 emoji-關鍵詞強度不匹配的偵測功能。
 * 對應 plugins/overtone/skills/wording/references/wording-guide.md 的三層規則：
 *   💡（軟引導）、📋（強規則）、⛔（硬阻擋）
 *
 * 此模組由 post-use.js Hook 使用，也可獨立測試。
 */

const fs = require('fs');

/**
 * 三個 emoji-關鍵詞不匹配規則
 * - 💡（軟引導）不應搭配強制關鍵字（MUST/ALWAYS/NEVER）
 * - 📋（強規則）不應搭配建議關鍵字（consider/may/could）
 * - ⛔（硬阻擋）不應搭配軟語氣關鍵字（should/consider/may/prefer/could）
 */
const WORDING_RULES = [
  {
    pattern: /💡\s*(MUST|ALWAYS|NEVER|MUST\s*NOT)\b/,
    emoji: '💡', level: '軟引導', matchLevel: '強規則/硬阻擋',
    suggestion: '💡 應搭配 should/prefer，強制規則請改用 📋 或 ⛔',
  },
  {
    pattern: /📋\s*(consider|may\s|could\s)/i,
    emoji: '📋', level: '強規則', matchLevel: '建議用詞',
    suggestion: '📋 應搭配 MUST/ALWAYS，建議請改用 🔧',
  },
  {
    pattern: /⛔\s*(should|consider|may\s|prefer|could\s)/i,
    emoji: '⛔', level: '硬阻擋', matchLevel: '軟引導/建議',
    suggestion: '⛔ 應搭配 NEVER/MUST NOT，軟引導請改用 💡',
  },
];

/**
 * 掃描 .md 檔案，偵測 emoji-關鍵詞不匹配的行
 * @param {string|undefined} filePath - 目標檔案路徑
 * @returns {string[]} 警告訊息陣列（空陣列表示無問題）
 */
function detectWordingMismatch(filePath) {
  // 只偵測 .md 檔案
  if (!filePath?.endsWith('.md')) return [];

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const warnings = [];
  const lines = content.split('\n').slice(0, 1000); // 上限 1000 行
  let inCodeFence = false; // 追蹤是否在 code fence 內

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // code fence 狀態追蹤：行首三個以上反引號切換 inCodeFence
    // trimStart() 處理縮排場景（如 list item 內的 code fence）
    if (/^```/.test(line.trimStart())) {
      inCodeFence = !inCodeFence;
      continue; // code fence 標記行本身跳過偵測
    }

    // code fence 內的行跳過偵測
    if (inCodeFence) continue;

    // 排除 Markdown 表格行（以 | 開頭），避免說明用的對照表產生誤報
    if (line.trimStart().startsWith('|')) continue;

    for (const rule of WORDING_RULES) {
      const match = line.match(rule.pattern);
      if (match) {
        warnings.push(
          `  第 ${i + 1} 行：${line.trim()}\n` +
          `  → ${rule.emoji}（${rule.level}）不應搭配「${match[1]}」（${rule.matchLevel}）。${rule.suggestion}`
        );
        break; // 每行只報告第一個問題
      }
    }
  }

  return warnings;
}

module.exports = { WORDING_RULES, detectWordingMismatch };
