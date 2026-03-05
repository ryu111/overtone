'use strict';
// 測試環境全域設定 — 靜默非必要警告
process.env.OVERTONE_QUIET = '1';
// 標記測試環境，防止 failure-tracker 等寫入真實全域 store（子進程會繼承此環境變數）
process.env.OVERTONE_TEST = '1';
