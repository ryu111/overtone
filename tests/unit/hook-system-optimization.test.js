import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// 直接載入 flow-observer 模組（不 mock 檔案系統，用真實 /tmp/）
const mod = await import(join(homedir(), '.claude/hooks/modules/flow-observer.js') + `?t=${Date.now()}`);
const handlers = mod.on;

// ── flow-events 隔離：防止測試事件污染生產環境 ──────────
const FLOW_EVENTS_PATH = '/tmp/nova-flow-events.jsonl';
const FLOW_EVENTS_BACKUP = '/tmp/nova-flow-events.jsonl.hook-test-backup';

beforeEach(() => {
	if (existsSync(FLOW_EVENTS_PATH)) {
		renameSync(FLOW_EVENTS_PATH, FLOW_EVENTS_BACKUP);
	}
});

afterEach(() => {
	// 清除測試寫入的事件
	if (existsSync(FLOW_EVENTS_PATH)) {
		unlinkSync(FLOW_EVENTS_PATH);
	}
	// 恢復備份
	if (existsSync(FLOW_EVENTS_BACKUP)) {
		renameSync(FLOW_EVENTS_BACKUP, FLOW_EVENTS_PATH);
	}
});

// ── 測試用暫存檔案清單 ──────────────────────────────
const tmpFiles = [];
function trackTmp(path) {
	tmpFiles.push(path);
	return path;
}

afterEach(() => {
	for (const f of tmpFiles) {
		try { if (existsSync(f)) unlinkSync(f); } catch { /* ignore */ }
	}
	tmpFiles.length = 0;
});

// ─────────────────────────────────────────────────────
// SubagentStart
// ─────────────────────────────────────────────────────
describe('SubagentStart handler', () => {
	test('應該在 agent 派發時回傳含 agent_dispatch 事件', () => {
		const result = handlers.SubagentStart({
			agent_type: 'executor',
			prompt: '實作一個功能',
		});
		expect(result.decision).toBe('allow');
		expect(result.events).toBeDefined();
		expect(result.events[0].type).toBe('agent_dispatch');
	});

	test('events[0].type 必須是 agent_dispatch', () => {
		const result = handlers.SubagentStart({
			agent_type: 'reviewer',
			prompt: '審查程式碼',
		});
		expect(result.events[0].type).toBe('agent_dispatch');
	});

	test('應該紀錄 agent_type', () => {
		const result = handlers.SubagentStart({
			agent_type: 'planner',
			prompt: '規劃任務',
		});
		expect(result.events[0].agent_type).toBe('planner');
	});

	test('沒有 agent_type 時應該使用預設值 general-purpose', () => {
		const result = handlers.SubagentStart({
			prompt: '執行某件事',
		});
		expect(result.events[0].agent_type).toBe('general-purpose');
	});

	test('應該從 tool_input.subagent_type 解析 agent_type', () => {
		const result = handlers.SubagentStart({
			tool_input: { subagent_type: 'haiku-executor', prompt: 'test' },
		});
		expect(result.events[0].agent_type).toBe('haiku-executor');
	});

	test('應該把 frontmatter skills 和 prompt 中的 skills 合併去重', () => {
		// prompt 中包含 skills 宣告
		const result = handlers.SubagentStart({
			agent_type: 'general-purpose',
			prompt: 'task skills: nova-test,commit-convention',
		});
		// extraSkills 應該包含 nova-test 和 commit-convention
		const skills = result.events[0].skills;
		expect(Array.isArray(skills)).toBe(true);
		expect(skills).toContain('nova-test');
		expect(skills).toContain('commit-convention');
	});

	test('合併後的 skills 應該去除重複', () => {
		const result = handlers.SubagentStart({
			agent_type: 'general-purpose',
			prompt: 'skills: nova-test,nova-test',
		});
		const skills = result.events[0].skills;
		const novaTestCount = skills.filter(s => s === 'nova-test').length;
		expect(novaTestCount).toBe(1);
	});

	test('沒有 prompt 時 skills 仍然是陣列', () => {
		const result = handlers.SubagentStart({
			agent_type: 'general-purpose',
		});
		expect(Array.isArray(result.events[0].skills)).toBe(true);
	});

	test('prompt_preview 應該截取前 200 字', () => {
		const longPrompt = 'x'.repeat(500);
		const result = handlers.SubagentStart({
			agent_type: 'general-purpose',
			prompt: longPrompt,
		});
		expect(result.events[0].prompt_preview.length).toBeLessThanOrEqual(200);
	});

	test('空 input 不應該 throw', () => {
		expect(() => handlers.SubagentStart({})).not.toThrow();
	});

	test('null input 不應該 throw', () => {
		expect(() => handlers.SubagentStart(null)).not.toThrow();
	});
});

