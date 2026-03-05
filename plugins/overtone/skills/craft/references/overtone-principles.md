# Overtone 製作原則 Checklist

## 完全閉環
- [ ] 每個 emit 的事件有對應的 consumer
- [ ] 錯誤被記錄且有追蹤路徑
- [ ] 偵測結果有對應的行動建議

## 自動修復
- [ ] 主入口函式有 try-catch 保護
- [ ] 定義了停止條件和誤判防護
- [ ] 長期運行元件有重啟機制

## 補全能力
- [ ] Skill 有 references/ 目錄
- [ ] health-check 偵測有 actionable 建議
- [ ] 新元件通過 validate-agents 檢查

## 驗證品質（三信號）
- [ ] 測試通過（bun test 0 fail）
- [ ] 審查通過（REVIEW APPROVE）
- [ ] 行為符合 BDD spec
