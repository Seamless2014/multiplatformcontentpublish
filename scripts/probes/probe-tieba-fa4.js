/**
 * 探测4：CDP 拿 _typeof 崩溃脚本 URL + 试首页「发贴」入口
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

  const client = await ctx.newCDPSession(page);
  await client.send('Runtime.enable');
  client.on('Runtime.exceptionThrown', (ev) => {
    const d = ev.exceptionDetails;
    const url = d.url || (d.scriptId ? 'scriptId:' + d.scriptId : '?');
    log(`!! 异常 [${d.text}] @ ${url} ${d.stackTrace && d.stackTrace.callFrames && d.stackTrace.callFrames[0] ? 'line ' + d.stackTrace.callFrames[0].lineNumber : ''}`);
  });

  try {
    log('== 首页「发贴」入口 ==');
    await page.goto('https://tieba.baidu.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    log('URL: ' + page.url());

    const homeBtn = await page.evaluate(() => {
      const cands = [...document.querySelectorAll('.add-post, [class*="add-post"], [class*="add-btn"]')];
      const el = cands.find((e) => (e.textContent || '').includes('发贴') || (e.textContent || '').includes('发帖'));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, cls: String(el.className).slice(0, 60) };
    });
    log('首页发贴按钮: ' + JSON.stringify(homeBtn));
    if (homeBtn) {
      await page.mouse.click(homeBtn.x, homeBtn.y);
      await page.waitForTimeout(5000);
      const st = await page.evaluate(() => ({
        url: location.href,
        qlEditors: document.querySelectorAll('.ql-editor').length,
        placeholders: [...document.querySelectorAll('.ql-editor')].map((e) => e.dataset.placeholder || ''),
      }));
      log('首页点发贴后: ' + JSON.stringify(st, null, 2));
      await page.screenshot({ path: path.join(__dirname, '../../screenshots/probe-tieba-home-fa.png') });

      // 若当前页弹出了编辑器直接报告；若跳转了，检查新页
      if (st.qlEditors === 0 && page.url() !== 'https://tieba.baidu.com/') {
        log('发生了跳转: ' + page.url());
        await page.waitForTimeout(3000);
        const st2 = await page.evaluate(() => ({
          qlEditors: document.querySelectorAll('.ql-editor').length,
          placeholders: [...document.querySelectorAll('.ql-editor')].map((e) => e.dataset.placeholder || ''),
          bodyHint: (document.body.innerText || '').slice(0, 100).replace(/\n+/g, ' | '),
        }));
        log('跳转页: ' + JSON.stringify(st2, null, 2));
        await page.screenshot({ path: path.join(__dirname, '../../screenshots/probe-tieba-home-jump.png') });
      }
    } else {
      log('首页没有发贴按钮');
    }
  } catch (e) {
    log('异常: ' + e.message.split('\n')[0]);
  } finally {
    fs.writeFileSync(path.join(__dirname, 'probe-tieba-fa4.out.txt'), out.join('\n'));
    await client.detach().catch(() => {});
    await page.close().catch(() => {});
    bm.disconnect().catch(() => {});
    process.exit(0);
  }
})();
