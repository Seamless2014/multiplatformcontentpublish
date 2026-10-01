/**
 * 实地复查4：真实点击进入头条草稿箱菜单 / 小红书草稿箱浮层
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

  // 头条：点左侧「草稿箱」菜单
  async function toutiao() {
    const page = await ctx.newPage();
    try {
      log('\n=== 头条：点「草稿箱」菜单 ===');
      await page.goto('https://mp.toutiao.com/profile_v4/graphic/manage', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(6000);
      const clicked = await page.evaluate(() => {
        const el = [...document.querySelectorAll('a, li, div, span')].find((e) =>
          (e.textContent || '').trim() === '草稿箱' && e.getBoundingClientRect().width > 0);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, href: el.href || '', x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      log('菜单项: ' + JSON.stringify(clicked));
      if (clicked) {
        await page.mouse.click(clicked.x, clicked.y);
        await page.waitForTimeout(6000);
      }
      log('URL: ' + page.url());
      const r = await page.evaluate((k) => {
        const txt = document.body.innerText || '';
        const lines = txt.split('\n').map((s) => s.trim()).filter(Boolean);
        const idx = lines.findIndex((s) => s.includes(k));
        return { hit: idx >= 0, around: idx >= 0 ? lines.slice(Math.max(0, idx - 2), idx + 6) : lines.slice(0, 30) };
      }, KEY);
      log('含关键字: ' + r.hit);
      log(r.hit ? '命中上下文: ' + JSON.stringify(r.around, null, 1) : '列表: ' + JSON.stringify(r.around, null, 1));
      await page.screenshot({ path: path.join(__dirname, '../../screenshots/verify-toutiao-draft3.png') });
    } catch (e) { log('异常: ' + e.message.split('\n')[0]); }
    finally { await page.close().catch(() => {}); }
  }

  // 小红书：点草稿箱后抓浮层
  async function xhs() {
    const page = await ctx.newPage();
    try {
      log('\n=== 小红书：草稿箱浮层 ===');
      await page.goto('https://creator.xiaohongshu.com/publish/publish?source=official', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(5000);
      const clicked = await page.evaluate(() => {
        const el = [...document.querySelectorAll('*')].find((e) => {
          const t = (e.textContent || '').trim();
          return /^草稿箱\s*\(\d+\)$/.test(t) && e.getBoundingClientRect().width > 0;
        });
        if (!el) return null;
        el.click();
        return (el.textContent || '').trim();
      });
      log('点击: ' + clicked);
      await page.waitForTimeout(2500);
      // 浮层一般是 fixed 定位容器；抓取含关键字的浮层内容
      const r = await page.evaluate((k) => {
        const hit = [...document.querySelectorAll('*')].find((e) => {
          const t = (e.textContent || '').trim();
          return t.includes(k) && t.length < 200 && e.getBoundingClientRect().width > 100;
        });
        // 草稿浮层容器：找包含「草稿箱」标题的弹层，dump 其文本
        const panel = [...document.querySelectorAll('div')]
          .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 250 && r.height > 200 && (e.textContent || '').includes('草稿箱') && (e.textContent || '').length < 800; })
          .map((e) => (e.textContent || '').replace(/\n+/g, ' | ').slice(0, 400));
        return { hit: !!hit, panel: panel.slice(0, 3) };
      }, KEY);
      log('正文命中关键字: ' + r.hit);
      log('草稿浮层内容: ' + JSON.stringify(r.panel, null, 1));
      await page.screenshot({ path: path.join(__dirname, '../../screenshots/verify-xhs-draft3.png') });
    } catch (e) { log('异常: ' + e.message.split('\n')[0]); }
    finally { await page.close().catch(() => {}); }
  }

  await toutiao();
  await xhs();
  fs.writeFileSync(path.join(__dirname, 'verify-drafts4.out.txt'), out.join('\n'));
  bm.disconnect().catch(() => {});
  process.exit(0);
})();
