/**
 * 探测8：dump .search-warp 结构 + 走通选吧→填标题→填正文→图片全流程
 */
const path = require('path');
const fs = require('fs');
const bm = require('../../src/core/browser');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const out = [];
  const log = (m) => { out.push(m); console.log(m); };

  try {
    await page.goto('https://tieba.baidu.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    const homeBtn = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.add-post, [class*="add-post"], [class*="add-btn"]')]
        .find((e) => (e.textContent || '').includes('发贴'));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(homeBtn.x, homeBtn.y);
    await page.waitForTimeout(3500);

    // dump search-warp
    const sw = await page.evaluate(() => {
      const el = document.querySelector('.search-warp');
      return el ? el.outerHTML.slice(0, 2000) : '(none)';
    });
    log('search-warp HTML:\n' + sw);

    // 找 search-warp 里的 input 并点击
    const inpInfo = await page.evaluate(() => {
      const el = document.querySelector('.search-warp input');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { ph: el.placeholder, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    log('search input: ' + JSON.stringify(inpInfo));
    if (!inpInfo) throw new Error('no input');
    await page.mouse.click(inpInfo.x, inpInfo.y);
    await page.waitForTimeout(1000);
    await page.keyboard.type('软件吧', { delay: 120 });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(__dirname, '../../screenshots/probe-tieba-fa8-typed.png') });

    // dump 联想列表
    const sugg = await page.evaluate(() => {
      const sw = document.querySelector('.search-warp');
      if (!sw) return '(none)';
      // 找兄弟或子级的下拉
      const parent = sw.parentElement;
      const lists = [...parent.querySelectorAll('[class*="search-list"], [class*="list"], li, [class*="option"]')]
        .filter((e) => e.getBoundingClientRect().height > 0)
        .slice(0, 10)
        .map((e) => ({ t: (e.textContent || '').trim().slice(0, 40), cls: String(e.className).slice(0, 50), h: Math.round(e.getBoundingClientRect().height) }));
      return JSON.stringify(lists, null, 2);
    });
    log('联想列表:\n' + sugg);
  } catch (e) {
    log('异常: ' + e.message.split('\n')[0]);
  } finally {
    fs.writeFileSync(path.join(__dirname, 'probe-tieba-fa8.out.txt'), out.join('\n'));
    await page.close().catch(() => {});
    bm.disconnect().catch(() => {});
    process.exit(0);
  }
})();
