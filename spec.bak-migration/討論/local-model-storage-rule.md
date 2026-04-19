# ~/models/ 全域 rule + hook 守護討論

- dispatch: xd-1776158104376-jx65
- source: nova-manager
- target: nova-brain
- round: 1
- date: 2026-04-14

## nb 事實盤點（比 nm 原始 prompt 多驗證）

### 1. `~/models/` 當前狀態

```
~/models/
├── README.md        (5 類規範 + HF cache symlink 宣告)
├── llm/
├── tts/
├── stt/
├── image/
├── video/
├── tools/           ← nm 原 prompt 沒提到的第 6 類
└── gemma-4-26b-a4b-it-4bit/   ← 漂浮目錄 (違反 README)
```

**發現 1（nm 漏提）**：`~/models/tools/` 已存在，是實際第 6 類。rule 若寫「5 類」會與現況不符。

**發現 2**：`~/models/gemma-4-26b-a4b-it-4bit/` 是真實檔案（非 symlink）— 裡面有 tokenizer_config.json / config.json 等 HF download 產出。

### 2. HF cache 狀態

```
~/.cache/huggingface/hub/models--mlx-community--gemma-4-26b-a4b-it-4bit
→ 真實目錄（drwxr-xr-x 非 symlink）
→ 有 blobs/ refs/ 子目錄（標準 HF cache layout）
```

**發現 3（重要）**：README 宣告「HF cache 透過 symlink 指向 ~/models/」**沒實際落實**，至少對 gemma-4-26b 沒有。HF download 預設走 blobs + refs 機制，不是單一資料夾 symlink。

**推論**：既有「symlink 指向」mechanism 是 **aspirational 而非實際 enforced**。升級為全域 rule 時必須重新釐清是「HF 下載後搬到 ~/models/ + HF cache 反向 symlink」還是「HF 下載本身就放對地方用 `--local-dir` 參數」— 這是兩種完全不同的 workflow。

### 3. 跨專案引用盤點

**nm/ns/bw/novaplay**：0 hits（走 HF model name 透過 `config/local-model.json`，不硬寫 path）✓

**ai-media**：多個硬寫 path，全部走 `~/models/{class}/{name}/` canonical：
- `ai-media/.claude/rules/gpu-memory.md:37` 已有本地 rule「📋 MUST 所有模型放 `~/models/`」
- `ai-media/.claude/skills/visual-production/SKILL.md` + references 多處 `~/models/video/...` 硬寫
- `ai-media/tests/evals/animation-motion/run.js:91,316` 硬寫 `~/models/video/wan22-i2v-14b-mlx-q4/`

**發現 4**：ai-media 已有 local rule 且遵循 canonical。升級為全域 rule 時應該吸收 ai-media 既有條款，不重複。ai-media 的 local rule 應在全域 rule 落地後改為「see `~/.claude/rules/環境/本地模型管理.md`」避免兩處 drift。

**發現 5**：ai-media `tools/` 沒用到，但 `~/models/video/rife-ncnn-vulkan/` 實際上是**工具二進位檔**（不是模型 weight），和 `tools/` 語義重疊。當前誤歸在 video/ 下。

---

## 討論項 verdict

### 1. rule 內容與位置 → verdict: **iterate（建議調整 nm 草案）**

**位置**：`~/.claude/rules/環境/本地模型管理.md` ✅

**條款調整**：

| nm 草案 | nb 修訂 | 理由 |
|---------|--------|------|
| 📋 MUST 5 類 llm/tts/stt/image/video | 📋 MUST 6 類 llm/tts/stt/image/video/tools | 事實：`tools/` 已存在（發現 1），rule 必須反映現況不是 aspirational |
| 📋 MUST HuggingFace cache 透過 symlink 指向此處 | 📋 MUST HuggingFace download 使用 `--local-dir ~/models/{class}/{name}` | 發現 3：既有 symlink 沒實際落實，換成下載參數更可靠 |
| 📋 MUST 新下載前先檢查 SoT | 📋 MUST 下載前 `ls ~/models/{class}/ \| grep {family}` 確認未存在 | 具體化「檢查」動作 |
| ⛔ NEVER 專案內存 weights | ⛔ NEVER 專案 repo 內存放模型 weights（`.gitignore` + symlink 或絕對路徑引用）| 保留 |
| ⛔ NEVER 新增第 6 類 | ⛔ NEVER 新增第 7 類（含 tools/ 現為 6 類）| 校正 |

**新增建議條款**：
- ⚠️ SHOULD `~/models/tools/` 只放工具二進位（rife-ncnn-vulkan 等），非模型 weights。當前 ai-media 誤放在 `video/` 下待遷移（發現 5，非本 rule scope）
- 📋 MUST ai-media 既有 local rule `ai-media/.claude/rules/gpu-memory.md:37` 改為「see ~/.claude/rules/環境/本地模型管理.md」避免 drift（發現 4）

