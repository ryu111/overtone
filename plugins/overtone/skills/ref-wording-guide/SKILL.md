---
name: ref-wording-guide
description: 措詞強度快速參考：四層級對照表（⛔/📋/💡/🔧）和決策樹核心路徑。
disable-model-invocation: true
user-invocable: false
---

# 措詞強度快速參考

## 四層級對照表

| 層級 | 符號 | 允許關鍵字 | 場景 |
|:----:|:----:|------------|------|
| 硬阻擋 | `⛔` | `NEVER`、`MUST NOT`、`不可`、`禁止` | 安全紅線 |
| 強規則 | `📋` | `MUST`、`ALWAYS`、`必須` | 核心流程 |
| 軟引導 | `💡` | `should`、`prefer`、`建議` | 最佳實踐 |
| 建議 | `🔧` | `consider`、`may`、`可考慮` | 可選優化 |

## 決策樹

```
有 Hook 程式碼強制執行？→ 是 → ⛔ NEVER
違反會造成安全或資料損失？→ 是 → ⛔ NEVER
流程必要步驟，無彈性空間？→ 是 → 📋 MUST
最佳實踐，可根據情境調整？→ 是 → 💡 should
否則 → 🔧 consider
```

## 常見反模式

- `💡 MUST`：矛盾 → 改 `📋 MUST` 或 `💡 should`
- `📋 consider`：矛盾 → 改 `🔧 consider` 或 `📋 MUST`
- `⛔ should`：矛盾 → 改 `💡 should` 或 `⛔ NEVER`
