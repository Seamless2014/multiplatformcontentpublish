/**
 * 实地复查3：小红书草稿箱（右上角入口）+ 头条草稿箱（URL 纠正）
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

  // 小红书：点右上角「草稿箱(8)」
  async function xhs() {
    const page = await ctx.newPage();
    try {
      log('\n=== 小红书 草稿箱(右上角) ===');
      await page.goto('https://creator.xiaohongshu.com/publish/publish?source=official', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(5000);
      const clicked = await page.evaluate(() => {
        const el = [...document.querySelectorAll('*')].find((e) => {
          const t = (e.textContent || '').trim();
          return /^草稿箱\s*\(\d+\)$/.test(t) && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().width < 300;
        });
        if (!el) return null;
        el.click();
        return (el.textContent || '').trim();
      });
      log('点击: ' + clicked);
      await page.waitForTimeout(5000);
      log('URL: ' + page.url());
      const r = await page.evaluate((k) => {
        const txt = document.body.innerText || '';
        return { hit: txt.includes(k), lines: txt.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 40) };
      }, KEY);
      log('含关键字: ' + r.hit);
      log('列表: ' + JSON.stringify(r.lines.slice(5), null, 1));
      await page.screenshot({ path: path.join(__dirname, '../../screenshots/verify-xhs-draft2.png') });
    } catch (e) { log('异常: ' + e.message.split('\n')[0]); }
    finally { await page.close().catch(() => {}); }
  }

  // 头条：草稿箱页 URL（manage?status=draft 或 graphic/draft）
  async function toutiao() {
    const page = await ctx.newPage();
    try {
      log('\n=== 头条 草稿箱 ===');
      await page.goto('https://mp.toutiao.com/profile_v4/graphic/manage?status=draft', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(6000);
      log('URL: ' + page.url());
      let r = await page.evaluate((k) => {
        const txt = document.body.innerText || '';
        return { hit: txt.includes(k), lines: txt.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 45) };
      }, KEY);
      log('含关键字: ' + r.hit);
      log('列表: ' + JSON.stringify(r.lines.slice(10), null, 1));
      await page.screenshot({ path: path.join(__dirname, '../../screenshots/verify-toutiao-draft2.png') });
    } catch (e) { log('异常: ' + e.message.split('\n')[0]); }
    finally { await page.close().catch(() => {}); }
  }

  await xhs();
  await toutiao();
  fs.writeFileSync(path.join(__dirname, 'verify-drafts3.out.txt'), out.join('\n'));
  bm.disconnect().catch(() => {});
  process.exit(0);
})();
