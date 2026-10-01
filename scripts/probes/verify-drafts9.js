/**
 * 实地复查9：小红书草稿箱 - 切到图文笔记 tab 并列出 8 篇草稿
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
    await page.goto('https://creator.xiaohongshu.com/publish/publish?source=official', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(6000);

    // 打开浮层
    const box = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => {
        const t = (e.textContent || '').trim();
        return /^草稿箱\s*\(\d+\)$/.test(t) && e.getBoundingClientRect().width > 0 && e.children.length <= 3;
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(Math.min(r.x + r.width / 2, innerWidth - 5)), y: Math.round(r.y + r.height / 2) };
    });
    await page.mouse.click(box.x, box.y);
    await page.waitForFunction(() => /图文笔记\s*\(|视频笔记\s*\(/.test(document.body.innerText), { timeout: 8000 }).then(() => true).catch(() => false);
    log('浮层已开');

    // 点「图文笔记(8)」tab
    const tab = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => {
        const t = (e.textContent || '').trim();
        return /^图文笔记\s*\(\d+\)$/.test(t) && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().width < 200 && e.children.length <= 2;
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    log('图文tab坐标: ' + JSON.stringify(tab));
    if (tab) {
      await page.mouse.click(tab.x, tab.y);
      await page.waitForTimeout(2500);
    }
    // dump 列表
    const r = await page.evaluate((k) => {
      const lines = (document.body.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
      const idx = lines.findIndex((s) => s.includes(k));
      return { hit: idx >= 0, around: idx >= 0 ? lines.slice(Math.max(0, idx - 4), idx + 10) : lines.slice(lines.findIndex((s) => /图文笔记/.test(s)), lines.findIndex((s) => /图文笔记/.test(s)) + 30) };
    }, KEY);
    log('命中: ' + r.hit);
    log('列表内容: ' + JSON.stringify(r.around, null, 1));
    await page.screenshot({ path: path.join(__dirname, '../../screenshots/verify-xhs-draft7.png') });
  } catch (e) { log('异常: ' + e.message.split('\n')[0]); }
  finally {
    fs.writeFileSync(path.join(__dirname, 'verify-drafts9.out.txt'), out.join('\n'));
    await page.close().catch(() => {});
    bm.disconnect().catch(() => {});
    process.exit(0);
  }
})();
