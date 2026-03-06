'use strict';
/**
 * tts.js — macOS TTS 能力
 *
 * 使用 macOS `say` 指令進行語音合成。
 * 僅支援 macOS（darwin），其他平台回傳 UNSUPPORTED_PLATFORM。
 * 不 throw — 所有錯誤以 { ok: false, error, message } 回傳。
 *
 * 依賴注入：最後一個參數 _deps = { execSync, spawn, platform } 供測試替換。
 *
 * CLI 入口：
 *   bun scripts/os/tts.js speak "文字" [--voice Alex] [--rate 200]
 *   bun scripts/os/tts.js speak-bg "文字" [--voice Alex] [--rate 200]
 *   bun scripts/os/tts.js list-voices
 */

const cp = require('child_process');

// ── 統一 response 建構工具 ──

function ok(fields) {
  return { ok: true, ...fields };
}

function fail(error, message) {
  return { ok: false, error, message };
}

/**
 * 語音朗讀（阻塞，等待完成）
 * @param {string} text - 朗讀文字（必填）
 * @param {object} [opts]
 * @param {string} [opts.voice]      - 語音名稱（預設系統語音）
 * @param {number} [opts.rate]       - 語速 wpm（預設 200）
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @param {string} [_deps.platform]
 * @returns {{ ok: true, voice: string, text: string }
 *           |{ ok: false, error: string, message: string }}
 */
function speak(text, opts = {}, _deps = {}) {
  const platform = _deps.platform !== undefined ? _deps.platform : process.platform;

  if (platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return fail('INVALID_ARGUMENT', '朗讀文字不可為空');
  }

  const execSync = _deps.execSync || cp.execSync;
  const args = _buildSayArgs(text, opts);

  try {
    execSync(`say ${args}`, { stdio: 'pipe' });
    return ok({ voice: opts.voice || 'system', text });
  } catch (err) {
    return fail('COMMAND_FAILED', `say 指令失敗：${err.message}`);
  }
}

/**
 * 語音朗讀（非阻塞，fire-and-forget）
 * 使用 spawn + detach，立即回傳不等待完成。
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.voice]
 * @param {number} [opts.rate]
 * @param {object} [_deps]
 * @param {Function} [_deps.spawn]
 * @param {string} [_deps.platform]
 * @returns {{ ok: true }|{ ok: false, error: string, message: string }}
 */
function speakBackground(text, opts = {}, _deps = {}) {
  const platform = _deps.platform !== undefined ? _deps.platform : process.platform;

  if (platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return fail('INVALID_ARGUMENT', '朗讀文字不可為空');
  }

  const spawnFn = _deps.spawn || cp.spawn;
  const sayArgs = _buildSayArgsArray(text, opts);

  try {
    const child = spawnFn('say', sayArgs, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return ok({});
  } catch (err) {
    return fail('COMMAND_FAILED', `say 指令啟動失敗：${err.message}`);
  }
}

/**
 * 列出可用語音
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @param {string} [_deps.platform]
 * @returns {{ ok: true, voices: Array<{ name: string, lang: string }> }
 *           |{ ok: false, error: string, message: string }}
 */
function listVoices(_deps = {}) {
  const platform = _deps.platform !== undefined ? _deps.platform : process.platform;

  if (platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  const execSync = _deps.execSync || cp.execSync;

  try {
    const output = execSync('say -v ?', { stdio: 'pipe', encoding: 'utf8' });
    const voices = _parseVoiceList(output || '');
    return ok({ voices });
  } catch (err) {
    return fail('COMMAND_FAILED', `列出語音失敗：${err.message}`);
  }
}

// ── 內部輔助函式 ──

/**
 * 組裝 say 指令參數字串（用於 execSync）
 */
function _buildSayArgs(text, opts) {
  const parts = [];
  if (opts.voice) parts.push(`-v "${opts.voice}"`);
  if (opts.rate) parts.push(`-r ${opts.rate}`);
  parts.push(`"${text.replace(/"/g, '\\"')}"`);
  return parts.join(' ');
}

/**
 * 組裝 say 指令參數陣列（用於 spawn）
 */
function _buildSayArgsArray(text, opts) {
  const args = [];
  if (opts.voice) {
    args.push('-v', opts.voice);
  }
  if (opts.rate) {
    args.push('-r', String(opts.rate));
  }
  args.push(text);
  return args;
}

/**
 * 解析 `say -v ?` 輸出為語音物件陣列
 * 格式：名稱   語言代碼   # 說明
 * 範例：Alex   en_US   # Most people recognize Alex
 */
function _parseVoiceList(output) {
  if (!output || output.trim() === '') return [];

  const voices = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 移除 # 後的說明，分割名稱和語言代碼
    const withoutComment = trimmed.replace(/#.*$/, '').trim();
    const parts = withoutComment.split(/\s+/);
    if (parts.length >= 2) {
      const name = parts[0];
      const lang = parts[1];
      if (name && lang) {
        voices.push({ name, lang });
      }
    }
  }
  return voices;
}

module.exports = { speak, speakBackground, listVoices };

// ── CLI 入口 ──

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  function parseCliOpts(argv) {
    const opts = {};
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--voice' && argv[i + 1]) {
        opts.voice = argv[++i];
      } else if (argv[i] === '--rate' && argv[i + 1]) {
        opts.rate = Number(argv[++i]);
      }
    }
    return opts;
  }

  if (command === 'speak') {
    const text = args[1] || '';
    const opts = parseCliOpts(args.slice(2));
    const result = speak(text, opts);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(result.ok ? 0 : 1);
  } else if (command === 'speak-bg') {
    const text = args[1] || '';
    const opts = parseCliOpts(args.slice(2));
    const result = speakBackground(text, opts);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(result.ok ? 0 : 1);
  } else if (command === 'list-voices') {
    const result = listVoices();
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(result.ok ? 0 : 1);
  } else {
    process.stderr.write('用法：bun scripts/os/tts.js <speak|speak-bg|list-voices> [文字] [--voice 語音] [--rate 語速]\n');
    process.exit(1);
  }
}
