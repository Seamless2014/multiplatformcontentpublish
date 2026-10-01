/**
 * 实地复查6：小红书笔记管理页找草稿
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
  try {
    await page.goto('https://creator.xiaohongshu.com/publish/noteManage', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(6000);
    log('URL: ' + page.url());
    let r = await page.evaluate((k) => {
      const txt = document.body.innerText || '';
      return { hit: txt.includes(k), tabs: txt.split('\n').map((s) => s.trim()).filter((s) => /草稿|全部|笔记|审核/.test(s)).slice(0, 15) };
    }, KEY);
    log('命中: ' + r.hit + ' | 页面tabs: ' + JSON.stringify(r.tabs));

    // 若有「草稿」tab，点击
    const draftTab = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => {
        const t = (e.textContent || '').trim();
        return /^草稿(\(\d+\))?$/.test(t) && e.getBoundingClientRect().width > 0 && e.children.length <= 2;
      });
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2), t: (el.textContent || '').trim() };
    });
    log('草稿tab: ' + JSON.stringify(draftTab));
    if (draftTab) {
      await page.mouse.click(draftTab.x, draftTab.y);
      await page.waitForTimeout(4000);
      r = await page.evaluate((k) => {
        const txt = document.body.innerText || '';
        const lines = txt.split('\n').map((s) => s.trim()).filter(Boolean);
        const idx = lines.findIndex((s) => s.includes(k));
        return { hit: idx >= 0, around: idx >= 0 ? lines.slice(Math.max(0, idx - 3), idx + 8) : lines.slice(0, 40) };
      }, KEY);
      log('点击草稿tab后命中: ' + r.hit);
      log(r.hit ? '上下文: ' + JSON.stringify(r.around, null, 1) : '列表: ' + JSON.stringify(r.around, null, 1));
    }
    await page.screenshot({ path: path.join(__dirname, '../../screenshots/verify-xhs-notemanage.png') });
  } catch (e) { log('异常: ' + e.message.split('\n')[0]); }
  finally {
    fs.writeFileSync(path.join(__dirname, 'verify-drafts6.out.txt'), out.join('\n'));
    await page.close().catch(() => {});
    bm.disconnect().catch(() => {});
    process.exit(0);
  }
})();
