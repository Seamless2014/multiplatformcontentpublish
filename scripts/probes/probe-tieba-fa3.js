/**
 * 探测3：记录加载失败的资源 URL + 复现 _typeof 报错
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

  const failed = [];
  page.on('requestfailed', (req) => {
    const f = req.failure() || {};
    failed.push({ url: req.url().slice(0, 120), err: f.errorText, type: req.resourceType() });
  });
  page.on('pageerror', (e) => log('!! pageerror: ' + e.message.slice(0, 200)));

  try {
    log('打开软件吧');
    await page.goto('https://tieba.baidu.com/f?kw=' + encodeURIComponent('软件吧'), { waitUntil: 'networkidle', timeout: 45000 }).catch(() => log('networkidle 超时（继续）'));
    await page.waitForTimeout(2000);
    log('失败资源 ' + failed.length + ' 个:');
    failed.slice(0, 15).forEach((f) => log(`  [${f.type}] ${f.err} ${f.url}`));

    // 检查 _typeof 相关脚本是否存在
    const scriptCheck = await page.evaluate(() => {
      const scripts = [...document.querySelectorAll('script[src]')].map((s) => s.src);
      return { total: scripts.length, list: scripts.filter((s) => /tieba|baidu/.test(s)).slice(0, 15) };
    });
    log('页面脚本: ' + JSON.stringify(scriptCheck, null, 2));

    // 点击并确认 _typeof 报错复现
    const clicked = await page.evaluate(() => {
      const el = document.querySelector('.add-post');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (clicked) {
      log('点击 add-post');
      await page.mouse.click(clicked.x, clicked.y);
      await page.waitForTimeout(4000);
      const st = await page.evaluate(() => ({
        qlEditors: document.querySelectorAll('.ql-editor').length,
        typeofDefined: (typeof _typeof),
      }));
      log('点击后: ' + JSON.stringify(st));
    }
  } catch (e) {
    log('异常: ' + e.message.split('\n')[0]);
  } finally {
    fs.writeFileSync(path.join(__dirname, 'probe-tieba-fa3.out.txt'), out.join('\n'));
    await page.close().catch(() => {});
    bm.disconnect().catch(() => {});
    process.exit(0);
  }
})();