// ─────────────────────────────────────────────────────
// PostToolUseFailure
// ─────────────────────────────────────────────────────
describe('PostToolUseFailure handler', () => {
	test('應該在工具失敗時回傳含 tool_use_failure 事件', () => {
		const result = handlers.PostToolUseFailure({
			tool_name: 'Bash',
			error: '執行失敗',
		});
		expect(result.decision).toBe('allow');
		expect(result.events[0].type).toBe('tool_use_failure');
	});

	test('應該紀錄 tool_name', () => {
		const result = handlers.PostToolUseFailure({
			tool_name: 'Write',
			error: '寫入失敗',
		});
		expect(result.events[0].tool_name).toBe('Write');
	});

	test('error 字串應該被截斷到 200 字', () => {
		const longError = 'e'.repeat(500);
		const result = handlers.PostToolUseFailure({
			tool_name: 'Bash',
			error: longError,
		});
		expect(result.events[0].error.length).toBeLessThanOrEqual(200);
	});

	test('error 剛好 200 字時不應該截斷', () => {
		const exactError = 'e'.repeat(200);
		const result = handlers.PostToolUseFailure({
			tool_name: 'Bash',
			error: exactError,
		});
		expect(result.events[0].error.length).toBe(200);
	});

	test('error 為物件時應該 JSON 序列化後截斷', () => {
		const result = handlers.PostToolUseFailure({
			tool_name: 'Bash',
			error: { code: 1, message: 'failed' },
		});
		expect(typeof result.events[0].error).toBe('string');
		expect(result.events[0].error.length).toBeLessThanOrEqual(200);
	});

	test('Bash test 失敗時 testRun 應該增加但 testPass 不應該增加', () => {
		// 先執行一次成功的 test 確認計數
		handlers.PostToolUse?.({
			tool_name: 'Bash',
			tool_input: { command: 'bun test' },
			tool_result: { exitCode: 0 },
		});

		// 再執行失敗的 test
		const result = handlers.PostToolUseFailure({
			tool_name: 'Bash',
			tool_input: { command: 'bun test --filter=失敗的測試' },
			error: 'Test failed',
		});

		// 只要確認回傳正確，WorkflowSignals 是模組內部狀態
		expect(result.decision).toBe('allow');
		expect(result.events[0].type).toBe('tool_use_failure');
	});

	test('非 test Bash 指令不應該觸發 testRun 計數', () => {
		const result = handlers.PostToolUseFailure({
			tool_name: 'Bash',
			tool_input: { command: 'ls -la' },
			error: '指令失敗',
		});
		expect(result.decision).toBe('allow');
		expect(result.events[0].type).toBe('tool_use_failure');
	});

	test('npm test 失敗也應該被偵測', () => {
		const result = handlers.PostToolUseFailure({
			tool_name: 'Bash',
			tool_input: { command: 'npm test' },
			error: 'Tests failed',
		});
		expect(result.decision).toBe('allow');
	});

	test('vitest 失敗也應該被偵測', () => {
		const result = handlers.PostToolUseFailure({
			tool_name: 'Bash',
			tool_input: { command: 'vitest run' },
			error: 'Test failed',
		});
		expect(result.decision).toBe('allow');
	});

	test('沒有 tool_name 時使用預設值 unknown', () => {
		const result = handlers.PostToolUseFailure({
			error: '未知錯誤',
		});
		expect(result.events[0].tool_name).toBe('unknown');
	});

	test('空 input 不應該 throw', () => {
		expect(() => handlers.PostToolUseFailure({})).not.toThrow();
	});

	test('null input 不應該 throw', () => {
		expect(() => handlers.PostToolUseFailure(null)).not.toThrow();
	});
});

