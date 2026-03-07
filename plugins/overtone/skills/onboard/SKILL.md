---
name: onboard
description: 掃描專案結構，產生 CLAUDE.md 骨架。偵測技術棧、常用命令、目錄結構，輸出到對話供使用者自行寫入。
disable-model-invocation: false
---

# Onboard 知識域

> 專案掃描與 CLAUDE.md 骨架生成

## 消費者

此 Skill 為 utility，由 /ot:onboard command 觸發。

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 `./references/claudemd-skeleton.md` | CLAUDE.md 骨架模板：區段結構 + 填寫指引 |
| 💡 `./references/stack-detection.md` | 技術棧偵測策略：package.json / Gemfile 等框架識別模式 |