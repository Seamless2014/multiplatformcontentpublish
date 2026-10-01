/**
 * 探测：软件吧点「发贴」后编辑器为何未出现
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
    log('打开软件吧');
    await page.goto('https://tieba.baidu.com/f?kw=' + encodeURIComponent('软件吧'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    log('URL: ' + page.url());

    // 监听新 tab
    ctx.on('page', (p) => log('!! 新标签页打开: ' + p.url()));

    const addBtn = await page.evaluate(() => {
      const el = document.querySelector('.add-post');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        x: r.x + r.width / 2, y: r.y + r.height / 2,
        topAtPoint: top ? top.tagName + '.' + String(top.className).slice(0, 50) : null,
        text: (el.textContent || '').trim(),
      };
    });
    log('add-post: ' + JSON.stringify(addBtn));
    if (!addBtn) throw new Error('no add-post');

    await page.mouse.click(addBtn.x, addBtn.y);
    log('已点击，等待 2s');
    await page.waitForTimeout(2000);
    log('URL after 2s: ' + page.url());
    await page.screenshot({ path: path.join(__dirname, '../../screenshots/probe-tieba-fa-2s.png') });

    // DOM 检查：弹窗 / 编辑器 / iframe
    const st1 = await page.evaluate(() => ({
      qlEditors: document.querySelectorAll('.ql-editor').length,
      qlPlaceholder: [...document.querySelectorAll('.ql-editor')].map((e) => e.dataset.placeholder || ''),
      dialogs: [...document.querySelectorAll('[class*="dialog"],[class*="modal"],[class*="drawer"],[class*="pop"]')]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 200 && r.height > 100 && getComputedStyle(e).display !== 'none'; })
        .slice(0, 5)
        .map((e) => e.tagName + '.' + String(e.className).slice(0, 60)),
      iframes: [...document.querySelectorAll('iframe')].map((f) => f.src.slice(0, 80)),
    }));
    log('2s 时 DOM: ' + JSON.stringify(st1, null, 2));

    await page.waitForTimeout(4000);
    log('URL after 6s: ' + page.url());
    const st2 = await page.evaluate(() => ({
      qlEditors: document.querySelectorAll('.ql-editor').length,
      qlPlaceholder: [...document.querySelectorAll('.ql-editor')].map((e) => e.dataset.placeholder || ''),
    }));
    log('6s 时 ql-editor: ' + JSON.stringify(st2));
    await page.screenshot({ path: path.join(__dirname, '../../screenshots/probe-tieba-fa-6s.png') });

    // 若还没弹，再点一次（有的吧第一次点击只是聚焦）
    if (st2.qlEditors === 0) {
      log('编辑器未出现，重试点击一次');
      await page.mouse.click(addBtn.x, addBtn.y);
      await page.waitForTimeout(4000);
      const st3 = await page.evaluate(() => ({
        qlEditors: document.querySelectorAll('.ql-editor').length,
        qlPlaceholder: [...document.querySelectorAll('.ql-editor')].map((e) => e.dataset.placeholder || ''),
      }));
      log('重试后 ql-editor: ' + JSON.stringify(st3));
      log('URL after retry: ' + page.url());
      await page.screenshot({ path: path.join(__dirname, '../../screenshots/probe-tieba-fa-retry.png') });
    }
  } catch (e) {
    log('异常: ' + e.message.split('\n')[0]);
  } finally {
    fs.writeFileSync(path.join(__dirname, 'probe-tieba-fa.out.txt'), out.join('\n'));
    await page.close().catch(() => {});
    bm.disconnect().catch(() => {});
    process.exit(0);
  }
})();
