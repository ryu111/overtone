'use strict';
/**
 * grader.js — Model Grader（已重構為 Agent）
 *
 * Grader 功能已改為 Claude Code subagent（agents/grader.md）。
 * 由 Main Agent 透過 Task 工具委派，使用 claude-haiku-4-5-20251001。
 * 不再需要 ANTHROPIC_API_KEY。
 *
 * 觸發方式：SubagentStop hook 在 result 非 fail 時，
 *           在 systemMessage 中提示 Main Agent 委派 grader。
 */

module.exports = {};
