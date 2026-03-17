import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';

// ─────────────────────────────────────────────────────────────────────────────
// keyboard.js
// ─────────────────────────────────────────────────────────────────────────────
const {
  pressKey,
  typeText,
  pressKeyCode,
  checkAccessibility,
} = await import(join(homedir(), '.claude/scripts/os/keyboard.js'));

describe('keyboard.js', () => {
  describe('平台守衛', () => {
    it('非 darwin 平台回傳 UNSUPPORTED_PLATFORM', () => {
      const origPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      const result = pressKey('a', [], {});
      Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    });
  });

  describe('pressKey()', () => {
    it('一般字元產生 keystroke 指令', () => {
      let captured = {};
      const deps = { execSync: (cmd, opts) => { captured = { cmd, input: opts?.input }; return ''; } };
      const result = pressKey('a', [], deps);
      expect(result.ok).toBe(true);
      expect(captured.cmd).toBe('osascript');
      expect(captured.input).toContain('keystroke "a"');
      expect(captured.input).toContain('System Events');
    });

    it('特殊鍵 return 使用 key code 36', () => {
      let captured = {};
      const deps = { execSync: (cmd, opts) => { captured = { cmd, input: opts?.input }; return ''; } };
      pressKey('return', [], deps);
      expect(captured.input).toContain('key code 36');
    });

    it('特殊鍵 escape 使用 key code 53', () => {
      let captured = {};
      const deps = { execSync: (cmd, opts) => { captured = { cmd, input: opts?.input }; return ''; } };
      pressKey('escape', [], deps);
      expect(captured.input).toContain('key code 53');
    });

    it('特殊鍵 tab 使用 key code 48', () => {
      let captured = {};
      const deps = { execSync: (cmd, opts) => { captured = { cmd, input: opts?.input }; return ''; } };
      pressKey('tab', [], deps);
      expect(captured.input).toContain('key code 48');
    });

    it('modifier 組合：command + shift', () => {
      let captured = {};
      const deps = { execSync: (cmd, opts) => { captured = { cmd, input: opts?.input }; return ''; } };
      pressKey('a', ['command', 'shift'], deps);
      expect(captured.input).toContain('command down');
      expect(captured.input).toContain('shift down');
    });

    it('modifier 組合：control + a', () => {
      let captured = {};
      const deps = { execSync: (cmd, opts) => { captured = { cmd, input: opts?.input }; return ''; } };
      pressKey('a', ['control'], deps);
      expect(captured.input).toContain('control down');
    });

    it('key 為空字串回傳 INVALID_ARGUMENT', () => {
      const result = pressKey('', [], {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });

    it('key 未傳回傳 INVALID_ARGUMENT', () => {
      const result = pressKey(undefined, [], {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });

    it('execSync 拋出錯誤回傳 COMMAND_FAILED', () => {
      const deps = { execSync: () => { throw new Error('permission denied'); } };
      const result = pressKey('a', [], deps);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('COMMAND_FAILED');
    });
  });

  describe('typeText()', () => {
    it('輸入文字產生 keystroke 指令', () => {
      let captured = {};
      const deps = { execSync: (cmd, opts) => { captured = { cmd, input: opts?.input }; return ''; } };
      const result = typeText('hello world', deps);
      expect(result.ok).toBe(true);
      expect(captured.cmd).toBe('osascript');
      expect(captured.input).toContain('keystroke "hello world"');
    });

    it('轉義雙引號', () => {
      let captured = {};
      const deps = { execSync: (cmd, opts) => { captured = { cmd, input: opts?.input }; return ''; } };
      typeText('say "hi"', deps);
      expect(captured.input).toContain('\\"hi\\"');
    });

    it('轉義反斜線', () => {
      let captured = {};
      const deps = { execSync: (cmd, opts) => { captured = { cmd, input: opts?.input }; return ''; } };
      typeText('C:\\path', deps);
      expect(captured.input).toContain('C:\\\\path');
    });

    it('空字串回傳 ok:true 不呼叫 execSync', () => {
      let called = false;
      const deps = { execSync: () => { called = true; return ''; } };
      const result = typeText('', deps);
      expect(result.ok).toBe(true);
      expect(called).toBe(false);
    });

    it('text 為 null 回傳 INVALID_ARGUMENT', () => {
      const result = typeText(null, {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });
  });

  describe('pressKeyCode()', () => {
    it('傳入 key code 36 產生 key code 36 指令', () => {
      let captured = '';
      const deps = { execSync: (cmd) => { captured = cmd; return ''; } };
      const result = pressKeyCode(36, [], deps);
      expect(result.ok).toBe(true);
      expect(captured).toContain('key code 36');
    });

    it('負數 code 回傳 INVALID_ARGUMENT', () => {
      const result = pressKeyCode(-1, [], {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });

    it('非整數 code 回傳 INVALID_ARGUMENT', () => {
      const result = pressKeyCode(1.5, [], {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });

    it('modifier 組合正確加入', () => {
      let captured = '';
      const deps = { execSync: (cmd) => { captured = cmd; return ''; } };
      pressKeyCode(0, ['command'], deps);
      expect(captured).toContain('command down');
    });
  });

  describe('checkAccessibility()', () => {
    it('execSync 成功回傳 granted:true', () => {
      const deps = { execSync: () => '' };
      const result = checkAccessibility(deps);
      expect(result.ok).toBe(true);
      expect(result.granted).toBe(true);
    });

    it('execSync 拋出 assistive 錯誤回傳 granted:false', () => {
      const deps = { execSync: () => { throw new Error('not allowed assistive'); } };
      const result = checkAccessibility(deps);
      expect(result.ok).toBe(true);
      expect(result.granted).toBe(false);
    });

    it('execSync 拋出其他錯誤回傳 granted:false', () => {
      const deps = { execSync: () => { throw new Error('unknown error'); } };
      const result = checkAccessibility(deps);
      expect(result.ok).toBe(true);
      expect(result.granted).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mouse.js
// ─────────────────────────────────────────────────────────────────────────────
const {
  click,
  doubleClick,
  rightClick,
  moveTo,
  drag,
  scroll,
  getPosition,
  checkCliclick,
} = await import(join(homedir(), '.claude/scripts/os/mouse.js'));

describe('mouse.js', () => {
  describe('平台守衛', () => {
    it('非 darwin 平台回傳 UNSUPPORTED_PLATFORM', () => {
      const origPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      const result = click(0, 0, {});
      Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    });
  });

  describe('click()', () => {
    it('正常座標產生 cliclick c: 指令', () => {
      let captured = '';
      const deps = { execSync: (cmd) => { captured = cmd; return ''; } };
      const result = click(100, 200, deps);
      expect(result.ok).toBe(true);
      expect(captured).toBe('cliclick c:100,200');
    });

    it('負 X 座標回傳 INVALID_ARGUMENT', () => {
      const result = click(-1, 0, {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });

    it('負 Y 座標回傳 INVALID_ARGUMENT', () => {
      const result = click(0, -1, {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });

    it('cliclick 未安裝回傳 DEPENDENCY_MISSING', () => {
      const deps = { execSync: () => { throw new Error('command not found: cliclick'); } };
      const result = click(100, 200, deps);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('DEPENDENCY_MISSING');
      expect(result.message).toContain('brew install cliclick');
    });

    it('其他 execSync 錯誤回傳 COMMAND_FAILED', () => {
      const deps = { execSync: () => { throw new Error('something else'); } };
      const result = click(100, 200, deps);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('COMMAND_FAILED');
    });
  });

  describe('doubleClick()', () => {
    it('產生 cliclick dc: 指令', () => {
      let captured = '';
      const deps = { execSync: (cmd) => { captured = cmd; return ''; } };
      const result = doubleClick(50, 60, deps);
      expect(result.ok).toBe(true);
      expect(captured).toBe('cliclick dc:50,60');
    });

    it('負座標回傳 INVALID_ARGUMENT', () => {
      const result = doubleClick(-10, 20, {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });
  });

  describe('rightClick()', () => {
    it('產生 cliclick rc: 指令', () => {
      let captured = '';
      const deps = { execSync: (cmd) => { captured = cmd; return ''; } };
      const result = rightClick(300, 400, deps);
      expect(result.ok).toBe(true);
      expect(captured).toBe('cliclick rc:300,400');
    });
  });

  describe('moveTo()', () => {
    it('產生 cliclick m: 指令', () => {
      let captured = '';
      const deps = { execSync: (cmd) => { captured = cmd; return ''; } };
      const result = moveTo(150, 250, deps);
      expect(result.ok).toBe(true);
      expect(captured).toBe('cliclick m:150,250');
    });
  });

  describe('drag()', () => {
    it('產生 cliclick dd: du: 指令', () => {
      let captured = '';
      const deps = { execSync: (cmd) => { captured = cmd; return ''; } };
      const result = drag(0, 0, 100, 100, deps);
      expect(result.ok).toBe(true);
      expect(captured).toBe('cliclick dd:0,0 du:100,100');
    });

    it('起點負座標回傳 INVALID_ARGUMENT', () => {
      const result = drag(-1, 0, 100, 100, {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });

    it('終點負座標回傳 INVALID_ARGUMENT', () => {
      const result = drag(0, 0, -1, 100, {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });
  });

  describe('scroll()', () => {
    it('正 amount 產生向上 t: 指令', () => {
      let captured = '';
      const deps = { execSync: (cmd) => { captured = cmd; return ''; } };
      const result = scroll(200, 300, 3, deps);
      expect(result.ok).toBe(true);
      expect(captured).toContain('t:200,300:3');
    });

    it('負 amount 產生向下 T: 指令', () => {
      let captured = '';
      const deps = { execSync: (cmd) => { captured = cmd; return ''; } };
      const result = scroll(200, 300, -2, deps);
      expect(result.ok).toBe(true);
      expect(captured).toContain('T:200,300:2');
    });

    it('amount 非數字回傳 INVALID_ARGUMENT', () => {
      const result = scroll(0, 0, NaN, {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });
  });

  describe('getPosition()', () => {
    it('解析 cliclick p 輸出 "123,456"', () => {
      const deps = { execSync: () => '123,456' };
      const result = getPosition(deps);
      expect(result.ok).toBe(true);
      expect(result.x).toBe(123);
      expect(result.y).toBe(456);
    });

    it('輸出格式錯誤回傳 PARSE_ERROR', () => {
      const deps = { execSync: () => 'invalid output' };
      const result = getPosition(deps);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('PARSE_ERROR');
    });

    it('cliclick 未安裝回傳 DEPENDENCY_MISSING', () => {
      const deps = { execSync: () => { throw new Error('not found'); } };
      const result = getPosition(deps);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('DEPENDENCY_MISSING');
    });
  });

  describe('checkCliclick()', () => {
    it('cliclick 存在回傳 installed:true 和路徑', () => {
      const deps = { execSync: () => '/usr/local/bin/cliclick\n' };
      const result = checkCliclick(deps);
      expect(result.ok).toBe(true);
      expect(result.installed).toBe(true);
      expect(result.path).toBe('/usr/local/bin/cliclick');
    });

    it('cliclick 未安裝回傳 DEPENDENCY_MISSING 和安裝指引', () => {
      const deps = { execSync: () => { throw new Error('not found'); } };
      const result = checkCliclick(deps);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('DEPENDENCY_MISSING');
      expect(result.install).toContain('brew install cliclick');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applescript.js
// ─────────────────────────────────────────────────────────────────────────────
const {
  run,
  runFile,
  runJXA,
  runWithTimeout,
} = await import(join(homedir(), '.claude/scripts/os/applescript.js'));

describe('applescript.js', () => {
  describe('平台守衛', () => {
    it('非 darwin 平台回傳 UNSUPPORTED_PLATFORM', () => {
      const origPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      const result = run('display dialog "hello"', {});
      Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    });
  });

  describe('run()', () => {
    it('成功執行回傳 ok:true 和 result', () => {
      const deps = { execSync: () => 'hello\n' };
      const result = run('return "hello"', deps);
      expect(result.ok).toBe(true);
      expect(result.result).toBe('hello');
    });

    it('結果去除尾部空白', () => {
      const deps = { execSync: () => '  world  \n' };
      const result = run('return "world"', deps);
      expect(result.result).toBe('world');
    });

    it('script 為空字串回傳 INVALID_ARGUMENT', () => {
      const result = run('', {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });

    it('script 為 undefined 回傳 INVALID_ARGUMENT', () => {
      const result = run(undefined, {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });

    it('語法錯誤回傳 SCRIPT_ERROR', () => {
      const deps = { execSync: () => { throw new Error('syntax error: Expected end of script'); } };
      const result = run('invalid @@@ script', deps);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('SCRIPT_ERROR');
    });

    it('execSync 使用 stdin 傳遞腳本（不做 shell 注入）', () => {
      let capturedOptions;
      const deps = { execSync: (cmd, opts) => { capturedOptions = opts; return ''; } };
      run('return 1', deps);
      expect(capturedOptions.input).toBe('return 1');
    });
  });

  describe('runFile()', () => {
    it('執行檔案指令包含路徑', () => {
      let capturedArgs = [];
      const deps = { execFileSync: (cmd, args) => { capturedArgs = [cmd, ...args]; return 'ok'; } };
      const result = runFile('/tmp/test.applescript', deps);
      expect(result.ok).toBe(true);
      expect(capturedArgs[0]).toBe('osascript');
      expect(capturedArgs[1]).toBe('/tmp/test.applescript');
    });

    it('filePath 為空回傳 INVALID_ARGUMENT', () => {
      const result = runFile('', {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });

    it('檔案不存在回傳 FILE_NOT_FOUND', () => {
      const deps = { execFileSync: () => { throw new Error('No such file or directory'); } };
      const result = runFile('/nonexistent.applescript', deps);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('FILE_NOT_FOUND');
    });
  });

  describe('runJXA()', () => {
    it('執行 JXA 指令包含 -l JavaScript', () => {
      let captured = '';
      const deps = { execSync: (cmd) => { captured = cmd; return 'result'; } };
      const result = runJXA('Application("Finder").name()', deps);
      expect(result.ok).toBe(true);
      expect(captured).toContain('-l JavaScript');
    });

    it('script 為空回傳 INVALID_ARGUMENT', () => {
      const result = runJXA('', {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });

    it('JXA stdin 傳遞腳本', () => {
      let capturedOpts;
      const deps = { execSync: (cmd, opts) => { capturedOpts = opts; return ''; } };
      runJXA('var app = Application.currentApplication()', deps);
      expect(capturedOpts.input).toContain('Application');
    });

    it('語法錯誤回傳 SCRIPT_ERROR', () => {
      const deps = { execSync: () => { throw new Error('SyntaxError: Unexpected token'); } };
      const result = runJXA('!!!invalid', deps);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('SCRIPT_ERROR');
    });
  });

  describe('runWithTimeout()', () => {
    it('成功執行回傳 ok:true', () => {
      const deps = { execSync: () => 'done' };
      const result = runWithTimeout('return 1', 5000, deps);
      expect(result.ok).toBe(true);
      expect(result.result).toBe('done');
    });

    it('ETIMEDOUT 錯誤回傳 TIMEOUT', () => {
      const err = new Error('ETIMEDOUT');
      err.code = 'ETIMEDOUT';
      const deps = { execSync: () => { throw err; } };
      const result = runWithTimeout('delay 100', 100, deps);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('TIMEOUT');
    });

    it('timeout message 包含毫秒數', () => {
      const err = new Error('ETIMEDOUT');
      err.code = 'ETIMEDOUT';
      const deps = { execSync: () => { throw err; } };
      const result = runWithTimeout('delay 100', 200, deps);
      expect(result.message).toContain('200ms');
    });

    it('timeoutMs 為 0 回傳 INVALID_ARGUMENT', () => {
      const result = runWithTimeout('return 1', 0, {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });

    it('timeoutMs 為負數回傳 INVALID_ARGUMENT', () => {
      const result = runWithTimeout('return 1', -100, {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
    });

    it('execSync 使用指定的 timeout', () => {
      let capturedOpts;
      const deps = { execSync: (cmd, opts) => { capturedOpts = opts; return ''; } };
      runWithTimeout('return 1', 7777, deps);
      expect(capturedOpts.timeout).toBe(7777);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computer-use.js
// ─────────────────────────────────────────────────────────────────────────────
const {
  parseAction,
  executeAction,
} = await import(join(homedir(), '.claude/scripts/os/computer-use.js'));

describe('computer-use.js', () => {
  describe('平台守衛', () => {
    it('非 darwin 平台回傳 UNSUPPORTED_PLATFORM', async () => {
      const origPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      const result = await executeAction('do something', {}, {});
      Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    });
  });

  describe('parseAction()', () => {
    it('解析純 JSON click 動作', () => {
      const action = parseAction('{"type":"click","x":100,"y":200}');
      expect(action).toEqual({ type: 'click', x: 100, y: 200 });
    });

    it('解析純 JSON type 動作', () => {
      const action = parseAction('{"type":"type","text":"hello"}');
      expect(action).toEqual({ type: 'type', text: 'hello' });
    });

    it('解析純 JSON key 動作', () => {
      const action = parseAction('{"type":"key","key":"return","modifiers":[]}');
      expect(action).toEqual({ type: 'key', key: 'return', modifiers: [] });
    });

    it('解析純 JSON done 動作', () => {
      const action = parseAction('{"type":"done","result":"Task completed"}');
      expect(action).toEqual({ type: 'done', result: 'Task completed' });
    });

    it('從 ```json ... ``` 提取 JSON', () => {
      const output = 'Sure!\n```json\n{"type":"click","x":50,"y":60}\n```';
      const action = parseAction(output);
      expect(action).toEqual({ type: 'click', x: 50, y: 60 });
    });

    it('從 ``` ... ``` 提取 JSON（無語言標記）', () => {
      const output = '```\n{"type":"type","text":"test"}\n```';
      const action = parseAction(output);
      expect(action).toEqual({ type: 'type', text: 'test' });
    });

    it('從文字中提取第一個 JSON 區塊', () => {
      const output = 'I will click here: {"type":"click","x":10,"y":20} done.';
      const action = parseAction(output);
      expect(action).not.toBeNull();
      expect(action?.type).toBe('click');
    });

    it('null 回傳 null', () => {
      expect(parseAction(null)).toBeNull();
    });

    it('空字串回傳 null', () => {
      expect(parseAction('')).toBeNull();
    });

    it('無效 JSON 回傳 null', () => {
      expect(parseAction('not json at all')).toBeNull();
    });

    it('JSON 無 type 欄位回傳 null', () => {
      expect(parseAction('{"x":100,"y":200}')).toBeNull();
    });
  });

  describe('executeAction()', () => {
    it('instruction 為空回傳 INVALID_ARGUMENT', async () => {
      const result = await executeAction('', {}, {});
      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_ARGUMENT');
      expect(result.rounds).toBe(0);
    });

    it('第一輪截圖失敗立即回傳錯誤', async () => {
      const deps = {
        captureScreen: () => ({ ok: false, error: 'COMMAND_FAILED', message: 'screencapture failed' }),
        askLocalModel: async () => null,
        click: () => ({ ok: true }),
        typeText: () => ({ ok: true }),
        pressKey: () => ({ ok: true }),
        sleep: async () => {},
      };
      const result = await executeAction('click the button', {}, deps);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('COMMAND_FAILED');
      expect(result.rounds).toBe(0);
    });

    it('模型回傳 done 立即結束', async () => {
      const deps = {
        captureScreen: () => ({ ok: true, path: '/tmp/test.png', size: 1000 }),
        askLocalModel: async () => ({ type: 'done', result: 'Button clicked' }),
        click: () => ({ ok: true }),
        typeText: () => ({ ok: true }),
        pressKey: () => ({ ok: true }),
        sleep: async () => {},
      };
      const result = await executeAction('click the button', {}, deps);
      expect(result.ok).toBe(true);
      expect(result.rounds).toBe(1);
      expect(result.result).toBe('Button clicked');
    });

    it('模型回傳 click 動作並呼叫 click()', async () => {
      let clickCalled = false;
      let clickArgs = null;
      const actions = [
        { type: 'click', x: 100, y: 200 },
        { type: 'done', result: 'done' },
      ];
      let round = 0;
      const deps = {
        captureScreen: () => ({ ok: true, path: '/tmp/test.png', size: 1000 }),
        askLocalModel: async () => actions[round++],
        click: (x, y) => { clickCalled = true; clickArgs = { x, y }; return { ok: true }; },
        typeText: () => ({ ok: true }),
        pressKey: () => ({ ok: true }),
        sleep: async () => {},
      };
      const result = await executeAction('click 100,200', {}, deps);
      expect(result.ok).toBe(true);
      expect(clickCalled).toBe(true);
      expect(clickArgs).toEqual({ x: 100, y: 200 });
    });

    it('模型回傳 type 動作並呼叫 typeText()', async () => {
      let typeTextCalled = false;
      let typeTextArg = null;
      const actions = [
        { type: 'type', text: 'hello' },
        { type: 'done', result: 'done' },
      ];
      let round = 0;
      const deps = {
        captureScreen: () => ({ ok: true, path: '/tmp/test.png', size: 1000 }),
        askLocalModel: async () => actions[round++],
        click: () => ({ ok: true }),
        typeText: (text) => { typeTextCalled = true; typeTextArg = text; return { ok: true }; },
        pressKey: () => ({ ok: true }),
        sleep: async () => {},
      };
      const result = await executeAction('type hello', {}, deps);
      expect(result.ok).toBe(true);
      expect(typeTextCalled).toBe(true);
      expect(typeTextArg).toBe('hello');
    });

    it('模型回傳 key 動作並呼叫 pressKey()', async () => {
      let pressKeyCalled = false;
      let pressKeyArgs = null;
      const actions = [
        { type: 'key', key: 'return', modifiers: ['command'] },
        { type: 'done', result: 'done' },
      ];
      let round = 0;
      const deps = {
        captureScreen: () => ({ ok: true, path: '/tmp/test.png', size: 1000 }),
        askLocalModel: async () => actions[round++],
        click: () => ({ ok: true }),
        typeText: () => ({ ok: true }),
        pressKey: (key, mods) => { pressKeyCalled = true; pressKeyArgs = { key, mods }; return { ok: true }; },
        sleep: async () => {},
      };
      const result = await executeAction('press enter', {}, deps);
      expect(result.ok).toBe(true);
      expect(pressKeyCalled).toBe(true);
      expect(pressKeyArgs.key).toBe('return');
      expect(pressKeyArgs.mods).toEqual(['command']);
    });

    it('超過 maxRounds 回傳 MAX_ROUNDS_EXCEEDED', async () => {
      const deps = {
        captureScreen: () => ({ ok: true, path: '/tmp/test.png', size: 1000 }),
        askLocalModel: async () => ({ type: 'click', x: 0, y: 0 }),
        click: () => ({ ok: true }),
        typeText: () => ({ ok: true }),
        pressKey: () => ({ ok: true }),
        sleep: async () => {},
      };
      const result = await executeAction('infinite loop', { maxRounds: 3 }, deps);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('MAX_ROUNDS_EXCEEDED');
      expect(result.rounds).toBe(3);
    });

    it('模型回傳 null 視為完成安全退出', async () => {
      const deps = {
        captureScreen: () => ({ ok: true, path: '/tmp/test.png', size: 1000 }),
        askLocalModel: async () => null,
        click: () => ({ ok: true }),
        typeText: () => ({ ok: true }),
        pressKey: () => ({ ok: true }),
        sleep: async () => {},
      };
      const result = await executeAction('do task', {}, deps);
      expect(result.ok).toBe(true);
      expect(result.rounds).toBe(1);
    });

    it('操作函式失敗時中止迴圈', async () => {
      const deps = {
        captureScreen: () => ({ ok: true, path: '/tmp/test.png', size: 1000 }),
        askLocalModel: async () => ({ type: 'click', x: 100, y: 200 }),
        click: () => ({ ok: false, error: 'DEPENDENCY_MISSING', message: 'cliclick not found' }),
        typeText: () => ({ ok: true }),
        pressKey: () => ({ ok: true }),
        sleep: async () => {},
      };
      const result = await executeAction('click button', {}, deps);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('DEPENDENCY_MISSING');
    });

    it('未知動作類型回傳 UNKNOWN_ACTION', async () => {
      const deps = {
        captureScreen: () => ({ ok: true, path: '/tmp/test.png', size: 1000 }),
        askLocalModel: async () => ({ type: 'scroll', x: 0, y: 0 }),
        click: () => ({ ok: true }),
        typeText: () => ({ ok: true }),
        pressKey: () => ({ ok: true }),
        sleep: async () => {},
      };
      const result = await executeAction('scroll down', {}, deps);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('UNKNOWN_ACTION');
    });

    it('sleep 在每輪之間被呼叫', async () => {
      let sleepCount = 0;
      const actions = [
        { type: 'click', x: 0, y: 0 },
        { type: 'click', x: 0, y: 0 },
        { type: 'done', result: 'done' },
      ];
      let round = 0;
      const deps = {
        captureScreen: () => ({ ok: true, path: '/tmp/test.png', size: 1000 }),
        askLocalModel: async () => actions[round++],
        click: () => ({ ok: true }),
        typeText: () => ({ ok: true }),
        pressKey: () => ({ ok: true }),
        sleep: async () => { sleepCount++; },
      };
      const result = await executeAction('multi-step', { maxRounds: 5 }, deps);
      expect(result.ok).toBe(true);
      expect(sleepCount).toBe(2); // 兩次 click 後 sleep，done 不 sleep
    });
  });
});
