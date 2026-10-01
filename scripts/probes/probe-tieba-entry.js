/**
 * 探测百度贴吧发帖入口：从「我的」主页找发帖按钮 / 编辑器结构。
 */
const bm = require('../../src/core/browser');
const path = require('path');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /tieba\.baidu\.com/.test(p.url())) || (await ctx.newPage());
  await page.bringToFront();
  page.setDefaultTimeout(20000);

  // 先到首页拿用户 id
  await page.goto('https://tieba.baidu.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3500);

  const userInfo = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a[href*="home/main"]')].map((e) => e.href)[0] || null;
    return { homeHref: a };
  });
  console.log('用户主页: ' + userInfo.homeHref);

  // 找发帖相关入口（首页/我的页）
  const entry = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('a, button, div, span, li')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const txt = (el.innerText || '').trim();
      if (!txt || txt.length > 10) continue;
      if (!/发帖|发表|写文章|发表文章|发主题|创作/.test(txt)) continue;
      out.push({ tag: el.tagName, text: txt, cls: String(el.className).slice(0, 70), href: el.getAttribute('href') || '', rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    return out;
  });
  console.log('\n=== 首页发帖入口候选 ===');
  if (!entry.length) console.log('  （无）');
  const seen = new Set();
  for (const e of entry) { const k = e.text + e.rect; if (seen.has(k)) continue; seen.add(k); console.log(`  [${e.text}] <${e.tag}> cls="${e.cls}" href=${e.href.slice(0, 70)} @${e.rect}`); }

  // 试访问贴吧发帖页（需要吧名，先用「我的」主页看是否有发帖区）
  await page.goto('https://tieba.baidu.com/home/main', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const homeInfo = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyText: (document.body.innerText || '').slice(0, 300),
  }));
  console.log('\n=== 我的主页 ===');
  console.log('URL: ' + homeInfo.url);
  console.log('Title: ' + homeInfo.title);
  console.log('文本: ' + homeInfo.bodyText.replace(/\n+/g, ' | '));
  await page.screenshot({ path: path.join(__dirname, '..', '..', 'screenshots', 'probe-tieba-home.png') });
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
