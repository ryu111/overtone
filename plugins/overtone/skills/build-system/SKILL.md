---
name: build-system
description: 構建系統除錯：TypeScript strict mode 錯誤修復指南、npm/bun 依賴管理策略。
user-invocable: false
disable-model-invocation: true
---

# Build System 知識域

> 來源：TypeScript 官方文件 + npm/bun 依賴管理最佳實踐

## 消費者

| Agent | 用途 |
|-------|------|
| build-error-resolver | 修復 TypeScript 型別錯誤時查詢修復模式；解決依賴衝突時查詢管理策略 |

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/build-system/references/typescript-errors.md` | TypeScript strict mode 錯誤查表：錯誤訊息 → 修復方式 lookup table |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/build-system/references/dependency-management.md` | npm/yarn/bun 依賴解析、semver 語意、peer dependency 衝突解決 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/build-system/examples/ts-error-fix.md` | TypeScript 錯誤修復範例（nullable、型別不符、generic constraint）|
