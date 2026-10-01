/**
 * 实地复查2：进入各平台草稿箱列表，确认是否有本条内容
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

  // 1) 知乎文章草稿箱
  async function zhihu() {
    const page = await ctx.newPage();
    try {
      log('\n=== 知乎 文章草稿箱 ===');
      await page.goto('https://www.zhihu.com/creator/manage/creation/draft?type=article', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(6000);
      log('URL: ' + page.url());
      const r = await page.evaluate((k) => {
        const txt = document.body.innerText || '';
        return { hit: txt.includes(k), snippet: txt.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 40) };
      }, KEY);
      log('含关键字: ' + r.hit);
      log('内容: ' + JSON.stringify(r.snippet, null, 1));
      await page.screenshot({ path: path.join(__dirname, '../../screenshots/verify-zhihu-draft.png') });
    } catch (e) { log('异常: ' + e.message.split('\n')[0]); }
    finally { await page.close().catch(() => {}); }
  }

  // 2) 小红书草稿箱
  async function xhs() {
    const page = await ctx.newPage();
    try {
      log('\n=== 小红书 草稿箱 ===');
      await page.goto('https://creator.xiaohongshu.com/publish/publish?source=official', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(5000);
      // 点「草稿箱」入口
      const clicked = await page.evaluate(() => {
        const el = [...document.querySelectorAll('*')].find((e) => /^草稿箱/.test((e.textContent || '').trim()) && e.children.length <= 2);
        if (!el) return false;
        el.click();
        return true;
      });
      log('点击草稿箱: ' + clicked);
      await page.waitForTimeout(5000);
      log('URL: ' + page.url());
      const r = await page.evaluate((k) => {
        const txt = document.body.innerText || '';
        return { hit: txt.includes(k), snippet: txt.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 30) };
      }, KEY);
      log('含关键字: ' + r.hit);
      log('内容: ' + JSON.stringify(r.snippet, null, 1));
      await page.screenshot({ path: path.join(__dirname, '../../screenshots/verify-xhs-draft.png') });
    } catch (e) { log('异常: ' + e.message.split('\n')[0]); }
    finally { await page.close().catch(() => {}); }
  }

  // 3) 头条草稿箱
  async function toutiao() {
    const page = await ctx.newPage();
    try {
      log('\n=== 头条 草稿箱 ===');
      await page.goto('https://mp.toutiao.com/profile_v4/graphic/draft', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(6000);
      log('URL: ' + page.url());
      const r = await page.evaluate((k) => {
        const txt = document.body.innerText || '';
        return { hit: txt.includes(k), snippet: txt.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 35) };
      }, KEY);
      log('含关键字: ' + r.hit);
      log('内容: ' + JSON.stringify(r.snippet, null, 1));
      await page.screenshot({ path: path.join(__dirname, '../../screenshots/verify-toutiao-draft.png') });
    } catch (e) { log('异常: ' + e.message.split('\n')[0]); }
    finally { await page.close().catch(() => {}); }
  }

  await zhihu();
  await xhs();
  await toutiao();

  fs.writeFileSync(path.join(__dirname, 'verify-drafts2.out.txt'), out.join('\n'));
  bm.disconnect().catch(() => {});
  process.exit(0);
})();
