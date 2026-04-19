/**
 * 工具推薦 prompt Eval（#10）
 *
 * 測量 tool-matcher.js 的 matchToolsByKeyword 推薦品質。
 * 對每個任務描述 case，用 tool-matcher 的關鍵詞匹配邏輯推薦工具，
 * 計算 precision@3（前 3 個推薦中命中 expected_tools 的比例）。
 *
 * 主指標：precision@3（前 3 推薦命中率的平均）
 *
 * 注意：此 eval 使用純關鍵詞匹配（不依賴本地模型），
 * 因此可以作為 matchToolsByKeyword 邏輯的基準線。
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync } from 'fs';

const HOME = homedir();

// 動態 import tool-matcher（使用關鍵詞匹配，不依賴本地模型）
const toolMatcher = await import(join(HOME, '.claude/scripts/tool-matcher.js'));
const matchToolsByKeyword = toolMatcher.matchToolsByKeyword;

// 動態 import tool-registry 取得工具清單
const toolRegistry = await import(join(HOME, '.claude/scripts/tool-registry.js'));
const queryTools = toolRegistry.queryTools;

const data = await import('./cases.json');
const { name, variable_file, variable_description, cases } = data.default ?? data;

/**
 * 讀取工具清單（從 registry 或 fallback 到硬編碼 CLI 工具）
 */
function getTools() {
  try {
    const tools = queryTools({}, {});
    if (tools && tools.length > 0) return tools;
  } catch (err) {
    console.error(`[tool-recommend] queryTools 失敗: ${err.message}，使用 fallback 清單`);
  }

  // fallback：硬編碼常見工具清單（與 tool-registry.js 中 CLI_TOOLS 一致）
  return [
    { id: 'cli/git', name: 'git', type: 'cli', description: '版本控制', capabilities: ['git', 'vcs', 'branch', 'merge', 'commit', 'log', 'blame'], domains: ['dev'] },
    { id: 'cli/gh', name: 'gh', type: 'cli', description: 'GitHub CLI', capabilities: ['github', 'pr', 'issue'], domains: ['dev'] },
    { id: 'cli/bun', name: 'bun', type: 'cli', description: 'JavaScript runtime + 套件管理', capabilities: ['js-runtime', 'test', 'package'], domains: ['dev'] },
    { id: 'cli/curl', name: 'curl', type: 'cli', description: 'HTTP 請求', capabilities: ['http', 'api-call'], domains: ['dev', 'devops'] },
    { id: 'cli/jq', name: 'jq', type: 'cli', description: 'JSON 處理', capabilities: ['json', 'data-transform'], domains: ['dev', 'data'] },
    { id: 'cli/sqlite3', name: 'sqlite3', type: 'cli', description: 'SQLite 資料庫', capabilities: ['database', 'sql', 'query', 'migration'], domains: ['dev', 'data'] },
    { id: 'cli/screencapture', name: 'screencapture', type: 'cli', description: 'macOS 截圖', capabilities: ['screenshot', 'visual'], domains: ['os'] },
    { id: 'cli/osascript', name: 'osascript', type: 'cli', description: 'AppleScript/JXA 執行', capabilities: ['automation', 'macos', 'gui'], domains: ['os'] },
    { id: 'mcp/pinchtab', name: 'pinchtab', type: 'mcp', description: '瀏覽器自動化 — 常駐服務，適合 bot detection 網站、登入保持、多 tab 並行', capabilities: ['browser', 'scraping', 'web', 'automation', 'screenshot', 'form', 'login', 'monitoring'], domains: ['web', 'automation'] },
    { id: 'mcp/agent-browser', name: 'agent-browser', type: 'mcp', description: '瀏覽器自動化 CLI — 適合 CI/CD 環境、JS eval、modifier key combo', capabilities: ['browser', 'web', 'screenshot', 'eval', 'keyboard', 'ci'], domains: ['web', 'automation'] },
  ];
}

/**
 * 計算 precision@k（前 k 個推薦中命中 expected_tools 的比例）
 */
function precisionAtK(recommended, expectedTools, k = 3) {
  if (!recommended || recommended.length === 0) return 0;
  if (!expectedTools || expectedTools.length === 0) return 1;

  const topK = recommended.slice(0, k);
  // 命中：推薦工具名稱包含 expected_tools 中的任何一個（或 expected 包含在推薦名稱中）
  const hits = topK.filter((r) => {
    const rName = (r.name || r.id || '').toLowerCase();
    return expectedTools.some((exp) => {
      const expLower = exp.toLowerCase();
      return rName === expLower || rName.includes(expLower) || expLower.includes(rName);
    });
  });

  return hits.length / Math.min(expectedTools.length, k);
}

/**
 * 對單一 case 執行工具推薦，回傳 precision@3
 */
async function evaluateCase(c, tools) {
  let result;
  try {
    result = matchToolsByKeyword(c.task, tools);
  } catch (err) {
    return {
      label: c.label,
      precision: 0,
      skipped: true,
      reason: `匹配失敗: ${err.message}`,
    };
  }

  const recommended = result.recommended || [];
  const precision = precisionAtK(recommended, c.expected_tools, 3);

  return {
    label: c.label,
    precision,
    skipped: false,
    task: c.task,
    expected: c.expected_tools,
    got: recommended.slice(0, 3).map((r) => r.name || r.id),
  };
}

// 取得工具清單（一次性）
const tools = getTools();
console.log(`\n執行 ${name} Eval（${cases.length} 個 cases）...`);
console.log(`variable: ${variable_file}`);
console.log(`variable_description: ${variable_description}`);
console.log(`工具清單：${tools.length} 個工具\n`);

// 並行跑所有 case
const results = await Promise.all(cases.map((c) => evaluateCase(c, tools)));

// 計算指標
const validResults = results.filter((r) => !r.skipped);
const skipped = results.filter((r) => r.skipped);
const totalPrecision = validResults.reduce((sum, r) => sum + r.precision, 0);
const avgPrecision = validResults.length > 0 ? totalPrecision / validResults.length : 0;

// 報告
console.log('='.repeat(55));
console.log(`  ${name} Eval Report`);
console.log('='.repeat(55));
console.log(`  Total cases:    ${cases.length}`);
console.log(`  Valid cases:    ${validResults.length}`);
console.log(`  Skipped:        ${skipped.length}`);
console.log(`  Avg precision@3:${(avgPrecision * 100).toFixed(1)}%`);
console.log();

const lowPrecision = validResults.filter((r) => r.precision < 0.5);
if (lowPrecision.length > 0) {
  console.log(`  低精確率 case (${lowPrecision.length}):`);
  for (const r of lowPrecision) {
    console.log(`    [${(r.precision * 100).toFixed(0)}%] ${r.label}`);
    console.log(`         任務：${r.task}`);
    console.log(`         期望：${(r.expected || []).join(', ')}`);
    console.log(`         推薦：${(r.got || []).join(', ')}`);
  }
}

if (skipped.length > 0) {
  console.log(`\n  跳過 case (${skipped.length}):`);
  for (const r of skipped) {
    console.log(`    ${r.label}: ${r.reason}`);
  }
}

console.log('='.repeat(55));
console.log();

// 輸出機器可讀指標（供 autoresearch loop 使用）
console.log(`metric:${avgPrecision.toFixed(6)}`);
