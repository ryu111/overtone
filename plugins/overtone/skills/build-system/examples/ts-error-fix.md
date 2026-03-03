# TypeScript 錯誤修復範例

## 情境

將 `scripts/lib/state.js` 轉換為 TypeScript 時遇到以下錯誤。

---

## 錯誤 1：Object is possibly 'undefined'

```
錯誤訊息：
  src/state.ts:45:12 - error TS2532:
  Object is possibly 'undefined'.

問題程式碼：
  function getActiveStage(workflow: WorkflowState): string {
    const stage = workflow.stages.find(s => s.active);
    return stage.name;  // ← 錯誤在這裡
  }
```

**分析**：`Array.find` 可能回傳 `undefined`（找不到符合條件的元素），TS strict mode 要求處理這個情況。

**修復**：

```typescript
function getActiveStage(workflow: WorkflowState): string | null {
  const stage = workflow.stages.find(s => s.active);
  return stage?.name ?? null;  // optional chaining + nullish coalescing
}

// 或如果確定一定存在（有 invariant 保證）：
function getActiveStage(workflow: WorkflowState): string {
  const stage = workflow.stages.find(s => s.active);
  if (!stage) {
    throw new Error('No active stage in workflow');
  }
  return stage.name;
}
```

---

## 錯誤 2：型別不相容

```
錯誤訊息：
  src/state.ts:78:5 - error TS2322:
  Type 'string | number' is not assignable to type 'string'.

問題程式碼：
  interface Stage {
    id: string;
    order: string;  // ← 宣告為 string
  }

  function processStages(stages: Stage[]) {
    stages.forEach(stage => {
      stage.order = stages.indexOf(stage);  // indexOf 回傳 number
    });
  }
```

**分析**：`Array.indexOf` 回傳 `number`，但 `order` 欄位是 `string`。

**修復**：

```typescript
interface Stage {
  id: string;
  order: number;  // 修正型別為 number
}

// 或轉換型別（如果必須是 string）
stage.order = String(stages.indexOf(stage));
```

---

## 錯誤 3：Generic constraint 不足

```
錯誤訊息：
  src/registry.ts:23:22 - error TS2339:
  Property 'name' does not exist on type 'T'.

問題程式碼：
  function registerItem<T>(item: T): string {
    return item.name;  // ← T 不保證有 name
  }
```

**分析**：Generic `T` 沒有 constraint，TS 不知道 `T` 有 `name` 屬性。

**修復**：

```typescript
interface Named {
  name: string;
}

function registerItem<T extends Named>(item: T): string {
  return item.name;  // 現在 TS 知道 T 一定有 name
}
```

---

## 完整修復後驗證

```bash
# 確認無 TS 錯誤
bunx tsc --noEmit

# 或執行測試確認行為正確
bun test tests/unit/state.test.ts

# 確認 build 成功
bun run build
```
