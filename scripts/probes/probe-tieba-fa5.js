/**
 * 探测5：首页发贴弹窗 - 「选择吧」下拉交互
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

    // 点发贴
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

    // 点「选择吧」下拉
    const forumBox = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) =>
        e.children.length <= 2 && /选择吧/.test(e.textContent || '') && (e.textContent || '').trim().length < 20);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, tag: el.tagName, cls: String(el.className).slice(0, 60) };
    });
    log('选择吧控件: ' + JSON.stringify(forumBox));
    await page.mouse.click(forumBox.x, forumBox.y);
    await page.waitForTimeout(2000);

    // 找出现的搜索输入框
    const inputs = await page.evaluate(() => [...document.querySelectorAll('input')]
      .map((i) => ({ ph: i.placeholder || '', type: i.type, vis: !!(i.offsetWidth || i.offsetHeight) }))
      .filter((i) => i.vis));
    log('可见输入框: ' + JSON.stringify(inputs, null, 2));
    await page.screenshot({ path: path.join(__dirname, '../../screenshots/probe-tieba-forum-dd.png') });

    // 在搜索框输入吧名
    const searchInput = page.locator('input[placeholder*="吧"], input[placeholder*="搜索"]').first();
    if (await searchInput.count()) {
      await searchInput.fill('软件吧');
      log('已输入吧名，等联想');
      await page.waitForTimeout(3000);
      // dump 下拉选项
      const opts = await page.evaluate(() => {
        const items = [...document.querySelectorAll('[class*="option"],[class*="item"],[class*="menu"] li,[class*="dropdown"] *')]
          .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 50 && r.height > 10 && r.height < 80 && (e.textContent || '').trim(); })
          .slice(0, 15)
          .map((e) => ({ t: (e.textContent || '').trim().slice(0, 30), cls: String(e.className).slice(0, 50), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }));
        return items;
      });
      log('下拉选项: ' + JSON.stringify(opts, null, 2));
      await page.screenshot({ path: path.join(__dirname, '../../screenshots/probe-tieba-forum-opts.png') });
    } else {
      log('未找到吧搜索输入框');
    }
  } catch (e) {
    log('异常: ' + e.message.split('\n')[0]);
  } finally {
    fs.writeFileSync(path.join(__dirname, 'probe-tieba-fa5.out.txt'), out.join('\n'));
    await page.close().catch(() => {});
    bm.disconnect().catch(() => {});
    process.exit(0);
  }
})();
