const bm = require('../../src/core/browser');
const path = require('path');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  let page = ctx.pages().find((p) => /weibo\.com/.test(p.url()));
  if (!page) { console.log('微博页签不存在'); process.exit(0); }
  await page.bringToFront();
  await page.waitForTimeout(3000);
  console.log('URL: ' + page.url());
  const info = await page.evaluate(() => {
    const body = document.body.innerText || '';
    return {
      loggedIn: /首页|推荐|热门|我的微博|发微博|有什么新鲜事/.test(body) && !/newlogin/.test(location.href),
      hasComposer: !!document.querySelector('textarea') || document.querySelectorAll('[contenteditable="true"]').length,
      title: document.title,
    };
  });
  console.log('Title: ' + info.title);
  console.log('已登录: ' + info.loggedIn);
  console.log('composer 元素: ' + JSON.stringify(info.hasComposer));
  await page.screenshot({ path: path.join(__dirname, '..', '..', 'screenshots', 'probe-weibo-state.png') });
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
