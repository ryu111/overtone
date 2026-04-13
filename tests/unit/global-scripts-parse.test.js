import { describe, it, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

// Smoke test: 確保關鍵 global script 能被 bun parse（防 self-check.js:334 那種
// 「scheduler warnOnly:true 吞掉 parse error，靜默失敗 2 天」的回歸）。
//
// 為何用 `bun --print 'import(...)'` 而不是直接 import：
//   1. 直接 import 會執行 top-level 副作用（讀檔、起連線）。
//   2. 動態 import 在子 process 中只觸發 parse + module evaluation，
//      失敗時整個 spawn exitCode != 0，斷言乾淨。

const SCRIPTS = [
	'.claude/scripts/self-check.js',
	'.claude/scripts/health-check.js',
	'.claude/scripts/spec-tasks.js',
];

describe('global scripts parse smoke', () => {
	for (const rel of SCRIPTS) {
		const abs = join(homedir(), rel);
		it(`${rel} 能被 bun parse 且 module evaluation 不丟錯`, () => {
			if (!existsSync(abs)) {
				throw new Error(`script not found: ${abs}`);
			}
			const r = spawnSync('bun', ['--print', `import(${JSON.stringify(abs)}).then(()=>"ok")`], {
				encoding: 'utf-8',
				timeout: 10000,
			});
			expect(r.status).toBe(0);
			expect(r.stderr || '').not.toContain('Unexpected escaped backtick');
			expect(r.stderr || '').not.toContain('SyntaxError');
		});
	}
});
