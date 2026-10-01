/**
 * 探测2：监听 pageerror/console 点击发贴；并尝试经典发贴 URL
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

  page.on('pageerror', (e) => log('!! pageerror: ' + e.message.slice(0, 150)));
  page.on('console', (msg) => { if (['error', 'warning'].includes(msg.type())) log(`!! console.${msg.type()}: ` + msg.text().slice(0, 150)); });
  page.on('dialog', (d) => { log('!! dialog: ' + d.type() + ' ' + d.message().slice(0, 80)); d.dismiss().catch(() => {}); });

  try {
    log('== 尝试 A：经典发贴 URL ==');
    await page.goto('https://tieba.baidu.com/f/commit/shareorcreate/?fr=itb&kw=' + encodeURIComponent('软件吧') + '&fbc=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    log('URL: ' + page.url());
    const stA = await page.evaluate(() => ({
      qlEditors: document.querySelectorAll('.ql-editor').length,
          placeholders: [...document.querySelectorAll('.ql-editor')].map((e) => e.dataset.placeholder || ''),
      title: document.title,
      bodyHint: (document.body.innerText || '').slice(0, 120).replace(/\n+/g, ' | '),
    }));
    log('A 结果: ' + JSON.stringify(stA, null, 2));
    await page.screenshot({ path: path.join(__dirname, '../../screenshots/probe-tieba-classic.png') });

    if (stA.qlEditors === 0) {
      log('== 尝试 B：回到新版页，监听错误并点击 add-btn 外层 ==');
      await page.goto('https://tieba.baidu.com/f?kw=' + encodeURIComponent('软件吧'), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);
      const clicked = await page.evaluate(() => {
        const el = document.querySelector('.add-btn.button-wrapper--add-post') || document.querySelector('.add-post');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      log('点击目标: ' + JSON.stringify(clicked));
      if (clicked) {
        await page.mouse.click(clicked.x, clicked.y);
        await page.waitForTimeout(5000);
        const stB = await page.evaluate(() => ({
          url: location.href,
          qlEditors: document.querySelectorAll('.ql-editor').length,
          placeholders: [...document.querySelectorAll('.ql-editor')].map((e) => e.dataset.placeholder || ''),
          visibleOverlays: [...document.querySelectorAll('body *')]
            .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 300 && r.height > 200 && getComputedStyle(e).position === 'fixed'; })
            .slice(0, 6)
            .map((e) => e.tagName + '.' + String(e.className).slice(0, 50) + ` [${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}]`),
        }));
        log('B 结果: ' + JSON.stringify(stB, null, 2));
        await page.screenshot({ path: path.join(__dirname, '../../screenshots/probe-tieba-addbtn.png') });
      }
    }
  } catch (e) {
    log('异常: ' + e.message.split('\n')[0]);
  } finally {
    fs.writeFileSync(path.join(__dirname, 'probe-tieba-fa2.out.txt'), out.join('\n'));
    await page.close().catch(() => {});
    bm.disconnect().catch(() => {});
    process.exit(0);
  }
})();
