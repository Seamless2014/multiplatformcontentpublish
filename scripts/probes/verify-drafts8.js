/**
 * 实地复查8：小红书草稿箱浮层（刷新后点击 + waitForFunction 等浮层渲染）
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

    const box = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => {
        const t = (e.textContent || '').trim();
        return /^草稿箱\s*\(\d+\)$/.test(t) && e.getBoundingClientRect().width > 0 && e.children.length <= 3;
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      // 若元素被视口截断，点击其可见部分中心
      const vx = Math.min(Math.max(r.x + r.width / 2, 5), innerWidth - 5);
      const vy = Math.min(Math.max(r.y + r.height / 2, 5), innerHeight - 5);
      return { x: Math.round(vx), y: Math.round(vy), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, vw: innerWidth };
    });
    log('按钮: ' + JSON.stringify(box));
    if (box) {
      await page.mouse.click(box.x, box.y);
      log('点击完成');
      // 等浮层渲染（浮层含「图文笔记」「视频笔记」tab 文本）
      const opened = await page.waitForFunction(
        () => /图文笔记\s*\(|视频笔记\s*\(/.test(document.body.innerText),
        { timeout: 8000 },
      ).then(() => true).catch(() => false);
      log('浮层打开: ' + opened);
      const r = await page.evaluate((k) => {
        const txt = document.body.innerText || '';
        const lines = txt.split('\n').map((s) => s.trim()).filter(Boolean);
        const idx = lines.findIndex((s) => s.includes(k));
        return { hit: idx >= 0, around: idx >= 0 ? lines.slice(Math.max(0, idx - 4), idx + 10) : [], tabs: lines.filter((s) => /笔记\s*\(\d+\)|草稿箱/.test(s)).slice(0, 8) };
      }, KEY);
      log('命中标题: ' + r.hit);
      log('草稿相关: ' + JSON.stringify(r.tabs, null, 1));
      if (r.hit) log('命中上下文: ' + JSON.stringify(r.around, null, 1));
      await page.screenshot({ path: path.join(__dirname, '../../screenshots/verify-xhs-draft6.png') });
    }
  } catch (e) { log('异常: ' + e.message.split('\n')[0]); }
  finally {
    fs.writeFileSync(path.join(__dirname, 'verify-drafts8.out.txt'), out.join('\n'));
    await page.close().catch(() => {});
    bm.disconnect().catch(() => {});
    process.exit(0);
  }
})();
