'use strict';
/**
 * system-info.js — macOS 系統資訊查詢
 *
 * 提供 CPU 使用率、記憶體資訊、磁碟資訊、網路介面資訊四種查詢功能。
 * 僅支援 macOS（darwin），其他平台回傳 UNSUPPORTED_PLATFORM。
 * 不 throw — 所有錯誤以 { ok: false, error, message } 回傳。
 *
 * 依賴注入：最後一個參數 _deps = { execSync } 供測試替換。
 */

const { execSync: defaultExecSync } = require('child_process');

// 統一 response 建構工具
function ok(fields) {
  return { ok: true, ...fields };
}

function fail(error, message) {
  return { ok: false, error, message };
}

/**
 * 解析人類可讀的磁碟大小字串（如 500G、250G、200M）為 GB
 * @param {string} sizeStr - 如 "500G", "250M", "1.5T", "512K"
 * @returns {number} GB 數值
 */
function parseSizeToGB(sizeStr) {
  const str = String(sizeStr).trim();
  const num = parseFloat(str);
  const unit = str.replace(/[\d.]/g, '').trim().toUpperCase();

  switch (unit) {
    case 'K': return num / (1024 * 1024);
    case 'M': return num / 1024;
    case 'G': return num;
    case 'T': return num * 1024;
    default:  return num;
  }
}

// ── CPU 使用率查詢 ──

/**
 * 取得 CPU 使用率資訊
 * 使用 `top -l 1 -s 0` 取得即時快照
 *
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true, cpu: { user: number, sys: number, idle: number } }
 *           |{ ok: false, error: string, message: string }}
 */
