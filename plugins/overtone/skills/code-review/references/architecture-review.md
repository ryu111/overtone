# 架構層面的 Code Review 模式

## 模組耦合度

### 耦合類型判斷

```
高耦合（問題信號）：
  □ A 修改了，B 也必須修改
  □ 測試 A 時必須實例化 B、C、D
  □ import 路徑跨越多個模組層次
  □ 迴圈依賴（A → B → A）

低耦合（好的設計）：
  □ 通過介面/抽象互動，不直接依賴實作
  □ 可以獨立測試（容易 mock 依賴）
  □ 修改 A 的內部實作，B 不受影響
```

### 迴圈依賴偵測

```bash
# 用工具偵測
npx madge --circular src/

# 手動排查
# 找 A import B，再找 B import A
grep -rn "import.*from.*moduleA" src/moduleB/
grep -rn "import.*from.*moduleB" src/moduleA/
```

### 依賴方向規則

```
正確的依賴方向：
  外層 → 內層  （不能反向）

  Controllers → Services → Repositories → Database
  UI Layer   → Business Logic → Data Access Layer

  錯誤：Service 引用 Controller
  錯誤：Repository 引用 Service

在 Overtone 中：
  agents（使用者）→ skills（知識）← scripts/lib（實作）
  hooks（守衛）→ scripts/lib（工具）
```

---

## API 一致性 Checklist

```
命名一致性：
  □ 動詞使用一致（get vs fetch vs retrieve）
  □ 複數/單數一致（getUser vs getUsers）
  □ 錯誤回傳方式一致（throw vs return null vs return {error}）
  □ Boolean 參數命名（is/has/can 開頭）

回傳值一致性：
  □ 成功時都回傳相同格式（{ data, error } 或 data）
  □ 找不到時都回傳 null（不是有時候回傳 null 有時候 throw）
  □ 空集合回傳 []（不是 null）

錯誤處理一致性：
  □ 業務錯誤 vs 技術錯誤 分開處理
  □ 錯誤訊息格式一致（都有 code/message）
  □ 非同步函式都有 try/catch
```

---

## 錯誤傳播路徑

### 錯誤處理策略評估

```
1. 讓錯誤向上傳播（throw/reject）
   適用：調用者應該知道操作失敗
   問題：可能在錯誤的層次被處理

2. 轉換錯誤（catch + re-throw）
   適用：底層錯誤需要包裝成業務錯誤
   範例：DB 錯誤 → UserNotFoundError

3. 吞掉錯誤（catch + return null/false）
   適用：可選操作，失敗不影響主流程
   危險：可能掩蓋真正的問題

4. 記錄 + 傳播
   適用：需要 logging 但不阻斷流程
```

### 審查問題

```
審查時問：
  □ 這裡的 catch 是否在正確的層次？
  □ 錯誤是否包含足夠的 context 供 debug？
  □ 是否有 finally 確保資源釋放？
  □ Promise rejection 是否都有處理？

危險模式：
  // 吞掉錯誤，沒有任何記錄
  try {
    await doSomething();
  } catch (e) {}  // 完全不處理

  // 隱藏原始錯誤
  try {
    await doSomething();
  } catch (e) {
    throw new Error('Something failed');  // 原始 error 丟失
  }

好的模式：
  try {
    await doSomething();
  } catch (e) {
    logger.error('doSomething failed', { error: e, context: { userId } });
    throw new OperationError('Something failed', { cause: e });  // 保留原始
  }
```

---

## 關注點分離（SoC）

```
審查 SoC 的問題：
  □ 函式是否做了超過一件事？
  □ 業務邏輯是否混入了 I/O 操作？
  □ UI 邏輯是否混入了資料處理？
  □ 設定是否硬編碼在程式碼中？

重構信號：
  - 函式超過 50 行（可能做了太多事）
  - 函式名有 and（做了兩件事）
  - 深層嵌套（超過 3 層）
  - 需要大量 mock 才能測試（依賴太多）
```

---

## 擴展性評估

```
審查擴展點的問題：
  □ 如果需要加入新的 [entity]，需要改幾個地方？
  □ 是否有明確的 extension point？
  □ 是否可以通過 config 而非修改程式碼來改變行為？

好的擴展設計（OCP）：
  // 壞：加新 type 要修改 switch
  function handle(event) {
    switch (event.type) {
      case 'A': handleA(event); break;
      case 'B': handleB(event); break;
      // 加 C 要改這裡
    }
  }

  // 好：handler registry
  const handlers = {
    A: handleA,
    B: handleB,
  };
  function handle(event) {
    const handler = handlers[event.type];
    if (!handler) throw new Error(`Unknown event: ${event.type}`);
    handler(event);
  }
  // 加 C 只需 handlers.C = handleC，不改現有程式碼
```

---

## 架構 Review 評分表

| 維度 | 問題 | 評分（1-5）|
|------|------|-----------|
| 耦合度 | 模組間是否可獨立修改？ | |
| 凝聚力 | 同一模組的功能是否相關？ | |
| API 一致性 | 同類操作的介面是否統一？ | |
| 錯誤處理 | 錯誤傳播路徑是否清晰？ | |
| 擴展性 | 加新功能需要改幾個地方？ | |
| 可測試性 | 依賴是否容易 mock？ | |

評分 < 3：需要重構討論
評分 3-4：可接受，記錄技術債
評分 5：良好設計
