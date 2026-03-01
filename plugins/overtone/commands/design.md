---
name: design
description: UI/UX 設計。詢問風格偏好後委派 designer agent，利用 ui-ux-pro-max 知識庫生成設計系統與 HTML Mockup 預覽。
argument-hint: "[設計需求，例如：Dashboard 新增即時通知面板]"
allowed-tools: Read, Grep, Glob, AskUserQuestion, Task
---

# UI/UX 設計（Design）

## 你的角色

你是設計流程的入口點。先透過 AskUserQuestion 確認設計方向，再委派 designer agent 產出設計系統與 HTML Mockup。

## 工作流程

### Step 1：詢問設計偏好

使用 AskUserQuestion 詢問以下三個問題（**同一訊息一次問完**）：

**問題 1：視覺風格**
- **極簡深色**（GitHub Dark style，高對比，資訊密度優先）
- **溫暖深色**（Catppuccin style，帶紫調，護眼舒適）
- **玻璃態**（Glassmorphism，模糊層次，現代 SaaS 感）
- **新粗野主義**（Neubrutalism，厚邊框，強烈個性）

**問題 2：動畫程度**
- **豐富**（confetti 慶祝、脈衝、滑入、狀態閃光）
- **適中**（基本 hover + 狀態轉換，0.2-0.5s）
- **極簡**（幾乎無動畫，純色彩狀態區分）

**問題 3：資訊密度**
- **高密度**（最大化資訊量，緊湊間距，小字型，監控導向）
- **平衡**（標準 Dashboard 風格，8px 基礎間距）
- **寬鬆**（呼吸感強，大留白，重點突出）

### Step 2：委派 designer agent

收到回答後，使用 Task 工具委派 designer agent，prompt 中必須包含：

1. 設計需求（來自 `$ARGUMENTS` 或對話脈絡）
2. 三個偏好參數（style / animation / density）
3. specs feature 路徑（若在 full workflow 中，傳入 `specs/features/in-progress/{feature}/`）

範例 Task prompt：
```
委派 designer agent：

設計需求：{ARGUMENTS}

設計偏好：
- 視覺風格：{style}
- 動畫程度：{animation}
- 資訊密度：{density}

Specs 路徑：{specs/features/in-progress/{feature}/ 或 "無"}

## Handoff from architect（若有）
{architect Handoff 完整內容}
```

### Step 3：摘要呈現結果

designer agent 回傳後：
- 摘要核心設計要素（主色 Hex / 字型 / 風格名稱）
- 確認 design-system.md 和 design-mockup.html 路徑
- 提示後續步驟

## 後續行動

設計確認後，建議：
- 繼續開發 → `/ot:dev`（帶入 designer Handoff）
- 需要 BDD spec → `/ot:test`（TEST:spec 模式）
- 完整工作流 → `/ot:full`（已包含 DESIGN stage）

## 使用者需求

$ARGUMENTS
