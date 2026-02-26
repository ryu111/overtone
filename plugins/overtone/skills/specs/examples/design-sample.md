# Design 格式樣板

> 📋 **何時讀取**：首次撰寫 design.md 或需要格式參考時。

---

## 技術摘要（What & Why）

說明選擇的技術方案和設計決策理由：

- **方案**：採用 {方案名稱}
- **理由**：選此方案而非其他的原因
- **取捨**：這個方案的限制和接受的理由

## API 介面設計

### 函式 / Endpoint

```typescript
// 函式簽名（TypeScript）
function {functionName}(input: {InputType}): Promise<{OutputType}>

// 或 HTTP Endpoint
// POST /api/{resource}
// Body: { field: string, ... }
// Response: { result: string, ... }
```

### 輸入型別

```typescript
interface {InputType} {
  field1: string        // 說明用途
  field2?: number       // 可選欄位
}
```

### 輸出型別

```typescript
interface {OutputType} {
  result: string
  metadata?: {
    createdAt: string
  }
}
```

### 錯誤處理

| 錯誤情況 | 錯誤碼 / 訊息 |
|---------|-------------|
| 輸入驗證失敗 | `INVALID_INPUT: {field} 不可為空` |
| 資源不存在 | `NOT_FOUND: {resource} 不存在` |

## 資料模型

```typescript
// 儲存格式（JSON / JSONL / DB schema）
interface {ModelName} {
  id: string            // UUID
  name: string
  status: 'active' | 'inactive'
  createdAt: string     // ISO 8601
}
```

儲存位置：`{path/to/storage}`
格式：JSON / JSONL / SQLite

## 檔案結構

```
修改的檔案：
  scripts/lib/{module}.js    ← 修改：新增 {functionName}
  scripts/{script}.js        ← 修改：呼叫新函式

新增的檔案：
  scripts/lib/{new-module}.js  ← 新增：{功能描述}
  tests/{feature}.test.ts      ← 新增：單元測試
```

## 關鍵技術決策

### 決策 1：{決策主題}

- **選項 A**（選擇）：{描述} — 優點：{優點}
- **選項 B**（未選）：{描述} — 原因：{為何不選}

### 決策 2：{決策主題}

- **選項 A**（選擇）：{描述} — 優點：{優點}
- **選項 B**（未選）：{描述} — 原因：{為何不選}

## 實作注意事項

給 developer 的提醒：

- 需要注意的邊界條件
- 必須遵循的現有 patterns（如 CAS 原子更新、JSONL append-only）
- 與其他模組的整合點
