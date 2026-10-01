/**
 * 登录检测准确性审计：打印每个平台检测的中间状态，暴露误判风险
 * 用法：node scripts/audit-login-detect.js
 */
const bm = require('../src/core/browser');

const TARGETS = [
  { id: 'weixin', name: '微信公众号', url: 'https://mp.weixin.qq.com/' },
  { id: 'toutiao', name: '今日头条', url: 'https://mp.toutiao.com/profile_v4/graphic/publish' },
  { id: 'zhihu', name: '知乎', url: 'https://zhuanlan.zhihu.com/write' },
  { id: 'baijiahao', name: '百家号', url: 'https://baijiahao.baidu.com/builder/rc/home' },
  { id: 'xiaohongshu', name: '小红书', url: 'https://creator.xiaohongshu.com/publish/publish?source=official' },
];

(async () => {
  await bm.connect();
  const ctx = bm.getContext();

  for (const t of TARGETS) {
    const page = await ctx.newPage();
    try {
      const resp = await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(5000);

      const info = await page.evaluate(() => {
        const body = (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 180);
        return {
          url: location.href,
          title: document.title,
          hasQr: !!document.querySelector('img[src*="scanloginqrcode"], img[src*="qrcode"], .qrcode, [class*="qrcode"]'),
          hasPwdInput: !!document.querySelector('input[type="password"]'),
          hasPhoneInput: !!document.querySelector('input[placeholder*="手机"], input[placeholder*="账号"], input[placeholder*="邮箱"]'),
          bodyText: body,
        };
      });

      console.log(`\n----- ${t.name} -----`);
      console.log(`  HTTP状态: ${resp ? resp.status() : '—'}`);
      console.log(`  最终URL: ${info.url}`);
      console.log(`  页面标题: ${info.title}`);
      console.log(`  二维码: ${info.hasQr ? '有' : '无'} | 密码框: ${info.hasPwdInput ? '有' : '无'} | 账号框: ${info.hasPhoneInput ? '有' : '无'}`);
      console.log(`  页面文字: ${info.bodyText}`);
    } catch (e) {
      console.log(`\n----- ${t.name} -----\n  异常: ${e.message.split('\n')[0]}`);
    } finally {
      await page.close().catch(() => {});
    }
  }
  process.exit(0);
})().catch((e) => { console.error('审计异常：', e.message); process.exit(1); });
