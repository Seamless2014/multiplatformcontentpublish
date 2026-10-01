/**
 * 探测7：全面 dump 发贴弹窗 DOM
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
    log('homeBtn: ' + JSON.stringify(homeBtn));
    await page.mouse.click(homeBtn.x, homeBtn.y);
    await page.waitForTimeout(3500);

    const st = await page.evaluate(() => {
      const ql = document.querySelectorAll('.ql-editor').length;
      // 弹窗容器：fixed 定位的大块
      const dlg = [...document.querySelectorAll('body *')]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 400 && r.height > 300 && (getComputedStyle(e).position === 'fixed' || getComputedStyle(e).position === 'absolute') && (e.textContent || '').includes('发布到吧'); })
        .map((e) => ({ tag: e.tagName, cls: String(e.className).slice(0, 80) }));
      // 含「吧」的可见短文本元素
      const baTexts = [...document.querySelectorAll('body *')]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (e.textContent || '').trim().match(/选择吧|发布到吧/) && (e.textContent || '').trim().length < 30 && e.children.length <= 3; })
        .slice(0, 8)
        .map((e) => ({ tag: e.tagName, cls: String(e.className).slice(0, 70), t: (e.textContent || '').trim().slice(0, 20), html: e.outerHTML.slice(0, 150) }));
      return { ql, dlg, baTexts };
    });
    log('弹窗状态: ' + JSON.stringify(st, null, 2));
    await page.screenshot({ path: path.join(__dirname, '../../screenshots/probe-tieba-fa7.png') });
  } catch (e) {
    log('异常: ' + e.message.split('\n')[0]);
  } finally {
    fs.writeFileSync(path.join(__dirname, 'probe-tieba-fa7.out.txt'), out.join('\n'));
    await page.close().catch(() => {});
    bm.disconnect().catch(() => {});
    process.exit(0);
  }
})();
