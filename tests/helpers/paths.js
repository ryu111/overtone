// tests/helpers/paths.js
// 集中管理所有測試檔案所需的路徑常數。
// 使用 __dirname 計算絕對路徑，確保在任何工作目錄下呼叫結果一致。

const { join } = require('path');

// 專案根目錄（overtone/）
const PROJECT_ROOT = join(__dirname, '..', '..');

// Plugin 根目錄（plugins/overtone/）
const PLUGIN_ROOT = join(PROJECT_ROOT, 'plugins', 'overtone');

// 核心函式庫目錄（plugins/overtone/scripts/lib/）
const SCRIPTS_LIB = join(PLUGIN_ROOT, 'scripts', 'lib');

// Scripts 目錄（plugins/overtone/scripts/）
const SCRIPTS_DIR = join(PLUGIN_ROOT, 'scripts');

// Hooks 腳本目錄（plugins/overtone/hooks/scripts/）
const HOOKS_DIR = join(PLUGIN_ROOT, 'hooks', 'scripts');

module.exports = { PROJECT_ROOT, PLUGIN_ROOT, SCRIPTS_LIB, SCRIPTS_DIR, HOOKS_DIR };
