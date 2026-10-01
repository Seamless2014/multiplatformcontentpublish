/**
 * 健壮性测试：模拟浏览器异常关闭，验证服务不会崩溃
 * 用法：node scripts/test-resilience.js
 *
 * 复现场景（这是真实发生过的崩溃）：
 *   browserContext.newPage: Protocol error (Target.createTarget): Failed to open a new tab
 *   → 未捕获异常 → Node 进程直接退出
 */
const { chromium } = require('playwright-core');
const { BasePublisher } = require('../src/adapters/base');

let failures = 0;
const check = (name, pass, detail) => {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —— ' + detail : ''}`);
  if (!pass) failures++;
};

async function main() {
  console.log('===== 场景1：浏览器已关闭时调用 checkLogin =====');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext();
  const inst = Object.create(BasePublisher.prototype);
  Object.defineProperty(inst, 'meta', { get: () => ({ id: 'test', name: '测试', homeUrl: 'about:blank' }) });
  inst.doCheckLogin = async () => ({ ok: true, message: 'ok' });

  await browser.close(); // 模拟浏览器被关闭

  let threw = false;
  let result = null;
  try {
    result = await inst.checkLogin(ctx);
  } catch (e) {
    threw = true;
    result = { message: e.message };
  }
  check('checkLogin 未抛出异常（返回结果对象）', !threw, threw ? result.message : `返回 ${JSON.stringify(result)}`);
  check('checkLogin 返回 ok:false 且有可读信息', result && result.ok === false && !!result.message, result && result.message);

  console.log('\n===== 场景2：浏览器已关闭时调用 publish =====');
  const browser2 = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx2 = await browser2.newContext();
  const inst2 = Object.create(BasePublisher.prototype);
  Object.defineProperty(inst2, 'meta', { get: () => ({ id: 'test2', name: '测试2', homeUrl: 'about:blank', inlineImages: false }) });
  inst2.doPublish = async () => ({ ok: true, message: 'ok' });

  await browser2.close();

  let threw2 = false;
  let result2 = null;
  try {
    result2 = await inst2.publish(ctx2, { title: 't', content: 'c', images: [] }, 'draft');
  } catch (e) {
    threw2 = true;
    result2 = { message: e.message };
  }
  check('publish 未抛出异常', !threw2, threw2 ? result2.message : `返回 ${JSON.stringify(result2)}`);
  check('publish 返回 ok:false 且有可读信息', result2 && result2.ok === false && !!result2.message, result2 && result2.message);

  console.log('\n===== 场景3：getContext 检测到断连后清理连接 =====');
  // 用真实 CDP 连接测（启动一个带调试端口的浏览器）
  const { spawn } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-test-'));
  const child = spawn(exe, ['--remote-debugging-port=9333', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', 'about:blank'],
    { detached: true, stdio: 'ignore' });

  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch('http://127.0.0.1:9333/json/version', { signal: AbortSignal.timeout(1500) });
      if (res.ok) { ready = true; break; }
    } catch { /* retry */ }
  }
  check('测试用浏览器端口就绪', ready);

  if (ready) {
    const bm = require('../src/core/browser');
    await bm.connect('http://127.0.0.1:9333');
    let gotContext = false;
    try { bm.getContext(); gotContext = true; } catch { gotContext = false; }
    check('连接后 getContext 可用', gotContext);

    // 杀掉浏览器
    try { process.kill(child.pid); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 2500));

    let errMsg = '';
    try { bm.getContext(); } catch (e) { errMsg = e.message; }
    check('浏览器关闭后 getContext 抛可读错误', /断开|未连接/.test(errMsg), errMsg || '未抛错（可能仍显示已连接）');

    // 再调一次确认连接已清理
    let secondMsg = '';
    try { bm.getContext(); } catch (e) { secondMsg = e.message; }
    check('连接状态已清理（第二次仍报未连接）', /未连接|断开/.test(secondMsg), secondMsg);
  }

  console.log(`\n===== 结果：${failures === 0 ? '全部通过 ✅' : failures + ' 项失败 ❌'} =====`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('测试异常：', e); process.exit(1); });
