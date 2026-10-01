/**
 * 微信公众号登录页 DOM 深探测
 * 用法：node scripts/probe-weixin-dom.js
 */
const bm = require('../src/core/browser');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const p = await ctx.newPage();
  await p.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(6000);

  const info = await p.evaluate(() => {
    const txt = (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300);
    const imgs = [...document.querySelectorAll('img')].map((i) => (i.src || '').slice(0, 80)).slice(0, 10);
    const cls = [...document.querySelectorAll('div[class],section[class]')]
      .map((e) => e.className)
      .filter((c) => typeof c === 'string' && c.length < 80)
      .slice(0, 20);
    return {
      url: location.href,
      title: document.title,
      hasTitleInput: !!document.querySelector('#title'),
      hasQrcode: !!document.querySelector('.qrcode, [class*="qrcode"], img[src*="qrcode"]'),
      hasLoginWrap: !!document.querySelector('[class*="login"]'),
      imgSample: imgs,
      classSample: cls,
      bodyText: txt,
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await p.close();
  process.exit(0);
})().catch((e) => { console.error('异常:', e.message); process.exit(1); });
