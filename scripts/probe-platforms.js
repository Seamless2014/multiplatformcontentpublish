/**
 * 真实平台编辑器探测：打开各平台发布页，检测 DOM 与登录态，截图存证
 * 用法：node scripts/probe-platforms.js
 * 前置：浏览器已以调试端口启动（node scripts/test-e2e.js 会自动拉起）
 */
const fs = require('fs');
const path = require('path');
const bm = require('../src/core/browser');
const adapters = require('../src/adapters');

const TARGETS = [
  { id: 'weixin', url: 'https://mp.weixin.qq.com/' },
  { id: 'toutiao', url: 'https://mp.toutiao.com/profile_v4/graphic/publish' },
  { id: 'zhihu', url: 'https://zhuanlan.zhihu.com/write' },
  { id: 'baijiahao', url: 'https://baijiahao.baidu.com/builder/rc/home' },
  { id: 'xiaohongshu', url: 'https://creator.xiaohongshu.com/publish/publish?source=official' },
];

async function main() {
  const shotDir = path.join(__dirname, '..', 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });

  await bm.connect();
  const ctx = bm.getContext();
  const report = [];

  for (const t of TARGETS) {
    const adapter = adapters[t.id];
    console.log(`\n----- ${adapter.meta.name} -----`);
    const row = { id: t.id, name: adapter.meta.name, url: t.url, result: null, screenshot: null };

    try {
      // 直接调用适配器自身的登录检测（测的就是真实逻辑）
      const res = await adapter.checkLogin(ctx);
      row.result = res;
      console.log(`  检测结果: ${res.ok ? 'PASS 已登录' : '未登录/未就绪'}`);
      console.log(`  说明: ${res.message}`);
    } catch (e) {
      row.result = { ok: false, message: e.message.split('\n')[0] };
      console.log(`  异常: ${row.result.message}`);
    }

    // 单独开页截图存证
    try {
      const p = await ctx.newPage();
      await p.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await p.waitForTimeout(4000);
      const shot = `probe-${t.id}.png`;
      await p.screenshot({ path: path.join(shotDir, shot) });
      row.screenshot = shot;
      console.log(`  页面: ${p.url()}`);
      console.log(`  截图: screenshots/${shot}`);
      await p.close();
    } catch (e) {
      console.log(`  截图失败: ${e.message.split('\n')[0]}`);
    }

    report.push(row);
  }

  const out = path.join(__dirname, '..', 'data', 'platform-probe.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\n报告已保存: ${out}`);

  const loggedIn = report.filter((r) => r.result && r.result.ok).length;
  console.log(`\n===== 汇总：${loggedIn}/${report.length} 个平台已登录 =====`);
  console.log(loggedIn === 0 ? '（当前为全新独立 profile，需在各平台登录后重跑）' : '');
}

main().then(() => process.exit(0)).catch((e) => { console.error('探测异常：', e.message); process.exit(1); });
