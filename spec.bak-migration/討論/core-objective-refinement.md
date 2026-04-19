# core_objective 精煉與職責分工討論

## 背景

跨兩輪 dispatch：
- **xd-d2tu** (2026-04-14)：使用者明示 nb 核心目標補 Agent Harness + Feedback Loop。nb 第一次草擬把方向 + 架構 + 做事守則全塞 core_objective（4 句一段），non_negotiables 第 4 條同時有「Feedback Loop 閉環」，形成 intentional redundancy。nb 在回報時標示該觀察。
- **xd-gkxp**：Manager review 後提精簡版本要 nb 照抄，nb 直接接受 commit 46d0ef0，**但流程上屬命令式越界**（nb 作為 CLAUDE.md 作者應先獨立判斷）。使用者糾正 Manager。
- **xd-y9cq**：撤回 gkxp 命令式流程，改以討論式請 nb 獨立回答「core_objective 該不該含做事守則？」三問題。

## (a) core_objective 該不該含做事守則？

**結論**：不該。

**理由**：

1. **單一職責原則**：
   - `core_objective` 回答「**為什麼**這個 repo 存在」（方向宣告，陳述語氣）
   - `non_negotiables` 回答「**何時**算失守」（底線清單，禁令語氣）
   - 兩者語法時態都不同，混在一起會模糊讀者對「這段話想告訴我什麼」的期待。

2. **跨專案一致性**：
   - 「Feedback Loop 閉環」不是 nova-brain 獨有的方向，而是 **所有 nova 專案產出的通用守則**（nova-server / nova-manager / nova-control 都該閉環）
   - 它屬於行為紀律層（歸 `rules/品質/完成與閉環.md` 或全域 `rules/`），不是 nb 特有方向
   - 把它塞 core_objective 等於讓 nb 承擔「宣告通用行為規範」的責任，**越權**

3. **core_objective 作為 routing signal 的用途**：
   - 討論式派發時 Manager 用 core_objective 判斷「這個 target 該不該接這個任務」
   - 若 core_objective 含做事守則，routing 會被守則噪音干擾
   - 純方向讓 routing 更乾淨

## (b) 若要改善密度，怎麼拆？

**現況 (46d0ef0)**：
> 推進 `~/.claude/` 達 L1-L4 Agent Harness 核心 — Guide（rules/skills）+ Sensor（hooks）+ Closed-Loop（feedback），打造通用自主代理底層。

**拆解分析**：這句話含 3 個資訊單元：
1. 目標層級 L1-L4
2. 本質 Agent Harness
3. 三支柱 Guide/Sensor/Closed-Loop

**密度評估**：不算高。資訊單元之間有明確層級（目標 → 本質 → 構成），閱讀線性。若再拆會傷害「一次看懂專案在做什麼」的效用。

**可考慮的替代**：若 Manager 覺得 inline 括號太密，可改為句末 em-dash 展開，但我覺得現版已經是 em-dash 形式，沒空間再簡化而不失義。

**我的判斷**：現況密度恰到好處。再壓會傷害資訊完整性，再展會破壞 one-liner 紀律。

## (c) 現狀是否即定稿？

**答**：是，現狀 46d0ef0 即定稿。

**但補充**：流程層面 gkxp 有瑕疵（我照抄 Manager 版本沒獨立思考），但結論正確。本次 y9cq 的討論補上了缺失的獨立思考步驟。

## 流程教訓

**問題**：Manager 派 dispatch 若含「建議版本」，nb 若接到就做 = 命令式順從，不尊重作為 CLAUDE.md 作者 + 技術專家的主導權。

**改善**：未來 Manager 若在 dispatch 中塞 propose（「改成這樣」），nb 應該先回答：
1. 同意 / 不同意
2. 理由（含對每個改動的單獨判斷）
3. 才決定 commit

這是 `rules/協作/討論式派發.md` 的精神 — 「Target 是專業者：以自己 CLAUDE.md core_objective 為唯一判斷依據，不迎合 Manager」。

**建議補條款**：`rules/協作/討論式派發.md` 加一條：
> 📋 MUST Target 收到 dispatch 含具體措辭/diff/code 建議時，必須先在回報中獨立評估每個建議（同意/不同意 + 理由），才決定是否執行。
> ⛔ NEVER Target 對 Manager 的具體建議「照抄執行」— 那是命令式不是討論式，違反 segregation of duties。

## 附帶建議

1. **格式紀律寫入 rule**：把「core_objective = one-liner 純方向，non_negotiables = 行為守則清單」的分工紀律寫入 `rules/協作/討論式派發.md` 作為格式守則，避免未來草擬時再犯混合職責的錯。

2. **gkxp commit 保留不撤回**：雖然流程有瑕疵但結論正確。撤回重建 git history 汙染成本 > 保留的敘事成本。y9cq 的討論 body 存在本檔 + dispatch API 做為日後 review 的歷史紀錄。

## 最終定稿（46d0ef0，本檔確認）

```markdown
- **core_objective**：推進 `~/.claude/` 達 L1-L4 Agent Harness 核心 — Guide（rules/skills）+ Sensor（hooks）+ Closed-Loop（feedback），打造通用自主代理底層。
- **non_negotiables**（不可協商底線）：
  - 測試零容忍（全域元件改動必先跑測試，失敗不放行）
  - 治本優先（結構性缺陷 > 末端修補，不接受 workaround）
  - `~/.claude/` 唯一 SoT（禁止 fork / 禁止另建全域元件）
  - Feedback Loop 閉環（每個產出必須有驗證證據，觀察 → 驗證 → 改善，半途而廢或靜默失敗均不接受）
```

---
**dispatch 線**：xd-d2tu（nb 草擬）→ xd-gkxp（Manager 命令式精簡，流程瑕疵但結論正確）→ xd-y9cq（撤回命令式，改討論式，nb 獨立驗證 → 定稿）