function getCpuUsage(_deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  const execSync = _deps.execSync || defaultExecSync;

  let output;
  try {
    output = execSync('top -l 1 -s 0', { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    return fail('COMMAND_FAILED', `top 指令失敗：${err.message}`);
  }

  const match = output.match(
    /CPU usage:\s+([\d.]+)%\s+user,\s+([\d.]+)%\s+sys,\s+([\d.]+)%\s+idle/
  );
  if (!match) {
    return fail('PARSE_ERROR', 'top 輸出格式異常，無法解析 CPU 使用率');
  }

  return ok({
    cpu: {
      user: parseFloat(match[1]),
      sys:  parseFloat(match[2]),
      idle: parseFloat(match[3]),
    },
  });
}

// ── 記憶體資訊查詢 ──

/**
 * 取得記憶體資訊
 * 使用 `sysctl -n hw.memsize` 取得總記憶體，`vm_stat` 取得頁面統計
 *
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true, memory: { totalMB: number, freeMB: number, wiredMB: number, activeMB: number, inactiveMB: number } }
 *           |{ ok: false, error: string, message: string }}
 */
function getMemoryInfo(_deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  const execSync = _deps.execSync || defaultExecSync;
  const PAGE_SIZE = 4096;
  const MB = 1048576;

  // 取得總記憶體（bytes）
  let memsizeOutput;
  try {
    memsizeOutput = execSync('sysctl -n hw.memsize', { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    return fail('COMMAND_FAILED', `sysctl 指令失敗：${err.message}`);
  }

  const totalBytes = parseInt(memsizeOutput.trim(), 10);
  if (isNaN(totalBytes) || totalBytes <= 0) {
    return fail('PARSE_ERROR', 'sysctl 輸出格式異常，無法解析總記憶體');
  }
  const totalMB = totalBytes / MB;

  // 取得頁面統計
  let vmStatOutput;
  try {
    vmStatOutput = execSync('vm_stat', { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    return fail('COMMAND_FAILED', `vm_stat 指令失敗：${err.message}`);
  }

  // 使用 regex 關鍵詞匹配，不依賴固定行號
  // 注意：vm_stat 的數字後面可能有 "."（如 "Pages free:  18311."），用 parseInt 自動忽略
  const freeMatch     = vmStatOutput.match(/Pages free:\s+(\d+)/);
  const wiredMatch    = vmStatOutput.match(/Pages wired down:\s+(\d+)/);
  const activeMatch   = vmStatOutput.match(/Pages active:\s+(\d+)/);
  const inactiveMatch = vmStatOutput.match(/Pages inactive:\s+(\d+)/);

  if (!freeMatch || !wiredMatch || !activeMatch || !inactiveMatch) {
    return fail('PARSE_ERROR', 'vm_stat 輸出格式異常，無法解析記憶體頁面統計');
  }

  const toMB = pages => (parseInt(pages, 10) * PAGE_SIZE) / MB;

  return ok({
    memory: {
      totalMB,
      freeMB:     toMB(freeMatch[1]),
      wiredMB:    toMB(wiredMatch[1]),
      activeMB:   toMB(activeMatch[1]),
      inactiveMB: toMB(inactiveMatch[1]),
    },
  });
}

// ── 磁碟資訊查詢 ──

/**
 * 取得磁碟資訊
 * 使用 `df -H {mountPoint}` 取得指定掛載點的磁碟使用資訊
 *
 * @param {string} [mountPoint='/'] - 要查詢的掛載點
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true, disks: DiskInfo[] }
 *           |{ ok: false, error: string, message: string }}
 */
function getDiskInfo(mountPoint = '/', _deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  const execSync = _deps.execSync || defaultExecSync;

  let output;
  try {
    output = execSync(`df -H ${mountPoint}`, { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    return fail('COMMAND_FAILED', `df 指令失敗：${err.message}`);
  }

  try {
    const lines = output.trim().split('\n');
    // 跳過 header 行（第一行）
    const dataLines = lines.slice(1).filter(line => line.trim() !== '');

    if (dataLines.length === 0) {
      return fail('PARSE_ERROR', 'df 輸出無資料行（只有 header 或空白）');
    }

    const disks = dataLines.map(line => {
      // df -H 格式：Filesystem Size Used Avail Capacity Mounted on
      // "Mounted on" 可能包含空格，取前 6 欄後，其餘為 mountPoint
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) {
        throw new Error(`無法解析磁碟資訊行：${line}`);
      }
      const device       = parts[0];
      const totalGB      = parseSizeToGB(parts[1]);
      const usedGB       = parseSizeToGB(parts[2]);
      const availableGB  = parseSizeToGB(parts[3]);
      // Capacity 欄位格式如 "56%"
      const usedPercent  = parseInt(parts[4], 10);
      // Mounted on 可能是多個 token
      const mount        = parts.slice(5).join(' ');

      return { device, mountPoint: mount, totalGB, usedGB, availableGB, usedPercent };
    });

    return ok({ disks });
  } catch (err) {
    return fail('PARSE_ERROR', `df 輸出解析失敗：${err.message}`);
  }
}

// ── 網路介面資訊查詢 ──

/**
 * 取得網路介面資訊
 * 使用 `ifconfig` 取得所有網路介面的狀態和 IP 地址
 *
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true, interfaces: NetworkInterface[] }
 *           |{ ok: false, error: string, message: string }}
 */
function getNetworkInfo(_deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  const execSync = _deps.execSync || defaultExecSync;

  let output;
  try {
    output = execSync('ifconfig', { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    return fail('COMMAND_FAILED', `ifconfig 指令失敗：${err.message}`);
  }

  if (!output || !output.trim()) {
    return fail('PARSE_ERROR', 'ifconfig 回傳空輸出，無法解析網路介面');
  }

  // 依介面區塊分割（以 "interfaceName:" 開頭的行）
  const interfacePattern = /^(\w[\w.]*\d*):/gm;
  const interfaces = [];
  let match;
  const blockStarts = [];

  while ((match = interfacePattern.exec(output)) !== null) {
    blockStarts.push({ name: match[1], index: match.index });
  }

  if (blockStarts.length === 0) {
    return fail('PARSE_ERROR', 'ifconfig 輸出格式異常，無法解析任何介面');
  }

  for (let i = 0; i < blockStarts.length; i++) {
    const { name, index } = blockStarts[i];
    const end = i + 1 < blockStarts.length ? blockStarts[i + 1].index : output.length;
    const block = output.slice(index, end);

    // 解析 status
    let status = 'unknown';
    const statusMatch = block.match(/\tstatus:\s+(\S+)/);
    if (statusMatch) {
      const s = statusMatch[1].toLowerCase();
      if (s === 'active') status = 'active';
      else if (s === 'inactive') status = 'inactive';
      else status = 'unknown';
    }

    // 解析 IPv4（inet 後面的地址）
    const ipv4Match = block.match(/\tinet\s+([\d.]+)/);
    const ipv4 = ipv4Match ? ipv4Match[1] : undefined;

    // 解析 IPv6（inet6 後面的地址）
    const ipv6Match = block.match(/\tinet6\s+([a-fA-F0-9:]+(?:%\S*)?)/);
    const ipv6 = ipv6Match ? ipv6Match[1] : undefined;

    const iface = { name, status };
    if (ipv4 !== undefined) iface.ipv4 = ipv4;
    if (ipv6 !== undefined) iface.ipv6 = ipv6;

    interfaces.push(iface);
  }

  if (interfaces.length === 0) {
    return fail('PARSE_ERROR', 'ifconfig 輸出格式異常，無法解析任何介面');
  }

  return ok({ interfaces });
}

module.exports = {
  getCpuUsage,
  getMemoryInfo,
  getDiskInfo,
  getNetworkInfo,
};
