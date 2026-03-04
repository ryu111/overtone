---
name: verify
description: 統一 6 階段驗證。依序執行 Build → Types → Lint → Tests → Security → Diff 完整品質檢查。
disable-model-invocation: true
---

# Verify 知識域

> 程式碼驗證策略與語言別命令索引

## 消費者

此 Skill 為 utility，用於驗證程式碼變更的正確性。

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/verify/references/language-commands.md` | 語言別驗證命令索引（Bun/Node/Python/Go/Rust）|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/verify/references/verification-strategies.md` | 驗證策略決策樹：syntax → unit → integration → e2e + 降級策略 |