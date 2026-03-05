---
name: craft
description: 軟體工藝知識域：Clean Code 原則、SOLID 設計原則、程式碼層級設計模式、重構手法目錄、函數式程式設計模式。
disable-model-invocation: true
user-invocable: false
---

# Craft 知識域（Software Craftsmanship）

> 來源：Robert C. Martin Clean Code + Martin Fowler Refactoring + GoF Design Patterns + FP Best Practices

## 消費者

| Agent | 用途 |
|-------|------|
| developer | 寫碼時遵循 clean code 原則、選用適當設計模式、執行重構 |
| code-reviewer | 審查程式碼品質時識別違反 SOLID 的徵兆、建議重構手法 |
| architect | 設計階段選擇程式碼層級模式（Strategy/Observer/Factory）|

## 決策樹：何時查閱哪個參考？

```
問題類型
  │
  ├── 命名/函式/註解/格式問題 → clean-code-rules.md
  ├── 類別/模組職責不清 → solid-principles.md
  ├── 需要可替換/可擴展的行為 → code-level-patterns.md
  ├── 程式碼有壞味道要改善 → refactoring-catalog.md
  ├── 需要無副作用/可組合/不可變 → functional-patterns.md
  └── Overtone 元件設計/審查/回顧 → overtone-principles.md
```

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/craft/references/clean-code-rules.md` | 命名、函式、註解、格式、錯誤處理的 clean code 原則 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/craft/references/solid-principles.md` | SOLID 五原則 + 違反徵兆 + JavaScript 範例 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/craft/references/code-level-patterns.md` | 程式碼層級設計模式決策樹（Strategy/Observer/Factory/Decorator）|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/craft/references/refactoring-catalog.md` | 重構手法速查（壞味道 → 對應重構 → 前後對比）|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/craft/references/functional-patterns.md` | FP 核心模式：pure function、composition、immutability、pattern matching |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/craft/references/overtone-principles.md` | Overtone 製作原則 Checklist（完全閉環 / 自動修復 / 補全能力 / 驗證品質三信號）|

## 跨域引用

審查架構層級設計模式（Event-Driven、Layered 等）時，應參考 architecture skill：

💡 架構模式：`${CLAUDE_PLUGIN_ROOT}/skills/architecture/references/architectural-patterns.md`

> 注意：此 skill 聚焦 **程式碼層級** 的模式與原則，架構層級模式保留於 architecture skill（SoT 原則）。