# SOLID 設計原則

> 來源：Robert C. Martin + JavaScript 實踐

## 總覽

| 原則 | 全名 | 一句話 |
|------|------|--------|
| **S** | Single Responsibility | 一個模組只有一個改變的理由 |
| **O** | Open/Closed | 對擴展開放，對修改封閉 |
| **L** | Liskov Substitution | 子類能無縫替換父類 |
| **I** | Interface Segregation | 不強迫依賴不需要的介面 |
| **D** | Dependency Inversion | 高層不依賴低層，兩者都依賴抽象 |

---

## S — Single Responsibility Principle

**違反徵兆**：
- 一個檔案 > 300 行
- 類別名稱含 `And`（UserAndOrderManager）
- 改一個功能要動好幾個不相關的方法

```javascript
// ❌ 違反 SRP
class UserService {
  createUser(data) { /* ... */ }
  sendWelcomeEmail(user) { /* ... */ }  // 寄信不是 user 的職責
  generateReport(users) { /* ... */ }    // 報表不是 user 的職責
}

// ✅ 遵守 SRP
class UserService { createUser(data) { /* ... */ } }
class EmailService { sendWelcome(user) { /* ... */ } }
class ReportService { generate(users) { /* ... */ } }
```

## O — Open/Closed Principle

**違反徵兆**：
- 新增功能需要修改現有 switch/if-else
- 核心模組頻繁因為新需求被修改

```javascript
// ❌ 違反 OCP — 每加一種格式要改這個函式
function exportData(data, format) {
  if (format === 'json') return JSON.stringify(data);
  if (format === 'csv') return toCSV(data);
  if (format === 'xml') return toXML(data); // 新加的
}

// ✅ 遵守 OCP — 新格式只需要新增 exporter
const exporters = { json: jsonExport, csv: csvExport };
function exportData(data, format) {
  const exporter = exporters[format];
  if (!exporter) throw new Error(`Unknown format: ${format}`);
  return exporter(data);
}
// 擴展：exporters.xml = xmlExport; （不改原始碼）
```

## L — Liskov Substitution Principle

**違反徵兆**：
- 子類覆寫方法後拋出 `NotImplementedError`
- 使用 `instanceof` 檢查來決定行為
- 子類改變了父類方法的語意

**JavaScript 適用場景**：主要體現在 interface contract — 當函式接受某類型時，所有該類型的變體都應該可以無縫使用。

## I — Interface Segregation Principle

**違反徵兆**：
- 實作一個介面但有些方法是空的
- 模組依賴了它不用的函式

```javascript
// ❌ 違反 ISP — 強迫所有 store 實作 search
class Store {
  get(id) { /* ... */ }
  set(id, value) { /* ... */ }
  search(query) { /* ... */ }  // 有些 store 不支援搜尋
}

// ✅ 遵守 ISP — 分離介面
// Readable: { get(id) }
// Writable: { set(id, value) }
// Searchable: { search(query) }
// 每個 store 只實作它支援的
```

## D — Dependency Inversion Principle

**違反徵兆**：
- 高層模組直接 `require` 低層模組
- 換資料庫/換 HTTP client 要改業務邏輯
- 測試時無法 mock 依賴

```javascript
// ❌ 違反 DIP — 業務邏輯直接依賴具體實作
const { readFileSync } = require('fs');
function loadConfig() {
  return JSON.parse(readFileSync('config.json', 'utf8'));
}

// ✅ 遵守 DIP — 注入依賴（Overtone 的 getDepsOverride 模式）
function loadConfig(deps = { readFile: readFileSync }) {
  return JSON.parse(deps.readFile('config.json', 'utf8'));
}
```

---

## 實戰判斷

不要教條式套用 SOLID——**只在出現違反徵兆時重構**：

| 情況 | 動作 |
|------|------|
| 程式碼簡單、只用一次 | 不需要 SOLID，保持簡單 |
| 出現違反徵兆（見上方） | 針對性重構 |
| 設計新模組、預期會擴展 | 從一開始就遵守 OCP/DIP |
