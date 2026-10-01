/**
 * 探测9：精确复现适配器 waitFor 行为，打印耗时与真实异常
 */
const path = require('path');
const fs = require('fs');
const bm = require('../../src/core/browser');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const out = [];
  const log = (m) => { out.push(m); console.log(m); };

  try {
    log('打开首页');
    await page.goto('https://tieba.baidu.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    const addBtn = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.add-post, [class*="add-post"], [class*="add-btn"]')]
        .find((e) => (e.textContent || '').includes('发贴'));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    log('addBtn: ' + JSON.stringify(addBtn));
    await page.mouse.click(addBtn.x, addBtn.y);
    log('已点击: ' + new Date().toISOString());

    const t0 = Date.now();
    const editorReady = await page.locator('.ql-editor[data-placeholder*="标题"]')
      .waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch((e) => { log('waitFor 异常: ' + e.message.split('\n')[0]); return false; });
    log(`waitFor 结果=${editorReady} 耗时=${Date.now() - t0}ms`);

    // 无论成败，dump ql-editor 实况
    const dump = await page.evaluate(() => {
      return [...document.querySelectorAll('.ql-editor')].map((e) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return { ph: e.dataset.placeholder || '', w: Math.round(r.width), h: Math.round(r.height), disp: cs.display, vis: cs.visibility };
      });
    });
    log('ql-editor 实况: ' + JSON.stringify(dump, null, 2));
    await page.screenshot({ path: path.join(__dirname, '../../screenshots/probe-tieba-fa9.png') });
  } catch (e) {
    log('异常: ' + e.message.split('\n')[0]);
  } finally {
    fs.writeFileSync(path.join(__dirname, 'probe-tieba-fa9.out.txt'), out.join('\n'));
    await page.close().catch(() => {});
    bm.disconnect().catch(() => {});
    process.exit(0);
  }
})();
