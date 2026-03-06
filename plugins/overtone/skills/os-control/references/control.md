# 操控層（L2.5）— 待開始

> L2.5「動得了」（keyboard / mouse / AppleScript / computer-use）目前為 ⬜ 降優先待開始狀態。

## 狀態說明

此文件預留給操控層能力的完整說明。當 L2.5 開始實作後，將填入：
- keyboard 輸入模擬 API
- mouse 點擊 / 拖拽操作
- AppleScript / JXA 自動化腳本
- computer-use（視覺型 UI 操控）的整合方式

## 預計涵蓋能力

| 能力 | 說明 | 狀態 |
|------|------|------|
| keyboard | 模擬鍵盤輸入（keystroke、hotkey） | ⬜ 待實作 |
| mouse | 點擊、拖拽、捲動 | ⬜ 待實作 |
| applescript | 操控 macOS 原生 App（Finder、Mail 等） | ⬜ 待實作 |
| computer-use | 視覺型 UI 理解 + 操控（Claude computer-use API） | ⬜ 待實作 |

## 當前替代方案

在 L2.5 實作前，可透過 Bash 直接執行 osascript：

```bash
# 開啟 App
osascript -e 'tell application "Finder" to activate'

# 鍵盤輸入（需搭配 System Events）
osascript -e 'tell application "System Events" to keystroke "hello"'

# 點擊選單項目
osascript -e 'tell application "System Events" to click menu item "Quit" of menu "App" of menu bar 1'
```

> 感知層（截圖、視窗列表）參見 `perception.md`。系統管理參見 `system.md`。
