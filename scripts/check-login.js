/**
 * 登录态快速巡检：连接浏览器，检查各平台登录状态并汇总
 * 用法：node scripts/check-login.js
 */
const bm = require('../src/core/browser');
const adapters = require('../src/adapters');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();

  console.log('=== 当前打开的页面 ===');
  const pages = ctx.pages();
  pages.forEach((p) => console.log('  ' + p.url().slice(0, 120)));

  console.log('\n=== 各平台登录态 ===');
  const rows = [];
  for (const [id, adapter] of Object.entries(adapters)) {
    try {
      const r = await adapter.checkLogin(ctx);
      rows.push({ name: adapter.meta.name, ok: r.ok, msg: r.message });
      console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${adapter.meta.name}：${r.message}`);
    } catch (e) {
      rows.push({ name: adapter.meta.name, ok: false, msg: e.message });
      console.log(`  FAIL  ${adapter.meta.name}：${e.message.split('\n')[0]}`);
    }
  }

  const okCount = rows.filter((r) => r.ok).length;
  console.log(`\n===== ${okCount}/${rows.length} 个平台已登录 =====`);
  process.exit(0);
})().catch((e) => { console.error('巡检异常：', e.message); process.exit(1); });
