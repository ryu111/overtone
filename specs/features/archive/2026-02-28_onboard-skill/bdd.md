# Feature: /ot:onboard — 專案 CLAUDE.md 骨架自動生成

## 背景說明

`/ot:onboard` 是工具型 Skill（非 workflow），由 Main Agent 直接執行。
掃描專案結構後，將 CLAUDE.md 骨架輸出到對話，使用者自行決定是否寫入。
`disable-model-invocation: false`（AI 負責語意判斷與填充）。

---

## Scenario: Node.js 專案首次 onboarding（含 package.json）

GIVEN 當前目錄是一個 Node.js 專案
AND 根目錄有 `package.json`，其中包含 `scripts` 欄位（如 `dev`、`build`、`test`）
AND 根目錄不存在 `CLAUDE.md`
WHEN 使用者執行 `/ot:onboard`
THEN Skill 進入「建立模式」（非補充模式）
AND Skill 解析 `package.json` 取得專案名稱、版本、依賴
AND Skill 從 `scripts` 欄位推導常用命令（dev、build、test）
AND Skill 掃描頂層目錄結構（src/、dist/、tests/ 等）
AND 輸出包含「技術棧」區塊，標註語言為 Node.js 並列出主要依賴
AND 輸出包含「常用指令」區塊，列出從 `scripts` 推導的命令
AND 輸出包含所有 7 個骨架區塊（專案概述、技術棧、目錄結構、常用指令、架構概覽、開發規範、關鍵文件）
AND 輸出以 markdown code block 形式呈現在對話中
AND 不自動寫入任何檔案到磁碟

---

## Scenario: Python 專案首次 onboarding（含 pyproject.toml）

GIVEN 當前目錄是一個 Python 專案
AND 根目錄有 `pyproject.toml`，包含 `[project]` 或 `[tool.poetry]` 段落
AND 根目錄不存在 `CLAUDE.md`
WHEN 使用者執行 `/ot:onboard`
THEN Skill 進入「建立模式」
AND Skill 解析 `pyproject.toml` 取得專案名稱、依賴
AND Skill 從 pyproject.toml 的 `[project.scripts]` 或 `[tool.poetry.scripts]` 推導入口命令
AND 輸出包含「技術棧」區塊，標註語言為 Python
AND 輸出包含「常用指令」區塊，列出 Python 生態系慣例命令（pip install / pytest / python -m 等）
AND 輸出包含所有 7 個骨架區塊
AND 輸出以 markdown code block 形式呈現在對話中
AND 不自動寫入任何檔案到磁碟

---

## Scenario: 已有 CLAUDE.md 的專案（補充模式，不覆蓋）

GIVEN 當前目錄的根目錄已存在 `CLAUDE.md`，且包含部分內容
AND 根目錄有 `package.json`
WHEN 使用者執行 `/ot:onboard`
THEN Skill 偵測到已有 `CLAUDE.md` 並進入「補充模式」
AND Skill 讀取現有 `CLAUDE.md` 內容，分析缺少哪些區塊
AND 輸出結果只包含現有 `CLAUDE.md` 中缺失的骨架區塊（差異補充）
AND 輸出前說明「偵測到已有 CLAUDE.md，以下為建議補充的區塊」
AND 不輸出現有 `CLAUDE.md` 已涵蓋的區塊（避免重複）
AND 不修改或覆蓋原有 `CLAUDE.md` 檔案
AND 輸出以 markdown code block 形式呈現在對話中

---

## Scenario: 無可辨識 manifest 的專案（fallback 模式）

GIVEN 當前目錄沒有任何可辨識的 manifest 檔案
AND 不存在 package.json、pyproject.toml、Cargo.toml、go.mod、pom.xml、*.csproj
AND 根目錄不存在 `CLAUDE.md`
WHEN 使用者執行 `/ot:onboard`
THEN Skill 仍能完成掃描流程，不中途拋錯
AND Skill 掃描頂層目錄結構作為 fallback 資訊來源
AND 「技術棧」區塊標註為「未偵測到」或「請手動填寫」
AND 「常用指令」區塊標註為「未偵測到，請依實際工具補充」
AND 輸出包含其他可填充的骨架區塊（專案概述、目錄結構、開發規範、關鍵文件）
AND 輸出以 markdown code block 形式呈現在對話中
AND 不自動寫入任何檔案到磁碟

