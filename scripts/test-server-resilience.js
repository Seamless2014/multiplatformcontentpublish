/**
 * 服务级健壮性验证：通过 HTTP 触发「浏览器已关闭」场景，确认服务不崩
 * 用法：node scripts/test-server-resilience.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE = 'http://localhost:8800';
const CDP_TEST = 'http://127.0.0.1:9333';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let failures = 0;
const check = (name, pass, detail) => {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —— ' + detail : ''}`);
  if (!pass) failures++;
};

const j = async (url, opts) => {
  const r = await fetch(url, opts);
  let body;
  try { body = await r.json(); } catch { body = {}; }
  return { status: r.status, body };
};

async function main() {
  console.log('===== 步骤1：服务存活检查 =====');
  const s0 = await j(`${BASE}/api/status`).catch(() => null);
  check('服务在运行', !!s0 && s0.status === 200, s0 ? JSON.stringify(s0.body) : '无法连接');

  console.log('\n===== 步骤2：启动独立测试浏览器（端口 9333）=====');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srv-test-'));
  const child = spawn(CHROME, ['--remote-debugging-port=9333', `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank'], { detached: true, stdio: 'ignore' });

  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`${CDP_TEST}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) { ready = true; break; }
    } catch { /* retry */ }
  }
  check('测试浏览器端口就绪', ready);
  if (!ready) process.exit(1);

  console.log('\n===== 步骤3：连接该浏览器 =====');
  const c = await j(`${BASE}/api/connect`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cdpUrl: CDP_TEST }),
  });
  check('连接成功', c.status === 200 && c.body.connected === true, JSON.stringify(c.body));

  console.log('\n===== 步骤4：关闭浏览器后调用 check-login（原崩溃路径）=====');
  try { process.kill(child.pid); } catch { /* ignore */ }
  await new Promise((r) => setTimeout(r, 3000));

  const cl = await j(`${BASE}/api/check-login`).catch((e) => ({ status: 0, body: { error: e.message } }));
  console.log(`    响应: HTTP ${cl.status} ${JSON.stringify(cl.body).slice(0, 160)}`);
  check('未返回 500（连接断开应视为客户端状态问题）', cl.status === 400, `实际 ${cl.status}`);
  check('标记需重连', cl.body.needReconnect === true, String(cl.body.needReconnect));
  check('返回了可读信息', !!(cl.body.error || cl.body.weixin), cl.body.error || '各平台返回了结果对象');

  console.log('\n===== 步骤5：服务是否仍然存活（关键）=====');
  const s1 = await j(`${BASE}/api/status`).catch(() => null);
  check('服务进程未退出', !!s1 && s1.status === 200, s1 ? `status=${s1.status}` : '服务已不可达（崩溃）');

  console.log('\n===== 步骤6：再次调用 publish 接口 =====');
  const p = await j(`${BASE}/api/publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '测试标题abc', content: '测试正文内容', platforms: ['zhihu'], mode: 'draft' }),
  }).catch((e) => ({ status: 0, body: { error: e.message } }));
  console.log(`    响应: HTTP ${p.status} ${JSON.stringify(p.body).slice(0, 160)}`);
  check('发布接口未导致崩溃', p.status !== 500 || !!p.body.error);
  check('给出明确的未连接/断开提示', !!(p.body.error && /未连接|断开/.test(p.body.error)), p.body.error || '(无)');

  console.log('\n===== 步骤7：最终存活确认 =====');
  const s2 = await j(`${BASE}/api/status`).catch(() => null);
  check('服务最终仍存活', !!s2 && s2.status === 200, s2 ? 'OK' : '服务不可达');

  // 清理
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }

  console.log(`\n===== 结果：${failures === 0 ? '全部通过 ✅ 服务具备抗崩溃能力' : failures + ' 项失败 ❌'} =====`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('测试异常：', e); process.exit(1); });
