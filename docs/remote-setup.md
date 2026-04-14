# Remote Session Setup（cw / wp 等遠端機器）

> 對應 xd-dxmc 治本實作（A+B env var 化）。本機 nm/nb 不需設任何 env var，預設 localhost 零影響。

## 情境

當 claude session 跑在非 nova-server 本機上（例：公司 mbp 跑 work-projects，透過 Tailscale 連 home ns）時需要兩個 env var：

| env var | 用途 | 預設 |
|---------|------|------|
| `NOVA_SERVER_URL` | 指向 nova-server 實體 | `http://127.0.0.1:3457` |
| `NOVA_MAPPED_CWD` | 翻譯 session cwd 為 nm 端 canonical path | `process.cwd()` |

## 使用 Tailscale MagicDNS（推薦）

避免 IP drift 第二代硬寫 bug，用 MagicDNS hostname 而非 Tailscale IP。

### 當前 Nova Tailnet 拓樸

| machine | MagicDNS 短名 | Tailscale IP | 角色 |
|---------|--------------|--------------|------|
| `sbumac-studio` | `sbumac-studio` | 100.97.204.9 | nm / nb / nova-server host |
| `mbp16-dea035002` | `mbp16-dea035002` | 100.102.116.88 | cw / wp 執行機 |

> 以 `tailscale status` 第一欄查詢當前 MagicDNS 短名。若短名解析失敗，fallback 用 Tailscale IP。

### cw 機器 shell profile（`~/.zshrc` 或 `~/.bashrc`）

```bash
# Nova remote session → 指向 sbumac-studio 的 nova-server
export NOVA_SERVER_URL="http://sbumac-studio:3457"

# 可選：若 cw 的 wp 路徑和 nm 端 canonical path 不同才設
# （若 cd wp 後啟動 claude，process.cwd() 已正確，無需此 var）
# export NOVA_MAPPED_CWD="/Users/sbu/projects/work-projects"
```

### 驗證

```bash
# 1. MagicDNS 解析通
curl -s http://sbumac-studio:3457/health | jq .

# 2. Hook 讀到 env var
NOVA_SERVER_URL=http://sbumac-studio:3457 bun ~/.claude/hooks/hook-client.js SessionStart <<< '{"eventType":"SessionStart","cwd":"'"$PWD"'","session_id":"test"}'
# 應正常輸出 additionalContext，不 throw ECONNREFUSED

# 3. hook-debug-log 驗證
tail /tmp/hook-client-debug.log
# 若設了 env var 應有一行 [hook-client] NS_URL=http://sbumac-studio:3457 NOVA_MAPPED_CWD=...
```

## MagicDNS 失敗時 fallback

若 `sbumac-studio` 解析失敗（cw 的 DNS resolver 沒啟用 Tailscale 或其他問題）：

```bash
# fallback 用 Tailscale IP（注意：機器重灌會 drift）
export NOVA_SERVER_URL="http://100.97.204.9:3457"
```

檢查 Tailscale DNS resolver：
```bash
tailscale status  # 若無 DNS 欄位，檢查 Tailscale admin UI 的 DNS 設定
scutil --dns | grep -i tailscale  # macOS 查看 DNS resolver
```

## 已知限制

- env var 只在 shell / 子 process 繼承，若 claude 以 launchd / systemd daemon 啟動需另外注入
- `NOVA_SERVER_URL` 變動後必須重開 claude session 才生效（hook-client 每次讀取，但已啟動的 session 不重跑 profile）
- cw admin 更換 Tailscale tailnet 需手動更新 `NOVA_SERVER_URL`（同 MagicDNS 短名變動時）

## 歷史背景

xd-dxmc（2026-04-14）之前，hook 層 22 處硬寫 `http://127.0.0.1:3457`，`cw` 遠端 session 因 ns 非 localhost 而靜默失敗。討論收斂見 `spec/完成/cw-routing-two-issues.md`（本 dispatch 閉環後歸檔）。
