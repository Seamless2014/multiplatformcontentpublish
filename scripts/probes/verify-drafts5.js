/**
 * 实地复查5：小红书草稿箱 - 真实鼠标点击浮层
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
    await page.waitForTimeout(5000);

    // 找右上角草稿箱按钮坐标
    const box = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => {
        const t = (e.textContent || '').trim();
        return /^草稿箱\s*\(\d+\)$/.test(t) && e.getBoundingClientRect().width > 0 && e.children.length <= 3;
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), cls: String(el.className).slice(0, 60) };
    });
    log('草稿箱按钮: ' + JSON.stringify(box));
    if (box) {
      await page.mouse.click(box.x, box.y);
      log('真实点击完成');
      await page.waitForTimeout(3000);
      const r = await page.evaluate((k) => {
        const txt = document.body.innerText || '';
        const lines = txt.split('\n').map((s) => s.trim()).filter(Boolean);
        const idx = lines.findIndex((s) => s.includes(k));
        return { hit: idx >= 0, around: idx >= 0 ? lines.slice(Math.max(0, idx - 3), idx + 8) : lines.slice(-25) };
      }, KEY);
      log('命中: ' + r.hit);
      log(r.hit ? '上下文: ' + JSON.stringify(r.around, null, 1) : '末尾文本: ' + JSON.stringify(r.around, null, 1));
      await page.screenshot({ path: path.join(__dirname, '../../screenshots/verify-xhs-draft4.png') });
    }
  } catch (e) { log('异常: ' + e.message.split('\n')[0]); }
  finally {
    fs.writeFileSync(path.join(__dirname, 'verify-drafts5.out.txt'), out.join('\n'));
    await page.close().catch(() => {});
    bm.disconnect().catch(() => {});
    process.exit(0);
  }
})();
