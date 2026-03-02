---
name: wording
description: 措詞正確性知識域：emoji-關鍵詞強度對照（⛔/📋/💡/🔧）、決策樹、反模式偵測規則。
disable-model-invocation: true
user-invocable: false
---

# Wording 知識域

> 來源：Overtone 指令強度用詞規範（`~/.claude/CLAUDE.md`「指令強度用詞」章節）

## 消費者

| Agent | 用途 |
|-------|------|
| developer | 撰寫 agent prompt 和規則文件時，確保 emoji 與關鍵詞強度一致 |
| doc-updater | 更新文件時檢查指令強度措詞，避免引入不匹配的 emoji-關鍵詞 |
| tester | 撰寫測試規格和 BDD 文件時，正確使用強度標記 |
| planner | 撰寫計劃文件和任務規格時，正確標記必要步驟與建議事項 |
| architect | 撰寫設計文件時，正確區分強制要求和最佳實踐 |
| retrospective | 撰寫回顧報告和建議時，確保措詞強度與實際約束力一致 |
| product-manager | 撰寫產品文件和需求規格時，正確使用強度層級 |

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/wording/references/wording-guide.md` | 完整措詞指南：強度對照表、決策樹、反模式 7 種、場景範例庫 |

## 設計說明

Wording skill 與 PostToolUse hook 形成雙保險：
- **此 skill（事前預防）**：agent 在產出文件前即知道正確的措詞規則
- **PostToolUse hook（事後守衛）**：agent 寫入 `.md` 後，hook 自動偵測並警告不匹配的 emoji-關鍵詞組合