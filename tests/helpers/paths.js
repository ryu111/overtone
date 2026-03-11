// tests/helpers/paths.js
// 集中管理所有測試檔案所需的路徑常數。
// 使用 __dirname 計算絕對路徑，確保在任何工作目錄下呼叫結果一致。

const { join } = require('path');
const { homedir } = require('os');

// 專案根目錄（overtone/）
const PROJECT_ROOT = join(__dirname, '..', '..');

// Plugin 根目錄
// 優先使用環境變數（支援 CI 和全域安裝場景），fallback 到 homedir()/.claude
const PLUGIN_ROOT = process.env.NOVA_PLUGIN_ROOT || join(homedir(), '.claude');

// 核心函式庫目錄（{PLUGIN_ROOT}/scripts/lib/）
const SCRIPTS_LIB = join(PLUGIN_ROOT, 'scripts', 'lib');

// Scripts 目錄（{PLUGIN_ROOT}/scripts/）
const SCRIPTS_DIR = join(PLUGIN_ROOT, 'scripts');

// Hooks 腳本目錄（{PLUGIN_ROOT}/hooks/scripts/）
const HOOKS_DIR = join(PLUGIN_ROOT, 'hooks', 'scripts');

module.exports = { PROJECT_ROOT, PLUGIN_ROOT, SCRIPTS_LIB, SCRIPTS_DIR, HOOKS_DIR };
