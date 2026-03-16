// local-model-parsing.test.js — stripThinking + extractJSON 解析測試
// 根因：Qwen3.5 有時輸出 "Thinking Process:" 純文字而非 <think> 標籤，
// 導致 Judge 語意評分失敗（7 個 F 級元件）。
import { describe, test, expect } from 'bun:test';
import { stripThinking, extractJSON } from '/Users/sbu/.claude/scripts/local-model.js';

// ─── 1. stripThinking ─────────────────────────────────────────────────────────

describe('stripThinking', () => {
  test('空字串 → 空字串', () => {
    expect(stripThinking("")).toBe("");
    expect(stripThinking(null)).toBe("");
    expect(stripThinking(undefined)).toBe("");
  });

  test('無思考內容 → 原文不動', () => {
    expect(stripThinking('{"total": 42}')).toBe('{"total": 42}');
  });

  test('標準 <think> 標籤 → 移除', () => {
    const input = '<think>很長的思考過程...</think>\n{"total": 42}';
    expect(stripThinking(input)).toBe('{"total": 42}');
  });

  test('多個 <think> 標籤 → 全部移除', () => {
    const input = '<think>first</think>middle<think>second</think>end';
    expect(stripThinking(input)).toBe('middleend');
  });

  test('純文字 "Thinking Process:" + JSON → 提取 JSON', () => {
    const input = `Thinking Process:

1.  **Analyze the Request:**
    *   Role: Nova System AI Assistant.
    *   Task: Evaluate quality of this hook module.

2.  **Score each dimension:**
    *   stability: 8/10
    *   security: 12/15

{"stability":8,"security":12,"performance":10,"maintainability":8,"total":38}`;
    const result = stripThinking(input);
    expect(result).toContain('"total":38');
    // 確認可解析為 JSON
    expect(JSON.parse(result)).toEqual({
      stability: 8, security: 12, performance: 10, maintainability: 8, total: 38
    });
  });

  test('純文字 "思考過程:" + JSON → 提取 JSON', () => {
    const input = `思考過程:
分析這個 rule 的品質...
可執行性很高...

{"actionability":12,"coverage":8,"exclusivity":7,"necessity":13,"total":40}`;
    const result = stripThinking(input);
    expect(JSON.parse(result).total).toBe(40);
  });

  test('純文字 "**Thinking:**" + JSON → 提取 JSON', () => {
    const input = `**Thinking:**
Let me analyze this skill...

{"knowledge":12,"clarity":13,"utility":8,"maintainability":7,"total":40}`;
    const result = stripThinking(input);
    expect(JSON.parse(result).total).toBe(40);
  });

  test('純文字思考但無 JSON → 保留原文（讓 extractJSON 決定）', () => {
    const input = `Thinking Process:
1. Analyze the request
2. Score each dimension
No JSON produced.`;
    const result = stripThinking(input);
    // 找不到 JSON 起始符號，保留原文
    expect(result).toBe(input);
  });

  test('JSON 陣列在思考文字後 → 提取', () => {
    const input = `Thinking Process:
分析中...

[{"issue":"問題1","fix":"修復1"}]`;
    const result = stripThinking(input);
    expect(result).toContain('"issue"');
  });

  test('未閉合 <think>（max_tokens 截斷）→ 全部移除', () => {
    const input = '<think>很長的思考...\n分析中...\n還在想...';
    const result = stripThinking(input);
    expect(result).toBe("");
  });

  test('未閉合 <think> + 前方有正常文字 → 保留前方、移除 <think> 後', () => {
    const input = '{"total": 42}\n<think>開始思考但被截斷...';
    const result = stripThinking(input);
    expect(result).toBe('{"total": 42}');
  });

  test('思考文字 + JSON 不在獨立行（同行）→ fallback 提取', () => {
    const input = `Thinking Process:
分析結果 {"stability":8,"security":12,"performance":10,"maintainability":8,"total":38}`;
    const result = stripThinking(input);
    expect(result).toContain('"total":38');
  });

  test('<think> 已閉合 + 未閉合 <think> 混合 → 正確處理', () => {
    const input = '<think>第一段思考</think>\n{"result": "ok"}\n<think>第二段未閉合...';
    const result = stripThinking(input);
    expect(result).toBe('{"result": "ok"}');
  });
});

// ─── 2. extractJSON ───────────────────────────────────────────────────────────

