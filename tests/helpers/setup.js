'use strict';
// 測試環境全域設定 — 靜默非必要警告
process.env.NOVA_QUIET = '1';
// 標記測試環境，防止 failure-tracker 等寫入真實全域 store（子進程會繼承此環境變數）
process.env.NOVA_TEST = '1';