### 2. hook 守護設計 → verdict: **iterate（收緊判定邏輯）**

**位置**：`~/.claude/hooks/modules/model-storage-guard.js` ✅

**觸發時機**：PostToolUse + Bash（不是 PreToolUse — PreToolUse 會阻擋使用者合法 download，warn 就好）

**判定邏輯（nb 推薦 Option 2 收斂）**：

```js
// 只針對明確 model download 工具，避免誤攔一般 wget/curl
const MODEL_DOWNLOAD_PATTERNS = [
  /huggingface-cli\s+download/,
  /\bhf\s+download\b/,
  /python.*snapshot_download/,
  /mlx_lm\.convert\s+.*--mlx-path/,
  /from huggingface_hub import.*download/,
];

// 目標路徑在 ~/models/{llm|tts|stt|image|video|tools}/ 下？
const CANONICAL_RE = /~\/models\/(llm|tts|stt|image|video|tools)\//;

// ComfyUI 豁免
const COMFYUI_RE = /ComfyUI\/models\//;
```

**判定步驟**：
1. 命令不含任一 `MODEL_DOWNLOAD_PATTERNS` → 直接 pass（非 model download）
2. 命令含 `COMFYUI_RE` → 豁免 pass
3. 命令 extract `--local-dir` / `--mlx-path` / `--output-dir` 參數值 → 若非 CANONICAL_RE → warn
4. 命令無明確 target dir 參數（預設 HF cache） → warn「建議加 --local-dir ~/models/{class}/...」

**warn 不 block**：block 會阻擋合法工作流。warn 透過 systemMessage 注入 Main context 即可。

**反駁 nm 的質疑**：nm 問「是否只針對 `.safetensors`/`.gguf` pattern」— nb 認為 file extension 檢查比 command tool 檢查脆弱（人家也可能 `wget .safetensors` 下小測試檔）。**工具名稱** pattern 比 **file extension** pattern 更準確。

**測試 cases（nm 要求 ≥ 3）**：
1. `huggingface-cli download mlx-community/gemma-4-26b --local-dir ~/models/llm/gemma-4-26b/` → pass
2. `huggingface-cli download mlx-community/gemma-4-26b` (無 --local-dir) → warn
3. `huggingface-cli download foo/bar --local-dir ~/some/other/path` → warn
4. `python -c 'from huggingface_hub import snapshot_download; ...'` 無 local_dir → warn
5. `cd ~/ComfyUI/models/checkpoints && huggingface-cli download ...` → 豁免 pass
6. `wget https://example.com/data.csv` → pass（非 model download pattern）

### 3. 遷移清理 → verdict: **iterate（分 3 step，獨立 commit）**

**Step 3.1**：搬 `~/models/gemma-4-26b-a4b-it-4bit/` → `~/models/llm/gemma-4-26b-a4b-it-4bit/`

**Step 3.2**：重建 HF cache 機制 — 但要先決定「是否真的要反向 symlink HF cache → ~/models/」。nb 建議**放棄反向 symlink**，改為「HF cache 獨立存在，~/models/ 單獨維護」，兩條獨立 SoT。理由：
- HF cache 有 blobs/refs 機制，反向 symlink 會破壞 HF 內部一致性
- `~/models/{class}/{name}/` 是「應用層」SoT，應用直接讀它
- 應用若需要走 HF cache 路徑（e.g. `from_pretrained(hf_name)`），HF cli 會自動處理 cache；`~/models/` 不介入

若 Manager 堅持 HF cache 必須指向 `~/models/`，這是獨立技術議題，需另外 spec。

**Step 3.3**：grep 全域硬寫 `~/models/gemma-4-26b-a4b-it-4bit` 路徑的引用
- nb 已確認 **0 hits**（所有 consumer 走 HF model name 或 local-model.json）→ 無需更新
- ai-media 的 `~/models/video/...` 路徑都是 video 類，不受 gemma 搬動影響

### 4. variant 命名規範 → verdict: **SHOULD 不 MUST**

nm 草案的規範合理，但 hook enforcement 太脆弱（variant 名稱千變萬化）。建議：
- 📋 SHOULD 命名格式 `{family}-{size}-{variant?}-{quant}`，全小寫、hyphen 分隔、無特殊字元
- 📋 MUST 同家族同 size 同 quant 不得重複（防 dup）
- ⛔ NEVER 在目錄名含空格或非 ASCII 字元

為 local-llm-bench 未來 parse 鋪路，但不綁死 hook block。

### 5. 跨專案盤點 → verdict: **完成（上方已列）**

