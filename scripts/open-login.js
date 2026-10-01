/**
 * 在专用浏览器中打开单个平台的登录页（一次只开一个标签页）。
 * 用法：node scripts/open-login.js <platform>
 * 目的：引导用户逐个平台登录，避免一次性弹出多个窗口。
 */
const bm = require('../src/core/browser');

const id = process.argv[2];
if (!id) {
  console.error('用法：node scripts/open-login.js <platform>   可选：' + ['weixin', 'toutiao', 'zhihu', 'baijiahao', 'xiaohongshu'].join(', '));
  process.exit(1);
}

const adapters = require('../src/adapters');
const adapter = adapters[id];
if (!adapter) {
  console.error(`未知平台：${id}`);
  process.exit(1);
}

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = await ctx.newPage();
  await page.goto(adapter.meta.homeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.bringToFront(); } catch {}
  console.log(`已在专用浏览器打开【${adapter.meta.name}】：${page.url()}`);
  console.log('请在那个窗口完成登录。登录完成后运行：node scripts/check-login.js 验证。');
  // 不关闭页面，保留给用户操作
  process.exit(0);
})().catch((e) => { console.error('打开失败：', e.message.split('\n')[0]); process.exit(1); });
