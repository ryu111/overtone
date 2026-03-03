---
feature: p3-1-perception
status: in-progress
workflow: standard
created: 2026-03-03T14:42:33.063Z
---

## Stages

- [x] PLAN
- [x] ARCH
- [x] TEST
- [x] DEV
- [x] REVIEW
- [x] RETRO
- [x] DOCS

## Tasks

## Dev Phases

### Phase 1: 腳本實作 (parallel)
- [ ] 建立 `scripts/os/screenshot.js`（captureFullScreen / captureRegion / captureWindow / checkPermission） | files: `plugins/overtone/scripts/os/screenshot.js`
- [ ] 建立 `scripts/os/window.js`（listProcesses / listWindows / focusApp / getFrontApp / checkAccessibility） | files: `plugins/overtone/scripts/os/window.js`
- [ ] 填充 `perception.md` reference 文件（API 索引 + 截圖分析模板 + osascript 輸出格式） | files: `plugins/overtone/skills/os-control/references/perception.md`

### Phase 2: 測試撰寫 (parallel)
- [ ] 撰寫 `screenshot.test.js`（平台偵測 / 權限失敗 / 各截圖類型命令組裝 / outputPath 規則） | files: `tests/unit/screenshot.test.js`
- [ ] 撰寫 `window.test.js`（平台偵測 / Accessibility 權限 / 各函式輸出解析 / 錯誤碼） | files: `tests/unit/window.test.js`

### Phase 3: 索引更新 (sequential)
- [ ] 更新 `SKILL.md`（perception.md 標記已完成，加入腳本路徑提示） | files: `plugins/overtone/skills/os-control/SKILL.md`