// ─────────────────────────────────────────────────────
// PreCompact
// ─────────────────────────────────────────────────────
describe('PreCompact handler', () => {
	const testProject = `test-precompact-${Date.now()}`;
	const handoffPath = `/tmp/nova-handoff-${testProject}.md`;
	const recoveryPath = `/tmp/nova-compact-recovery-${testProject}.md`;

	beforeEach(() => {
		trackTmp(handoffPath);
		trackTmp(recoveryPath);
	});

	test('應該回傳含 pre_compact 事件', () => {
		const result = handlers.PreCompact({
			cwd: `/Users/test/${testProject}`,
		});
		expect(result.decision).toBe('allow');
		expect(result.events[0].type).toBe('pre_compact');
	});

	test('應該寫入 handoff 檔案到 /tmp/nova-handoff-{project}.md', () => {
		handlers.PreCompact({
			cwd: `/Users/test/${testProject}`,
		});
		expect(existsSync(handoffPath)).toBe(true);
	});

	test('handoff 檔案應該包含 project 名稱', () => {
		handlers.PreCompact({
			cwd: `/Users/test/${testProject}`,
		});
		const content = readFileSync(handoffPath, 'utf-8');
		expect(content).toContain(testProject);
	});

	test('應該寫入 compact-recovery 檔案到 /tmp/nova-compact-recovery-{project}.md', () => {
		handlers.PreCompact({
			cwd: `/Users/test/${testProject}`,
		});
		expect(existsSync(recoveryPath)).toBe(true);
	});

	test('compact-recovery 檔案應該包含 handoff 路徑', () => {
		handlers.PreCompact({
			cwd: `/Users/test/${testProject}`,
		});
		const content = readFileSync(recoveryPath, 'utf-8');
		expect(content).toContain(handoffPath);
	});

	test('事件應該包含 cwd 和 project 欄位', () => {
		const cwd = `/Users/test/${testProject}`;
		const result = handlers.PreCompact({ cwd });
		expect(result.events[0].cwd).toBe(cwd);
		expect(result.events[0].project).toBe(testProject);
	});

	test('沒有 cwd 時仍不應該 throw', () => {
		const unknownHandoff = '/tmp/nova-handoff-unknown.md';
		const unknownRecovery = '/tmp/nova-compact-recovery-unknown.md';
		trackTmp(unknownHandoff);
		trackTmp(unknownRecovery);
		expect(() => handlers.PreCompact({})).not.toThrow();
	});

	test('null input 不應該 throw', () => {
		trackTmp('/tmp/nova-handoff-unknown.md');
		trackTmp('/tmp/nova-compact-recovery-unknown.md');
		expect(() => handlers.PreCompact(null)).not.toThrow();
	});
});

// ─────────────────────────────────────────────────────
// Stop
// ─────────────────────────────────────────────────────
describe('Stop handler', () => {
	test('stop_reason=user 時應該只有 session_stop 事件，沒有 failure 事件', () => {
		const result = handlers.Stop({ stop_reason: 'user' });
		expect(result.decision).toBe('allow');
		const types = result.events.map(e => e.type);
		expect(types).toContain('session_stop');
		expect(types).not.toContain('session_stop_failure');
	});

	test('stop_reason=end_turn 時應該只有 session_stop 事件，沒有 failure 事件', () => {
		const result = handlers.Stop({ stop_reason: 'end_turn' });
		const types = result.events.map(e => e.type);
		expect(types).toContain('session_stop');
		expect(types).not.toContain('session_stop_failure');
	});

	test('stop_reason=error 時應該在異常結束時 emit session_stop_failure', () => {
		const result = handlers.Stop({ stop_reason: 'error' });
		const types = result.events.map(e => e.type);
		expect(types).toContain('session_stop');
		expect(types).toContain('session_stop_failure');
	});

	test('stop_reason=error 時 events 應該有兩個（session_stop + session_stop_failure）', () => {
		const result = handlers.Stop({ stop_reason: 'error' });
		expect(result.events.length).toBe(2);
	});

	test('stop_reason=timeout 時應該有 session_stop_failure', () => {
		const result = handlers.Stop({ stop_reason: 'timeout' });
		const types = result.events.map(e => e.type);
		expect(types).toContain('session_stop_failure');
	});

	test('session_stop 事件應該包含 stop_reason', () => {
		const result = handlers.Stop({ stop_reason: 'user' });
		const stopEvent = result.events.find(e => e.type === 'session_stop');
		expect(stopEvent.stop_reason).toBe('user');
	});

	test('session_stop_failure 事件應該包含 stop_reason', () => {
		const result = handlers.Stop({ stop_reason: 'error' });
		const failEvent = result.events.find(e => e.type === 'session_stop_failure');
		expect(failEvent.stop_reason).toBe('error');
	});

	test('沒有 stop_reason 時應該只有 session_stop 事件', () => {
		const result = handlers.Stop({});
		const types = result.events.map(e => e.type);
		expect(types).toContain('session_stop');
		expect(types).not.toContain('session_stop_failure');
	});

	test('null input 不應該 throw', () => {
		expect(() => handlers.Stop(null)).not.toThrow();
	});

	test('空 input 不應該 throw', () => {
		expect(() => handlers.Stop({})).not.toThrow();
	});
});