describe('extractJSON', () => {
  test('null / 空字串 → null', () => {
    expect(extractJSON(null)).toBeNull();
    expect(extractJSON("")).toBeNull();
    expect(extractJSON(undefined)).toBeNull();
  });

  test('直接是 JSON 物件 → 解析', () => {
    expect(extractJSON('{"total": 42}')).toEqual({ total: 42 });
  });

  test('直接是 JSON 陣列 → 解析', () => {
    const result = extractJSON('[{"a":1},{"b":2}]');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  test('```json code block → 提取', () => {
    const input = '一些說明文字\n```json\n{"total": 35}\n```\n後續文字';
    expect(extractJSON(input)).toEqual({ total: 35 });
  });

  test('"total" 欄位 JSON（Judge 評分）→ 提取', () => {
    const input = '分析結果：{"stability":8,"security":12,"performance":10,"maintainability":8,"total":38} 以上。';
    const result = extractJSON(input);
    expect(result.total).toBe(38);
  });

  test('思考文字 + 末尾 JSON → 從末尾提取', () => {
    const input = `Thinking Process:
1. This is analysis text with some {curly} braces
2. More analysis here

Final answer:
{"stability":7,"security":10,"performance":12,"maintainability":6,"total":35}`;
    const result = extractJSON(input);
    expect(result).not.toBeNull();
    expect(result.total).toBe(35);
  });

  test('Markdown 格式的思考 + JSON → 提取', () => {
    const input = `**Analysis:**
- Good error handling
- Missing timeout protection

Score: {"knowledge":10,"clarity":12,"utility":8,"maintainability":7,"total":37}`;
    const result = extractJSON(input);
    expect(result.total).toBe(37);
  });

  test('多個 JSON-like 字串，有 "total" 的優先', () => {
    const input = '{"name":"test"} 然後 {"stability":5,"total":30}';
    const result = extractJSON(input);
    expect(result.total).toBe(30);
  });

  test('完全沒有 JSON → null', () => {
    expect(extractJSON('This is just plain text with no JSON')).toBeNull();
  });

  test('壞 JSON 格式 → null', () => {
    expect(extractJSON('{not valid json}')).toBeNull();
  });

  test('JSON 陣列用於改善建議', () => {
    const input = `[{"issue":"缺少 frontmatter","fix":"補上 YAML 區塊"},{"issue":"無反模式","fix":"加 NEVER 區塊"}]`;
    const result = extractJSON(input);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].issue).toBe("缺少 frontmatter");
  });

  test('stripThinking 後殘留的 JSON 可被 extractJSON 解析（端到端）', () => {
    const rawModelOutput = `<think>
Let me think about this scoring...
The hook has good error handling but lacks timeout.
</think>
Thinking Process:
1. Analyze structure
2. Check security

{"stability":8,"security":12,"performance":10,"maintainability":8,"total":38}`;
    // 模擬 askLocalModelJSON 流程：strip → extract
    const stripped = stripThinking(rawModelOutput);
    const parsed = extractJSON(stripped);
    expect(parsed).not.toBeNull();
    expect(parsed.total).toBe(38);
  });
});

// ─── 3. 端到端管線測試（stripThinking → extractJSON）─────────────────────────

describe('端到端管線：stripThinking → extractJSON', () => {
  test('純 Thinking Process 文字（無 JSON）→ null（根因場景）', () => {
    // 這是 Judge 47 次失敗的實際模式：模型用完 token 在思考上，沒產出 JSON
    const rawModelOutput = `Thinking Process:

1.  **Analyze the Request:**
    *   Role: Nova System AI Assistant.
    *   Task: Evaluate quality of this hook module.

2.  **Score each dimension:**
    *   stability: 8/10
    *   security: 12/15
    *   performance: 10/15
    *   maintainability: 8/10

3.  **Calculate Total:**
    *   Total = 8 + 12 + 10 + 8 = 38/50`;
    const stripped = stripThinking(rawModelOutput);
    const parsed = extractJSON(stripped);
    // 無 JSON 產出 → 正確回傳 null（caller 走 fallback）
    expect(parsed).toBeNull();
  });

  test('/no_think 殘留在輸出中不影響 JSON 解析', () => {
    // 若 chat template 未完全剝離 /no_think，確認不影響解析
    const rawModelOutput = '/no_think\n{"stability":8,"security":12,"performance":10,"maintainability":8,"total":38}';
    const stripped = stripThinking(rawModelOutput);
    const parsed = extractJSON(stripped);
    expect(parsed).not.toBeNull();
    expect(parsed.total).toBe(38);
  });

  test('思考文字含 curly braces（Markdown 格式）→ 提取正確 JSON', () => {
    const rawModelOutput = `Thinking Process:
The function uses \`try { ... } catch (e) { ... }\` pattern.
Error handling score: {good}.

{"stability":9,"security":11,"performance":13,"maintainability":7,"total":40}`;
    const stripped = stripThinking(rawModelOutput);
    const parsed = extractJSON(stripped);
    expect(parsed).not.toBeNull();
    expect(parsed.total).toBe(40);
  });

  test('<think> + Thinking Process: 雙重包裝 + JSON → 正確提取', () => {
    const rawModelOutput = `<think>
內部思考...
</think>
Thinking Process:
外部分析...

{"knowledge":14,"clarity":12,"utility":9,"maintainability":8,"total":43}`;
    const stripped = stripThinking(rawModelOutput);
    const parsed = extractJSON(stripped);
    expect(parsed).not.toBeNull();
    expect(parsed.total).toBe(43);
  });
});