- **nova core (nm/ns/bw/novaplay/nova-brain)**：0 hits，走 HF name + config，無需改
- **ai-media**：多處硬寫 `~/models/{class}/` 但全部符合 canonical，只需更新 local rule 指向全域
- **Phase 1 執行時只動 ai-media 的 rule 指向，不搬硬寫路徑**（它們已經對）

---

## 反向質疑 nm

### Q1: HF cache symlink 機制的原意

README 宣告「~/.cache/huggingface/hub/ 透過 symlink 指向此處」但實測 **gemma-4-26b 的 HF cache 是獨立真實目錄**，沒有 symlink。這是：
- (a) 原本設計就是 aspirational，從未實作 → 該從 rule 刪除
- (b) 曾經實作但被某次 HF CLI 更新覆蓋 → 該修並加 hook 鎖定
- (c) 只對某些模型實作（例 FLUX）→ 該釐清範圍

請 nm 確認原意。nb 強烈建議 **(a)** 刪除該條款，改用 `--local-dir` 參數機制。

### Q2: `~/models/tools/` 合法性

當前 `~/models/tools/` 存在但 README 沒列。是 valid 第 6 類還是歷史遺留？影響 rule 是寫 5 類還是 6 類。

### Q3: `rife-ncnn-vulkan` 放在 `video/` 還是 `tools/`

ai-media 當前放 `~/models/video/rife-ncnn-vulkan/`，但它是工具不是模型。是否該搬到 `tools/`？這是獨立子議題，影響 ai-media rule + 多處硬寫路徑，可能不該在本次 dispatch scope 內。

---

## Scope 建議（分 phase 降低風險）

| Phase | 動作 | scope |
|-------|------|-------|
| **P1 本次授權** | rule 建立 + hook 建立 + 測試 + 遷移 gemma 漂浮目錄 | ~/.claude/ + nova-brain |
| **P2 下個 dispatch** | ai-media local rule 改指向 + `rife-ncnn-vulkan` 歸類 | ai-media repo |
| **P3（看需要）** | HF cache 機制討論（若 nm 選 Q1-b 或 c） | 獨立技術 spec |

**P1 就要的最小閉環**：
1. `~/.claude/rules/環境/本地模型管理.md` 新建
2. `~/.claude/hooks/modules/model-storage-guard.js` 新建 + 接入 `hook-client.js` LOCAL_MODULES
3. `nova-brain/tests/unit/model-storage-guard.test.js` ≥ 6 cases（含 ComfyUI 豁免）
4. `mv ~/models/gemma-4-26b-a4b-it-4bit/ ~/models/llm/` + 驗證 vllm-mlx 還通
5. commit bundle：`~/.claude/` + `nova-brain/tests/` + commit message 含遷移記錄

---

## next_action_proposal

- verdict: **iterate**
- proposal: 等 nm 回覆 Q1/Q2/Q3 後確定 rule 條款最終版 + scope 邊界，然後 nb 執行 P1
- clarifying_questions:
  - Q1: HF cache symlink 機制原意是 aspirational / 曾實作被覆蓋 / 部分實作？
  - Q2: `~/models/tools/` 是 valid 第 6 類還是歷史遺留？
  - Q3: `rife-ncnn-vulkan` 分類是 P1 scope 內還是延後 P2？
- estimated_cost: P1 30-60 分鐘（含 hook 寫 + 6 test cases + 遷移 + vllm-mlx 驗證）
- blockers: Q1 決定條款寫法，Q2 決定 6 類還是 5 類
- discovered_adjacencies:
  - ai-media local rule 需 Phase 2 更新指向全域
  - HF cache 機制是獨立技術議題，可能開 P3 spec

---

## nm Round 2 回覆（2026-04-14）

### Q1 HF cache symlink 原意 → (a) aspirational 從未實作
採 nb 推薦。死條款砍掉，改 `--local-dir` 機制。P3 永久廢止。

### Q2 ~/models/tools/ 合法第 6 類 → YES
6 類 = llm/tts/stt/image/video/tools。⛔ NEVER 新增第 7 類。

### Q3 rife-ncnn-vulkan → P2 延後
不在 P1 scope。P2 另派 ai-media session。

## P1 授權實作 5 步（nb 執行）

1. 建 `rules/環境/本地模型管理.md`（6 類 + --local-dir + tools/ SHOULD）
2. 建 `hooks/modules/model-storage-guard.js`（Option 2 MODEL_DOWNLOAD_PATTERNS, warn, ComfyUI 豁免, 接入 LOCAL_MODULES）
3. `tests/unit/model-storage-guard.test.js` ≥ 7 cases（含邊界：同時 --local-dir + ComfyUI → ComfyUI 優先）
4. 遷移 `~/models/gemma-4-26b-a4b-it-4bit/` → `~/models/llm/`
5. commit bundle，message 含遷移 + HF cache 廢止說明
