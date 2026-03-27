# 本地模型 Benchmark

## 測試環境

- 硬體：Apple M4 Max, 64GB RAM, 40-core GPU
- 推論引擎：vllm-mlx (git main), continuous-batching, max-num-seqs 4
- 測試日期：2026-03-18

## 候選模型比較

| 模型 | 總耗時 | Thinking 洩漏 | JSON 正確 | RAM |
|------|:------:|:-------------:|:---------:|:---:|
| Qwen3-8B-4bit | 6.9s | 1/5 | 2/2 | ~5 GB |
| Qwen3.5-35B-A3B-4bit | 100.7s | 2/5 | 1/2 | 19 GB |
| Qwen3.5-4B-4bit | 150.2s | 5/5 | 0/2 | 3 GB |
| Qwen3.5-9B-MLX-4bit | 151.6s | 1/5 | 1/2 | 6 GB |

## 增強 Prompt 效果

| 指標 | 8B 泛用 | 8B 增強 | Haiku API |
|------|:-------:|:-------:|:---------:|
| 總耗時 | 6.9s | 10.1s | 85.4s |
| commit msg | 無 scope | 有 scope + 正確 type | context 汙染 |
| 評分具體性 | 泛泛 | 具體（引用程式碼問題）| 具體 |
| 分類正確性 | 錯誤 | 正確 + 附理由 | 正確 + 附理由 |

## 並行測試

- 串行 4 任務：1386ms
- 並行 4 任務：978ms（1.4x 加速）
- 真實 Phase B（長 prompt）：925ms

## 關鍵發現

1. Qwen3.5 系列的 thinking 無法可靠關閉：`/no_think` 只有 50% 成功率，`chat_template_kwargs: {enable_thinking: false}` 不被 vllm-mlx 支持
2. Qwen3.5 輸出 "Thinking Process:" 純文字（非 `<think>` 標籤），reasoning parser 無法處理
3. Qwen3-8B 無 thinking 問題，速度是 35B 的 14.6 倍
4. 增強 system prompt + few-shot 讓 8B 品質達到 Haiku 等級
5. LoRA 微調（1000 iterations, 411 samples）無法抑制 thinking 行為

## 最終決策

- 模型：Qwen3-8B-4bit（mlx-community/Qwen3-8B-4bit）
- LaunchAgent：com.nova-brain.vllm-mlx，開機自動啟動
- Phase B 收尾：從 56-131s 降到 ~1s
- 全程收尾（A+B+C+D）：~5s
