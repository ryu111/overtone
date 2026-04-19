# [全自動] L1 heartbeat 模組瘦身至 300 行以內

## 動機（Why）

現狀：heartbeat.js 304 行，超過 hook 模組 300 行上限，judge 確定性評分扣 10 分（40/50）。根因：heartbeat 承擔 config 管理+任務執行+OS-control 多個職責。方案：提取 config 管理到獨立 helper，或內聯簡化 prompt 字串（~20 行可壓縮）。驗收：wc -l < 300 && bun test pass && judge-deterministic heartbeat 得 50 分

## 驗收條件

- [ ] <!-- 具體可驗證的條件 -->
