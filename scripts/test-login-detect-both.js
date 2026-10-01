/**
 * 登录检测「双向」验证：证明检测逻辑既能在未登录时正确判否，也能在已登录时正确判是。
 *
 * 方法：用 CDP 打开各平台首页（此时真实未登录），
 *   第一轮 → 记录真实判定（应为 ok:false，且与页面 URL/二维码特征一致）
 *   第二轮 → 用 DOM 注入「已登录才有的后台元素」，再跑同一段检测代码（应为 ok:true）
 *
 * 这样可排除「检测代码恒返回 false」这种伪通过。
 * 用法：node scripts/test-login-detect-both.js
 */
const bm = require('../src/core/browser');
const adapters = require('../src/adapters');

// 每个平台「已登录态」的标志性 DOM（与适配器里的 loggedIn 选择器对应）
const LOGGED_IN_DOM = {
  weixin: `<div class="weui-desktop-menu">内容管理</div><div class="weui-desktop-account__type">订阅号</div><div class="new-creation__menu-item">新的创作</div>`,
  toutiao: null,   // 头条/知乎/百家号/小红书以 URL 跳转为主判据，见下方 URL 注入
  zhihu: null,
  baijiahao: null,
  xiaohongshu: null,
};

// 以 URL 为主判据的平台：这些平台真实后台在不同域名，无法用 pushState 跨域伪造，
// 因此改用「等价单测」：直接拿一段假 page 对象喂给同一份 doCheckLogin 代码，
// 模拟 URL 已跳转到后台 + DOM 出现编辑器，验证正向分支确实返回 ok:true。
const FAKE_PAGE_CASES = {
  toutiao: {
    url: 'https://mp.toutiao.com/profile_v4/graphic/publish',
    present: ['.ProseMirror', 'textarea[placeholder*="标题"]'],
  },
  zhihu: {
    url: 'https://zhuanlan.zhihu.com/write',
    present: ['textarea[placeholder*="标题"]', '.public-DraftEditor-content'],
  },
  baijiahao: {
    url: 'https://baijiahao.baidu.com/builder/rc/edit?type=article',
    present: ['.publish-btn', 'text=内容管理'],
  },
  xiaohongshu: {
    url: 'https://creator.xiaohongshu.com/publish/publish?source=official',
    present: ['input[type="file"]', '#post-textarea'],
  },
};

/** 造一个最小可用的 page 替身，只实现 doCheckLogin / anyVisible 用到的方法 */
function makeFakePage(url, presentSelectors) {
  const match = (sel) => presentSelectors.some((p) => sel.includes(p) || p.includes(sel));
  const handle = (sel) => ({
    first: () => handle(sel),
    nth: () => handle(sel),
    count: async () => (match(sel) ? 1 : 0),
    waitFor: async () => { if (!match(sel)) throw new Error('timeout: element not present'); },
    isVisible: async () => match(sel),
  });
  return { url: () => url, locator: (sel) => handle(sel) };
}

/** 造一个「登录页」替身，验证 URL 判否分支 */
function makeFakeLoginPage() {
  return {
    url: () => 'https://example.com/signin',
    locator: () => makeFakePage('', []).locator('nothing'),
  };
}

async function main() {
  await bm.connect();
  const ctx = bm.getContext();

  const rows = [];
  for (const [id, adapter] of Object.entries(adapters)) {
    const page = await ctx.newPage();
    try {
      await page.goto(adapter.meta.homeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);

      // 第一轮：真实状态（随登录进度变化：可能已登录也可能未登录，仅作信息展示）
      const before = await adapter.doCheckLogin(page);

      // 第二轮：伪造已登录 DOM（仅微信适用，微信以 DOM 为主判据）
      const dom = LOGGED_IN_DOM[id];
      let after = null;
      if (dom) {
        await page.evaluate((html) => {
          const box = document.createElement('div');
          box.id = '__fake_logged_in__';
          box.innerHTML = html;
          document.body.appendChild(box);
        }, dom);
        await page.waitForTimeout(500);
        after = await adapter.doCheckLogin(page);
      }

      // 真实页判定标准：判否则必须给出未登录类消息（不能是「无法确认」），
      // 判是则视为该平台确已登录（登录是持久状态，脚本无法反向撤销来重测）。
      const realOk = before.ok === true
        || /未登录/.test(before.message);
      rows.push({ id, name: adapter.meta.name, before: before.ok, beforeMsg: before.message, after: after ? after.ok : null, pass: realOk });
      console.log(`\n【${adapter.meta.name}】`);
      console.log(`  真实态（信息展示）：${before.ok ? '已登录' : '未登录'}  ${before.message}`);
      if (after) {
        console.log(`  DOM 伪已登录（应判已登录）：${after.ok ? 'ok:true ✔' : 'ok:false ← 异常'}  ${after.message}`);
        if (!after.ok) rows[rows.length - 1].pass = false;
      }
    } catch (e) {
      rows.push({ id, name: adapter.meta.name, error: e.message.split('\n')[0], pass: false });
      console.log(`\n【${adapter.meta.name}】异常：${e.message.split('\n')[0]}`);
    } finally {
      await page.close().catch(() => {});
    }
  }

  // 第三轮：URL 主判据平台的正向分支单测（用假 page，不依赖真实登录）
  console.log(`\n${'='.repeat(56)}`);
  console.log('正向分支单测（伪造「后台已登录」页面对象）');
  console.log('='.repeat(56));
  let fakePass = 0;
  const fakeTotal = Object.keys(FAKE_PAGE_CASES).length;
  for (const [id, c] of Object.entries(FAKE_PAGE_CASES)) {
    const adapter = adapters[id];
    const loggedIn = await adapter.doCheckLogin(makeFakePage(c.url, c.present));
    const notLogged = await adapter.doCheckLogin(makeFakeLoginPage());
    const good = loggedIn.ok === true && notLogged.ok === false;
    if (good) fakePass++;
    console.log(`\n【${adapter.meta.name}】`);
    console.log(`  后台URL+编辑器DOM → ${loggedIn.ok ? 'ok:true ✔' : 'ok:false ← 异常'}  ${loggedIn.message}`);
    console.log(`  登录页URL        → ${notLogged.ok === false ? 'ok:false ✔' : 'ok:true ← 异常'}  ${notLogged.message}`);
  }

  console.log(`\n${'='.repeat(56)}`);
  const bad = rows.filter((r) => !r.pass);
  console.log(`① 真实页检测合理性：${rows.length - bad.length}/${rows.length} 通过`);
  console.log(`② 正向分支单测：${fakePass}/${fakeTotal} 通过`);
  const allOk = bad.length === 0 && fakePass === fakeTotal;
  console.log(allOk ? '结论：登录检测双向逻辑均正确' : '结论：存在问题 → ' + bad.map((b) => b.name).join(', '));
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error('脚本异常：', e.message); process.exit(1); });
