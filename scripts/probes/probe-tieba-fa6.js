/**
 * 探测6：首页发贴弹窗 - 用文本选择器定位「选择吧」
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
    await page.waitForTimeout(3000);
    log('编辑器已弹出');

    // 用 text= 定位「选择吧」
    const sel = page.locator('text=选择吧').first();
    const cnt = await sel.count();
    log('text=选择吧 命中: ' + cnt);
    if (cnt) {
      const box = await sel.boundingBox();
      log('box: ' + JSON.stringify(box));
      // 点击下拉区域中心
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(__dirname, '../../screenshots/probe-tieba-dd-open.png') });

      // 可见 input
      const inputs = await page.evaluate(() => [...document.querySelectorAll('input')]
        .filter((i) => i.offsetWidth || i.offsetHeight)
        .map((i) => ({ ph: i.placeholder || '', cls: String(i.className).slice(0, 40) })));
      log('可见输入框: ' + JSON.stringify(inputs, null, 2));

      // 输入吧名
      const inp = page.locator('input[placeholder*="吧"], input[placeholder*="搜索"], input[placeholder*="输入"]').first();
      if (await inp.count()) {
        await inp.fill('软件吧');
        log('已输入「软件吧」，等联想 3s');
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(__dirname, '../../screenshots/probe-tieba-dd-typed.png') });
        // 联想选项
        const opts = await page.evaluate(() => {
          const seen = new Set();
          const res = [];
          [...document.querySelectorAll('li, [class*="option"], [class*="suggest"], [class*="result"]')]
            .forEach((e) => {
              const t = (e.textContent || '').trim();
              const r = e.getBoundingClientRect();
              if (t && r.width > 40 && r.height > 12 && r.height < 100 && !seen.has(t)) {
                seen.add(t);
                res.push({ t: t.slice(0, 30), cls: String(e.className).slice(0, 50), cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) });
              }
            });
          return res.slice(0, 12);
        });
        log('联想选项: ' + JSON.stringify(opts, null, 2));
      } else {
        log('未找到吧搜索输入框');
      }
    }
  } catch (e) {
    log('异常: ' + e.message.split('\n')[0]);
  } finally {
    fs.writeFileSync(path.join(__dirname, 'probe-tieba-fa6.out.txt'), out.join('\n'));
    await page.close().catch(() => {});
    bm.disconnect().catch(() => {});
    process.exit(0);
  }
})();