---

## Scenario: Rust 專案 manifest 偵測（Cargo.toml）

GIVEN 當前目錄是一個 Rust 專案
AND 根目錄有 `Cargo.toml`，包含 `[package]` 段落
AND 根目錄不存在 `CLAUDE.md`
WHEN 使用者執行 `/ot:onboard`
THEN Skill 解析 `Cargo.toml` 取得 crate 名稱、版本、依賴
AND 「技術棧」區塊標註語言為 Rust
AND 「常用指令」區塊包含 Rust 生態系慣例命令（cargo build、cargo test、cargo run）

---

## Scenario: Go 專案 manifest 偵測（go.mod）

GIVEN 當前目錄是一個 Go 專案
AND 根目錄有 `go.mod`，包含 `module` 宣告
AND 根目錄不存在 `CLAUDE.md`
WHEN 使用者執行 `/ot:onboard`
THEN Skill 解析 `go.mod` 取得模組路徑
AND 「技術棧」區塊標註語言為 Go
AND 「常用指令」區塊包含 Go 生態系慣例命令（go build、go test、go run）

---

## Scenario: SKILL.md 檔案格式正確性驗證

GIVEN `plugins/overtone/skills/onboard/SKILL.md` 存在
WHEN 讀取該檔案
THEN 檔案包含 YAML frontmatter，且含有必要欄位：`name`、`description`、`disable-model-invocation`
AND `disable-model-invocation` 值為 `false`
AND 檔案正文描述 5 步掃描流程：
  步驟 1. 偵測已有 CLAUDE.md（判斷建立 vs 補充模式）
  步驟 2. 並行掃描 6 種 manifest + 目錄結構 + .gitignore
  步驟 3. 解析技術棧和常用命令
  步驟 4. 讀取骨架模板，組裝填充
  步驟 5. 輸出到對話（markdown code block）
AND 檔案說明 6 種 manifest 類型：package.json、pyproject.toml、Cargo.toml、go.mod、pom.xml、*.csproj
AND 檔案明確說明「不自動寫入 CLAUDE.md」

---

## Scenario: 骨架模板包含完整 7 個區塊

GIVEN `plugins/overtone/skills/onboard/references/claudemd-skeleton.md` 存在
WHEN 讀取該檔案
THEN 檔案包含以下 7 個區塊（順序可不同，但均須存在）：
  區塊 1. 專案概述（一段話描述）
  區塊 2. 技術棧（表格格式）
  區塊 3. 目錄結構（tree 格式）
  區塊 4. 常用指令（bash code block 格式）
  區塊 5. 架構概覽（可選，標記 optional 或條件填充）
  區塊 6. 開發規範（bullet list 格式）
  區塊 7. 關鍵文件（表格格式）
AND 每個區塊有明確的 Markdown 標題（## 或 ###）
AND 骨架使用自然語言描述（而非 `{placeholder}` 語法）讓 AI 填充

---

## Scenario: Skill 輸出格式 — 使用 markdown code block 包裹

GIVEN 專案掃描完成，骨架組裝就緒
WHEN Skill 輸出結果到對話
THEN 骨架內容以 markdown code block 包裹（例如 ` ```markdown ... ``` `）
AND code block 前有說明文字，指引使用者如何將內容寫入 CLAUDE.md
AND 說明文字包含：建議將此內容複製後貼上到根目錄的 `CLAUDE.md` 檔案

---

## Scenario: 並行掃描步驟 — 6 種 manifest 同時偵測

GIVEN 當前目錄同時包含多種 manifest（如 package.json 和 pyproject.toml，monorepo 情境）
WHEN Skill 執行步驟 2（並行掃描）
THEN 6 種 manifest 的偵測同時發起，不序列化執行
AND 所有偵測到的 manifest 均被解析，技術棧合併呈現
AND 目錄結構掃描與 manifest 偵測並行執行
AND .gitignore 讀取與上述掃描並行執行
