/**
 * 实地复查7：点击小红书草稿箱，监听草稿列表 API 响应
 */
const path = require('path');
const fs = require('fs');
const bm = require('../../src/core/browser');
const KEY = '多平台发布器实测走查';

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const out = [];
  const log = (m) => { out.push(m); console.log(m); };

  const page = await ctx.newPage();
  const apiBodies = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (/draft|galaxy/.test(u) && res.request().method() !== 'OPTIONS') {
      let body = '';
      try { body = await res.text(); } catch { body = '(body 读取失败)'; }
      apiBodies.push({ url: u.slice(0, 120), status: res.status(), body: body.slice(0, 1500) });
    }
  });

  try {
    await page.goto('https://creator.xiaohongshu.com/publish/publish?source=official', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(5000);
    apiBodies.length = 0; // 只看点击后的请求

    const box = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => {
        const t = (e.textContent || '').trim();
        return /^草稿箱\s*\(\d+\)$/.test(t) && e.getBoundingClientRect().width > 0 && e.children.length <= 3;
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    log('按钮坐标: ' + JSON.stringify(box));
    if (box) {
      await page.mouse.click(box.x, box.y);
      await page.waitForTimeout(4000);
    }
    log('捕获 API 响应 ' + apiBodies.length + ' 个:');
    for (const b of apiBodies) {
      log(`\n[${b.status}] ${b.url}`);
      const hasKey = b.body.includes(encodeURIComponent(KEY)) || b.body.includes(KEY);
      log('  含标题关键字: ' + hasKey);
      log('  body: ' + b.body.slice(0, 600).replace(/\s+/g, ' '));
    }
    await page.screenshot({ path: path.join(__dirname, '../../screenshots/verify-xhs-draft5.png') });
  } catch (e) { log('异常: ' + e.message.split('\n')[0]); }
  finally {
    fs.writeFileSync(path.join(__dirname, 'verify-drafts7.out.txt'), out.join('\n'));
    await page.close().catch(() => {});
    bm.disconnect().catch(() => {});
    process.exit(0);
  }
})();
