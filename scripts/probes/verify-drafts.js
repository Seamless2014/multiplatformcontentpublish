/**
 * 实地复查：7 平台草稿箱是否真有刚分发的内容（不依赖任务状态，直接看平台后台）
 */
const path = require('path');
const fs = require('fs');
const bm = require('../../src/core/browser');

const CHECKS = [
  { id: 'weixin', name: '公众号', url: 'https://mp.weixin.qq.com/', listHint: ['草稿', '图文消息'] },
  { id: 'toutiao', name: '头条', url: 'https://mp.weixin.qq.com/', listHint: [] },
];
// 用后台「内容管理/草稿箱」页复查，标题关键字
const KEY = '多平台发布器实测走查';

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const out = [];
  const log = (m) => { out.push(m); console.log(m); };

  const targets = [
    { name: '头条-内容管理', url: 'https://mp.toutiao.com/profile_v4/graphic/manage?status=0' },
    { name: '百家号-内容管理', url: 'https://baijiahao.baidu.com/builder/rc/content?currentPage=1&pageSize=10&search=&type=&status=2' },
    { name: '知乎-草稿箱', url: 'https://www.zhihu.com/creator/manage/creation/draft' },
    { name: '小红书-创作中心', url: 'https://creator.xiaohongshu.com/publish/publish' },
  ];

  for (const t of targets) {
    const page = await ctx.newPage();
    try {
      log(`\n=== ${t.name} ===`);
      await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(5000);
      log('URL: ' + page.url());
      const found = await page.evaluate((k) => {
        const txt = document.body.innerText || '';
        const hit = txt.includes(k);
        // 抓取含关键字的上下文行
        const lines = txt.split('\n').map((s) => s.trim()).filter((s) => s.includes(k) || /草稿|暂存|待发布/.test(s)).slice(0, 12);
        return { hit, lines, bodyHead: txt.slice(0, 300).replace(/\n+/g, ' | ') };
      }, KEY);
      log('含标题关键字: ' + found.hit);
      log('相关行: ' + JSON.stringify(found.lines, null, 1));
      log('页面摘要: ' + found.bodyHead.slice(0, 200));
      await page.screenshot({ path: path.join(__dirname, '../../screenshots/verify-' + t.name.replace(/[^\w]/g, '_') + '.png') });
    } catch (e) {
      log('异常: ' + e.message.split('\n')[0]);
    } finally {
      await page.close().catch(() => {});
    }
  }

  fs.writeFileSync(path.join(__dirname, 'verify-drafts.out.txt'), out.join('\n'));
  bm.disconnect().catch(() => {});
  process.exit(0);
})();
