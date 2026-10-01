/**
 * 探测百度贴吧 / 新浪微博：登录状态 + 发布入口 URL + 编辑器结构。
 * 只读探测，不提交任何内容。
 */
const bm = require('../../src/core/browser');

const TARGETS = [
  { id: 'tieba', name: '百度贴吧', home: 'https://tieba.baidu.com/', publishCandidates: ['https://tieba.baidu.com/f?kw=%E6%9D%8E%E6%AF%85', 'https://tieba.baidu.com/index.html'] },
  { id: 'weibo', name: '新浪微博', home: 'https://weibo.com/', publishCandidates: ['https://weibo.com/'] },
];

(async () => {
  await bm.connect();
  const ctx = bm.getContext();

  for (const t of TARGETS) {
    console.log('\n' + '='.repeat(60));
    console.log(`平台：${t.name}（${t.id}）`);
    console.log('='.repeat(60));
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    try {
      await page.goto(t.home, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);
      const info = await page.evaluate(() => {
        const out = { url: location.href, title: document.title, loggedInHints: [], loginHints: [], navTexts: [] };
        const body = document.body.innerText || '';
        // 登录特征
        for (const k of ['我的主页', '个人中心', '退出', '设置', '消息', '粉丝', '关注', '发布', '写文章', '发帖', '回复']) {
          if (body.includes(k)) out.loggedInHints.push(k);
        }
        for (const k of ['登录', '注册', '扫码登录', '立即登录', '手机号']) {
          if (body.includes(k)) out.loginHints.push(k);
        }
        // 顶部导航文本
        for (const el of document.querySelectorAll('a, button, li, div, span')) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          const txt = (el.innerText || '').trim();
          if (!txt || txt.length > 12 || txt.includes('\n')) continue;
          if (!/发布|发帖|写|登录|注册|我的|主页|设置|退出|消息/.test(txt)) continue;
          out.navTexts.push({ tag: el.tagName, text: txt, href: el.getAttribute && el.getAttribute('href') ? String(el.getAttribute('href')).slice(0, 80) : '', rect: Math.round(r.x) + ',' + Math.round(r.y) });
        }
        return out;
      });
      console.log('URL: ' + info.url);
      console.log('Title: ' + info.title);
      console.log('登录特征: ' + JSON.stringify(info.loggedInHints));
      console.log('未登录特征: ' + JSON.stringify(info.loginHints));
      console.log('导航候选:');
      const seen = new Set();
      for (const n of info.navTexts) { const k = n.text + n.rect; if (seen.has(k)) continue; seen.add(k); console.log(`  [${n.text}] <${n.tag}> href=${n.href} @${n.rect}`); }
      await page.screenshot({ path: require('path').join(__dirname, '..', '..', 'screenshots', `probe-${t.id}-home.png`) });
    } catch (e) {
      console.log('ERR: ' + e.message);
    }
  }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
