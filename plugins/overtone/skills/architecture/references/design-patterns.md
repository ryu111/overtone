# 軟體設計模式決策樹

## 決策樹：我需要什麼模式？

```
問題類型
  │
  ├── 物件建立問題
  │     ├── 需要彈性建立複雜物件 → Builder
  │     ├── 只需要一個實例 → Singleton
  │     ├── 需要根據類型建立不同物件 → Factory Method
  │     ├── 需要建立一系列相關物件 → Abstract Factory
  │     └── 需要複製現有物件 → Prototype
  │
  ├── 結構組合問題
  │     ├── 需要統一單一物件和集合的介面 → Composite
  │     ├── 需要包裝物件增加功能 → Decorator
  │     ├── 需要簡化複雜子系統 → Facade
  │     ├── 需要轉換不相容的介面 → Adapter
  │     ├── 需要分離抽象和實作 → Bridge
  │     └── 需要節省記憶體（共享狀態）→ Flyweight
  │
  └── 行為互動問題
        ├── 需要定義可替換的演算法 → Strategy
        ├── 需要監聽物件狀態變化 → Observer
        ├── 需要串聯處理流程 → Chain of Responsibility
        ├── 需要封裝操作（支援 undo/redo）→ Command
        ├── 需要走訪集合不暴露實作 → Iterator
        ├── 需要在物件狀態改變時改變行為 → State
        ├── 需要定義演算法骨架，讓子類填入 → Template Method
        ├── 需要物件不直接溝通 → Mediator
        └── 需要減少子類數量（外部化狀態）→ Visitor
```

---

## 常用模式詳解（JavaScript/TypeScript）

### Strategy（策略）

```
適用場景：
  - 同一操作有多種算法
  - 需要在 runtime 切換行為
  - 避免大量 if/else 或 switch

範例：
  - 排序策略（bubble/quick/merge）
  - 驗證策略（email/phone/username）
  - 壓縮策略（gzip/brotli/deflate）

Tradeoff：
  ✅ 算法可獨立替換，符合 OCP
  ✅ 容易測試每個策略
  ❌ 增加類/函式數量
  ❌ 使用者需了解不同策略的差異

反模式警告：
  - 只有一種算法時不需要 Strategy
  - 不要把 Strategy 用於不同的「行為」（那是 Command）
```

### Observer（觀察者）

```
適用場景：
  - 物件狀態變化需通知多個物件
  - 發布者不需要知道訂閱者
  - 事件系統

範例：
  - DOM 事件系統
  - EventEmitter
  - Redux store 訂閱
  - SSE/WebSocket 推送

Tradeoff：
  ✅ 鬆耦合（發布者/訂閱者互不依賴）
  ✅ 動態增減訂閱者
  ❌ 訂閱者過多時效能問題
  ❌ 事件鏈追蹤困難（cascade 問題）
  ❌ 記憶體洩漏（未移除的訂閱者）

反模式警告：
  - 無限事件鏈（A → B → C → A）
  - 訂閱後不移除（記憶體洩漏）
```

### Factory Method（工廠方法）

```
適用場景：
  - 需要根據配置/類型建立不同物件
  - 子類決定建立哪種物件
  - 隔離物件建立邏輯

範例：
  - 根據 agent 類型建立不同 handler
  - 根據環境建立不同 logger
  - 根據格式建立不同 parser

Tradeoff：
  ✅ 建立邏輯集中，易於修改
  ✅ 符合 OCP（加新類型不改舊程式碼）
  ❌ 每種類型需要對應子類
  ❌ 類的數量可能爆炸

反模式警告：
  - 不要把所有 new 都包成 Factory
  - 簡單物件直接 new 就好
```

### Decorator（裝飾器）

```
適用場景：
  - 動態為物件增加功能
  - 不能或不想使用繼承
  - 功能可以獨立組合

範例：
  - Express middleware
  - React HOC
  - Logging wrapper
  - Cache wrapper

Tradeoff：
  ✅ 比繼承更靈活（可組合）
  ✅ 符合 SRP（每個 decorator 一個職責）
  ❌ 過多 decorator 層次難以 debug
  ❌ 執行順序很重要（可能造成混亂）
```

### Facade（外觀）

```
適用場景：
  - 簡化複雜子系統
  - 提供統一入口
  - 隔離依賴

範例：
  - SDK（包裝底層複雜 API）
  - Service layer（包裝 repository + validator + notifier）
  - Overtone 的 guard-system.js（統一守衛入口）

Tradeoff：
  ✅ 降低系統複雜度
  ✅ 便於替換子系統
  ❌ 可能變成 God Object
  ❌ 過度封裝失去彈性
```

---

## 反模式（避免）

| 反模式 | 症狀 | 解法 |
|--------|------|------|
| God Object | 一個類做所有事 | SRP，拆分職責 |
| Spaghetti Code | 控制流亂跳，無法追蹤 | 模組化，清晰的依賴方向 |
| Golden Hammer | 什麼問題都用同一個模式 | 先理解問題，再選模式 |
| Premature Optimization | 為假想的效能問題加複雜度 | 先讓它工作，測量後再優化 |
| Copy-paste Programming | 大量重複程式碼 | DRY，提取共用邏輯 |
| Magic Numbers | 程式碼中的神秘數字 | 常數命名 |
