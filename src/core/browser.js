/**
 * CDP 浏览器连接管理
 *
 * 通过 Chrome DevTools Protocol 直连用户日常浏览器（已登录各平台）。
 * 浏览器必须以 --remote-debugging-port=9222 启动。
 * 注意：Chrome/Edge 已在运行时再带该参数启动是无效的（会复用已有实例），
 * 必须先完全退出浏览器，再由 launchBrowser() 拉起。
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SHOT_DIR = path.join(__dirname, '..', '..', 'screenshots');
const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';

let conn = null; // { browser, context, connectedAt }

/** 探测调试端口是否有浏览器在监听 */
async function probeCdp(cdpUrl = CDP_URL) {
  try {
    const res = await fetch(`${cdpUrl}/json/version`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    return await res.json(); // { Browser, webSocketDebuggerUrl, ... }
  } catch {
    return null;
  }
}

async function connect(cdpUrl = CDP_URL) {
  const info = await probeCdp(cdpUrl);
  if (!info) {
    throw new Error(`无法连接 ${cdpUrl} —— 请先以调试端口启动浏览器（可点“拉起浏览器”按钮）`);
  }
  if (conn && conn.cdpUrl === cdpUrl) return status();
  if (conn) { try { await conn.browser.close(); } catch {} conn = null; }

  const browser = await chromium.connectOverCDP(cdpUrl, { timeout: 15000 });
  const context = browser.contexts()[0] || (await browser.newContext());
  conn = { browser, context, cdpUrl, connectedAt: new Date().toISOString(), separateProfile: false };
  return status();
}

function getContext() {
  if (!conn) throw new Error('浏览器未连接');
  // 连接健康检查：浏览器被手动关闭后 conn.browser 会处于断开状态，
  // 此时应清理连接并提示重连，而不是让后续操作抛出难懂的协议错误
  if (!conn.browser.isConnected()) {
    conn = null;
    throw new Error('浏览器连接已断开（浏览器可能被关闭），请重新点「连接浏览器」');
  }
  return conn.context;
}

function isConnected() {
  return !!conn;
}

async function disconnect() {
  if (conn) { try { await conn.browser.close(); } catch {} conn = null; }
}

async function status() {
  const info = await probeCdp();
  return {
    cdpUrl: CDP_URL,
    portOpen: !!info,
    browser: info ? info.Browser : null,
    connected: isConnected(),
    connectedAt: conn ? conn.connectedAt : null,
  };
}

/** 列出所有进程命令行（用于精确诊断调试端口） */
function listBrowserProcesses() {
  try {
    const out = execSync('wmic process where "name=\'chrome.exe\' or name=\'msedge.exe\'" get name,commandline /format:csv',
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const lines = out.split('\n').filter((l) => l.includes('.exe'));
    return lines.map((l) => {
      const parts = l.trim().split(',');
      const cmd = parts.slice(1).join(',');
      return {
        name: (parts[0] || '').trim(),
        hasDebugPort: /--remote-debugging-port/.test(cmd),
        userDataDir: (cmd.match(/--user-data-dir=(?:"([^"]+)"|([^ ]+))/) || [])[1] || (cmd.match(/--user-data-dir=(?:"([^"]+)"|([^ ]+))/) || [])[2] || '(默认)',
      };
    });
  } catch {
    return [];
  }
}

/** 完整诊断：给"连接失败"提供可读原因，而不是让用户猜 */
async function diagnose() {
  const info = await probeCdp();
  const procs = listBrowserProcesses();
  const chromeRunning = procs.filter((p) => p.name === 'chrome.exe').length;
  const edgeRunning = procs.filter((p) => p.name === 'msedge.exe').length;
  const withDebug = procs.filter((p) => p.hasDebugPort);

  let verdict;
  if (info) {
    verdict = { level: 'ok', text: `调试端口正常（${info.Browser}），可以直接连接` };
  } else if (withDebug.length) {
    verdict = { level: 'warn', text: '有进程带调试参数但端口未响应，可能启动未完成或端口被占用，请稍等几秒重试' };
  } else if (chromeRunning) {
    verdict = {
      level: 'block',
      text: `检测到 ${chromeRunning} 个 Chrome 进程正在运行且未开调试端口。`
        + 'Chrome 单实例机制会丢弃新实例的调试参数，所以直接拉起无效。'
        + '两种解法：① 完全退出 Chrome（含托盘图标）后拉起；'
        + '② 用「独立 profile」方式启动一个不受影响的专用浏览器（推荐，无需关闭当前 Chrome）',
    };
  } else {
    verdict = { level: 'ready', text: '未检测到运行中的 Chrome，可直接拉起' };
  }

  return {
    cdpUrl: CDP_URL,
    portOpen: !!info,
    browser: info ? info.Browser : null,
    connected: isConnected(),
    chromeRunning,
    edgeRunning,
    processesWithDebugPort: withDebug.map((p) => `${p.name} → ${p.userDataDir}`),
    usingSeparateProfile: !!(conn && conn.separateProfile),
    verdict,
  };
}

/**
 * 拉起带调试端口的浏览器
 * @param {'chrome'|'edge'} kind 浏览器类型
 * @param {'current'|'separate'} profileMode
 *   - current ：复用日常 profile（需先完全退出该浏览器，登录态直接可用）
 *   - separate：独立 profile（不干扰正在运行的浏览器，首次需在该窗口内登录各平台）
 */
async function launchBrowser(kind = 'chrome', profileMode = 'separate') {
  const open = await probeCdp();
  if (open) return { ok: true, message: '调试端口已在监听，无需重复拉起' };

  const local = process.env.LOCALAPPDATA || '';
  const cfg = kind === 'edge'
    ? {
        exes: [
          'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
          'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        ],
        proc: 'msedge.exe',
        defaultData: `${local}\\Microsoft\\Edge\\User Data`,
        sepData: `${DATA_DIR}\\browser-profile\\edge`,
      }
    : {
        exes: [
          'C:/Program Files/Google/Chrome/Application/chrome.exe',
          'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
          local ? `${local}/Google/Chrome/Application/chrome.exe` : null,
        ].filter(Boolean),
        proc: 'chrome.exe',
        defaultData: `${local}\\Google\\Chrome\\User Data`,
        sepData: `${DATA_DIR}\\browser-profile\\chrome`,
      };

  const exe = cfg.exes.find((p) => fs.existsSync(p));
  if (!exe) return { ok: false, message: `未找到 ${kind} 安装路径，请手动启动浏览器并加 --remote-debugging-port=9222 --user-data-dir="自定义目录"` };

  let userDataDir = cfg.defaultData;
  let separate = false;

  if (profileMode === 'separate') {
    userDataDir = cfg.sepData;
    separate = true;
    fs.mkdirSync(userDataDir, { recursive: true });
    // 清理上次遗留的锁文件：Chrome 见到残留锁会认为 profile 被占用而直接退出，
    // 这正是「点了拉起浏览器但端口始终不开」的常见原因
    for (const lock of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']) {
      const f = path.join(userDataDir, lock);
      try { if (fs.existsSync(f) || fs.lstatSync(f).isSymbolicLink()) fs.rmSync(f, { force: true }); } catch { /* 忽略 */ }
    }
    // 顺带清掉可能存在的崩溃恢复标记，避免启动时弹恢复提示
    try { fs.rmSync(path.join(userDataDir, 'Default', 'Current Session'), { force: true }); } catch { /* 忽略 */ }
  } else {
    // current 模式：该浏览器必须在运行中就失败
    const running = listBrowserProcesses().some((p) => p.name === cfg.proc);
    if (running) {
      return {
        ok: false,
        needExit: true,
        message: `检测到 ${cfg.proc} 正在运行。复用日常 profile 必须先完全退出浏览器（含托盘图标）；`
          + '或改用「独立 profile」模式启动（无需退出）。',
      };
    }
  }

  // Windows 上 detached 不足以保证子进程存活（父进程退出后会被一起清理），
  // 必须 unref + 完全分离 stdio；这里用 spawn 的 windowsHide 并保持 stdio 全 ignore。
  const child = spawn(exe, [
    '--remote-debugging-port=9222',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    separate ? '--new-window' : '--restore-last-session=true',
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();

  // 等待端口真正就绪（最多 20 秒）
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const ok = await probeCdp();
    if (ok) {
      return {
        ok: true,
        separate,
        pid: child.pid,
        message: separate
          ? `${kind} 已用独立 profile 启动（PID ${child.pid}），调试端口就绪。该窗口与你的日常浏览器互不影响，请在它里面登录各平台账号。`
          : `${kind} 已复用日常 profile 启动（PID ${child.pid}），调试端口就绪，登录态可直接使用。`,
      };
    }
    // 进程已退出则提前报错，不用等满 20 秒
    if (child.exitCode !== null) {
      return {
        ok: false,
        message: `浏览器进程启动后立即退出（退出码 ${child.exitCode}）。`
          + '常见原因：同 profile 已有实例在运行，或安全软件拦截了调试端口。',
      };
    }
  }
  return { ok: false, message: '已启动浏览器但调试端口 20 秒内未就绪，请检查是否被安全软件拦截' };
}

/** 保存失败截图 */
async function shot(page, name) {
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const file = path.join(SHOT_DIR, `${Date.now()}-${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    return path.basename(file);
  } catch { return null; }
}

module.exports = { connect, disconnect, status, diagnose, getContext, isConnected, launchBrowser, probeCdp, shot, CDP_URL };
