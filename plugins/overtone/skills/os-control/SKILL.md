---
name: os-control
description: OS 操控知識域。桌面自動化、系統管理、螢幕截圖、音訊控制等 OS 能力的 reference 索引。供 developer、architect、tester、debugger、qa 消費。
disable-model-invocation: true
user-invocable: false
---

# OS Control 知識域

OS 操控能力的集中索引。Agent 按需讀取對應的 reference 文件。

## 消費者
| Agent | 用途 |
|-------|------|
| developer | 實作 OS 腳本、呼叫 OS API |
| architect | 設計 OS 能力架構、評估技術方案 |
| tester | 測試 OS 功能、驗證跨平台行為 |
| debugger | 診斷 OS 相關問題、追蹤系統呼叫 |
| qa | 驗證 OS 操作的使用者體驗 |

## Reference 索引
| # | 檔案 | 說明 | 對應階段 |
|---|------|------|----------|
| 1 | 💡 `${CLAUDE_PLUGIN_ROOT}/skills/os-control/references/perception.md` | 截圖、視覺理解、視窗管理（screenshot.js + window.js API + 視覺分析模板） | P3.1 ✅ |
| 2 | 💡 `${CLAUDE_PLUGIN_ROOT}/skills/os-control/references/control.md` | 鍵盤/滑鼠模擬、AppleScript/JXA、Computer Use | P3.2 |
| 3 | 💡 `${CLAUDE_PLUGIN_ROOT}/skills/os-control/references/system.md` | Process 管理、剪貼簿、系統資訊、通知、檔案監控 | P3.3 ✅ |
| 4 | 💡 `${CLAUDE_PLUGIN_ROOT}/skills/os-control/references/realtime.md` | WebSocket、TTS、STT | P3.4 |

## Examples

💡 macOS 自動化場景範例集：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/os-control/examples/automation-scenarios.md`

## OS 能力總覽

Overtone 的 OS 能力架構：
- **腳本層**：`plugins/overtone/scripts/os/*.js` — 實際的 OS 操作能力
- **知識層**：本 Skill 的 reference 文件 — Agent 學習 OS API 使用方法
- **守衛層**：`pre-bash-guard.js` — 攔截危險的 OS 命令

### 桌面操控策略
1. **AppleScript/JXA 原生優先**：速度快、精確度高、macOS 原生支援
2. **Computer Use 兜底**：截圖→理解→操作→驗證 迴圈，處理無 AppleScript API 的場景

### 平台偵測
- macOS：`process.platform === 'darwin'`
- 工具檢測：`which screencapture`、`which osascript`、`which cliclick`

## 按需讀取

💡 實作截圖功能 → 讀取 `${CLAUDE_PLUGIN_ROOT}/skills/os-control/references/perception.md`
💡 實作鍵盤/滑鼠操作 → 讀取 `${CLAUDE_PLUGIN_ROOT}/skills/os-control/references/control.md`
💡 實作系統管理 → 讀取 `${CLAUDE_PLUGIN_ROOT}/skills/os-control/references/system.md`
💡 實作即時通訊 → 讀取 `${CLAUDE_PLUGIN_ROOT}/skills/os-control/references/realtime.md`