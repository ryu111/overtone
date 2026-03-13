import { describe, test, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const AGENTS_DIR = join(homedir(), '.claude', 'agents');

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const raw = match[1];
  const result = {};

  for (const line of raw.split('\n')) {
    // 簡易 YAML 解析（僅支援頂層 key: value 和陣列）
    const kvMatch = line.match(/^(\w+):\s*(.+)?$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      if (value === undefined || value === '') {
        result[key] = undefined; // 後續行可能是陣列
      } else {
        result[key] = value;
      }
    }
  }

  return { raw, result };
}

describe('agent frontmatter 驗證', () => {
  const agentFiles = readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'));

  test('至少有 1 個 agent 檔案', () => {
    expect(agentFiles.length).toBeGreaterThan(0);
  });

  for (const file of agentFiles) {
    describe(file, () => {
      const content = readFileSync(join(AGENTS_DIR, file), 'utf-8');
      const fm = parseFrontmatter(content);

      test('有 frontmatter', () => {
        expect(fm).not.toBeNull();
      });

      test('有 name 欄位', () => {
        expect(fm?.result?.name).toBeDefined();
      });

      test('有 description 欄位', () => {
        expect(fm?.result?.description).toBeDefined();
      });

      test('有 model 欄位', () => {
        expect(fm?.result?.model).toBeDefined();
        expect(['opus', 'sonnet', 'haiku']).toContain(fm?.result?.model);
      });

      test('無 v0.30 字眼', () => {
        expect(content).not.toContain('v0.30');
      });
    });
  }
});
