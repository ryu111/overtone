# ADR 模板（MADR 4.0 格式）

> ADR = Architecture Decision Record，記錄重要技術決策及其背景

## MADR 標準模板

```markdown
# [ADR 編號]. [決策標題]

**狀態**：[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]
**日期**：YYYY-MM-DD
**決策者**：[負責人姓名/角色]

## 背景與問題陳述

[描述決策的背景。說明為什麼需要做這個決策，目前遇到的問題或需求是什麼。]

## 考慮的方案

### 方案 A：[方案名稱]

[簡短描述]

**優點**：
- [優點 1]
- [優點 2]

**缺點**：
- [缺點 1]
- [缺點 2]

### 方案 B：[方案名稱]

[簡短描述]

**優點**：
- [優點 1]

**缺點**：
- [缺點 1]

## 決策

**選擇方案 A**，因為 [主要理由，聚焦在 context 中最重要的考量]。

## 結果

**正面影響**：
- [期望達成的效果]

**負面影響**：
- [需要接受的代價]
- [後續需要處理的事項]

## 實作注意事項

[選填：具體實作的注意事項或限制]
```

---

## Y-Statement 格式（快速決策）

適用於較小的決策，一句話格式：

```
In the context of [情境],
facing [問題/需求],
we decided to [決策],
to achieve [目標],
accepting [代價/限制].
```

### 範例

```
In the context of session 狀態儲存,
facing 多 session 並行讀寫的需求,
we decided to use JSONL append-only files,
to achieve 簡單可靠的狀態追蹤無需資料庫,
accepting 需要定期壓縮 + 無法跨 session 查詢.
```

---

## ADR 使用指南

### 何時寫 ADR

```
必須寫：
  □ 技術架構選擇（框架、資料庫、通訊協定）
  □ 會影響多個模組的設計決策
  □ 有多個可行方案且 tradeoff 不明顯
  □ 未來可能被質疑「為什麼這樣做」的決策

不需要寫：
  □ 實作細節（只有一種做法）
  □ Bug 修復
  □ 臨時性決策
```

### ADR 狀態流轉

```
Proposed → [討論中]
    ↓
Accepted → [已實施]
    ↓
Deprecated → [已棄用，但不被取代]
  或
Superseded by ADR-XXX → [被新 ADR 取代]
```

### ADR 編號規則

```
ADR-001: 第一個決策
ADR-002: 第二個決策
...

命名格式：docs/decisions/ADR-NNN-[brief-title].md
範例：docs/decisions/ADR-001-use-bun-as-runtime.md
```

---

## 常見反模式

| 反模式 | 說明 | 改善方式 |
|--------|------|----------|
| 只記結果不記過程 | 只寫「我們選 A」，沒有背景和其他選項 | 一定要記錄拒絕的方案 |
| 過早具體化 | 在決策還不穩定時就寫詳細文件 | 先用 Proposed，討論後再 Accept |
| 不更新狀態 | 決策被推翻了但 ADR 還是 Accepted | 立即更新為 Deprecated/Superseded |
| 太過技術細節 | ADR 變成實作文件 | ADR 聚焦「為什麼」，實作文件說「怎麼做」 |
