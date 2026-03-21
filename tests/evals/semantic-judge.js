/**
 * 語意相似度判斷 — 用本地模型當裁判
 *
 * 取代 keyword overlap，判斷兩段文字是否「描述相同的事」。
 * 回傳 0-1 分數。
 */
import { join } from 'path';
import { homedir } from 'os';

const HOME = homedir();
const localModel = await import(join(HOME, '.claude/scripts/local-model.js'));
const askLocalModel = localModel.askLocalModel;

const JUDGE_SYSTEM = `你是語意相似度裁判。判斷兩段文字是否在描述相同的核心概念。
只回覆一個數字 0-5：
0 = 完全無關
1 = 主題相關但內容不同
2 = 描述類似的問題但角度不同
3 = 核心概念相同，細節不同
4 = 內容高度一致，措辭不同
5 = 語意完全等價
只回覆數字，不要其他文字。`;

/**
 * 用本地模型判斷兩段文字的語意相似度
 * @returns {number} 0-1 的相似度分數
 */
export async function semanticScore(generated, groundTruth) {
  if (!generated || !groundTruth) return 0;

  const prompt = `文字 A：${generated.slice(0, 200)}

文字 B：${groundTruth.slice(0, 200)}

語意相似度（0-5）：`;

  const result = await askLocalModel(prompt, '0', null, {
    system: JUDGE_SYSTEM,
    temperature: 0.1,
  });

  const score = parseInt((result || '0').trim().match(/\d/)?.[0] || '0', 10);
  return Math.min(score, 5) / 5; // 正規化到 0-1
}
