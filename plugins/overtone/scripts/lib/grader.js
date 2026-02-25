'use strict';
/**
 * grader.js — Model Grader（Haiku 品質評分）
 * 用 claude-haiku-4-5-20251001 對 agent 輸出做快速品質評分。
 * 無 ANTHROPIC_API_KEY 時靜默跳過。
 */

const MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 10000;

/**
 * 對 agent 輸出評分
 * @param {string} agentName - agent 名稱（如 'developer'）
 * @param {string} stage - 階段（如 'DEV'）
 * @param {string} content - agent 的輸出摘要（Handoff 或 verdict summary）
 * @returns {Promise<{clarity:number, completeness:number, actionability:number, overall:number}|null>}
 */
async function grade(agentName, stage, content) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !content || content.length < 10) return null;

  const prompt = `你是品質評審。對以下 AI agent 輸出評分，每項 1-5 分（整數）。

Agent: ${agentName}（${stage} 階段）
輸出摘要：
${content.slice(0, 1000)}

請用以下 JSON 格式回應（不要其他文字）：
{"clarity":N,"completeness":N,"actionability":N}
- clarity: 輸出清晰度（1=模糊 5=非常清楚）
- completeness: 完整度（1=嚴重缺漏 5=完全回答需求）
- actionability: 可操作性（1=無法行動 5=下一步明確）`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 64,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.[0]?.text || '';
    // 提取 JSON block（防止 Haiku 回傳前綴文字）
    const jsonMatch = text.match(/\{[^{}]*\}/);
    if (!jsonMatch) return null;
    const scores = JSON.parse(jsonMatch[0]);
    const { clarity = 0, completeness = 0, actionability = 0 } = scores;
    // 驗證分數範圍
    if ([clarity, completeness, actionability].some(s => s < 1 || s > 5 || !Number.isInteger(s))) return null;
    const overall = parseFloat(((clarity + completeness + actionability) / 3).toFixed(2));
    return { clarity, completeness, actionability, overall };
  } catch {
    /* 網路失敗/逾時/JSON 解析失敗，靜默跳過 */
    return null;
  }
}

module.exports = { grade };
