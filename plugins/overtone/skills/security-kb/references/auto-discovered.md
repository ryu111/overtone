---
## 2026-03-04 | developer:DEV Findings
- 檔案包含三個刻意的安全漏洞：
  1. **SQL Injection**（OWASP A03）：`queryUser` 直接字串拼接 `userId` 進入 SQL 查詢
  2. **Command Injection**（OWASP A01）：`deleteFile` 直接將使用者輸入傳給 `execSync('rm -rf ...')`，且無引號包覆
  3. **硬編碼 Secret**：`API_KEY = 'sk-1234567890abcdef'` 明文寫在程式碼中
- 此檔案位於 `/tmp/`，不影響專案 codebase
Keywords: injection, owasp, queryuser, userid, command, deletefile, execsync, secret, codebase
