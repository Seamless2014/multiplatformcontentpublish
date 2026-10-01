/* 探测：贴吧吧 页面的发贴入口结构 */
const path = require('path');
const bm = require(path.join(__dirname, '..', '..', 'src', 'core', 'browser'));

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  const forum = process.env.TIEBA_FORUM || '贴吧吧';
  const url = 'https://tieba.baidu.com/f?kw=' + encodeURIComponent(forum);
  console.log('打开:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  console.log('页面标题:', await page.title());
  console.log('当前 URL:', page.url());

  const info = await page.evaluate(() => {
    const pick = (sel) => [...document.querySelectorAll(sel)].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || '').trim().slice(0, 30), cls: String(el.className).slice(0, 60), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    return {
      addPost: pick('.add-post'),
      addPostAny: pick('[class*="add-post"]'),
      rightMenu: pick('.right-menu'),
      coreTitle: (document.querySelector('.card_title_fixed_layer, .core_title') || {}).textContent || '',
      hasLogin: !!document.querySelector('a[href*="home/main?id="]'),
      buttonsText: [...document.querySelectorAll('a,div,button,span')].filter((el) => /发[贴帖]/.test(el.textContent || '') && (el.textContent || '').length < 12).slice(0, 10).map((el) => ({ tag: el.tagName, text: (el.textContent || '').trim().slice(0, 20), cls: String(el.className).slice(0, 50) })),
    };
  });
  console.log('\n已登录:', info.hasLogin);
  console.log('吧标题:', info.coreTitle);
  console.log('.add-post:', JSON.stringify(info.addPost));
  console.log('[class*=add-post]:', JSON.stringify(info.addPostAny));
  console.log('.right-menu:', JSON.stringify(info.rightMenu));
  console.log('含「发贴」文本的元素:', JSON.stringify(info.buttonsText, null, 1));

  await page.screenshot({ path: path.join(__dirname, '..', '..', 'screenshots', 'probe-tieba-ba.png'), fullPage: false });
  await page.close();
  console.log('\n完成（已关闭页面）');
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
