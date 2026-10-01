/**
 * 真实平台端到端验证：在已登录平台中真实打开编辑器 → 注入图文 → 核对结果 → 截图存证
 * 用法：node scripts/test-real-publish.js [平台id]
 *   不带参数：测试所有已登录平台
 *   带参数：只测指定平台，如 node scripts/test-real-publish.js zhihu
 *
 * 注意：本脚本只「填表」不点击发布/保存按钮，除非加 --submit 参数。
 *       默认不修改任何线上内容，纯验证注入能力。
 */
const fs = require('fs');
const path = require('path');
const bm = require('../src/core/browser');
const adapters = require('../src/adapters');
const { mdToHtml } = require('../src/core/article');

const SUBMIT = process.argv.includes('--submit');
const onlyId = process.argv.find((a) => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]);

const GOOD_IMG = 'https://www.baidu.com/img/flexible/logo/pc/result.png';

const TITLE = '自动化发布器验证测试';
const CONTENT = `## 验证小标题

这是**加粗文字**，用于验证富文本格式保留。

![验证图片](${GOOD_IMG})

图片之后的收尾段落，验证文字完整性。`;

async function prepareArticle() {
  const r = await mdToHtml(CONTENT, { inlineImages: true });
  return {
    title: TITLE,
    content: CONTENT, // 小红书等适配器依赖 content 里的 Markdown 图片语法提取上传文件
    html: r.html,
    text: r.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    images: [],
    forum: process.env.TIEBA_FORUM || '数字化管理师', // 贴吧目标吧名（可用环境变量覆盖）
    _imgStats: { extracted: r.images.length, failed: r.inlineFailed.length },
  };
}

async function main() {
  const article = await prepareArticle();
  console.log('===== 测试文章准备 =====');
  console.log(`  标题：${article.title}`);
  console.log(`  图片：提取 ${article._imgStats.extracted} 张，转存失败 ${article._imgStats.failed} 张`);
  console.log(`  正文中 base64 图：${(article.html.match(/data:image\//g) || []).length} 张`);
  console.log(`  残留外链图：${(article.html.match(/<img[^>]*src="https?:/g) || []).length} 个`);

  await bm.connect();
  const ctx = bm.getContext();

  const targets = onlyId ? { [onlyId]: adapters[onlyId] } : adapters;
  if (onlyId && !adapters[onlyId]) {
    console.error(`未知平台 id: ${onlyId}，可选：${Object.keys(adapters).join(', ')}`);
    process.exit(1);
  }

  const shotDir = path.join(__dirname, '..', 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });
  const report = [];

  for (const [id, adapter] of Object.entries(targets)) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`平台：${adapter.meta.name}（${id}）`);
    console.log('='.repeat(50));

    // 1) 登录检测
    const login = await adapter.checkLogin(ctx);
    console.log(`  登录态：${login.ok ? 'PASS 已登录' : 'SKIP ' + login.message}`);
    if (!login.ok) {
      report.push({ id, name: adapter.meta.name, status: 'skipped', reason: login.message });
      continue;
    }

    // 2) 真实发布流程（填表）
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const logs = [];
    const log = (m) => { logs.push(m); console.log(`    · ${m}`); };

    try {
      // 复用适配器的 doPublish，但强制 draft 模式（不点发布）
      const payload = { ...article, mode: SUBMIT ? 'publish' : 'draft', images: [] };
      const result = await adapter.doPublish(page, payload, { context: ctx }, log);

      const shot = `real-${id}.png`;
      await page.screenshot({ path: path.join(shotDir, shot), fullPage: false });

      // 3) 核对编辑器内实际内容
      // 注意：querySelector('a, b') 按文档顺序返回第一个匹配，与选择器书写顺序无关；
      // 贴吧标题编辑器（[contenteditable="true"]）在 DOM 中位于正文之前，会把 verify 引到标题上。
      // 因此按「正文专用 → 通用」优先级逐个尝试，命中即停。
      const verify = await page.evaluate(() => {
        const sels = [
          '.ql-editor[data-placeholder*="正文"]', // 贴吧 Quill 正文
          '.ProseMirror',                          // 头条/百家号/微信
          '.public-DraftEditor-content',           // 知乎
          'textarea[placeholder*="新鲜事"]',       // 微博发博框（textarea，内容在 value）
          '.editor-content [contenteditable="true"]',
          '[contenteditable="true"]',              // 通用兜底（放最后手动兜）
        ];
        let el = null;
        for (const s of sels.slice(0, -1)) { el = document.querySelector(s); if (el) break; }
        if (!el) el = document.querySelector(sels[sels.length - 1]);
        if (!el) return { found: false };
        const isTa = el.tagName === 'TEXTAREA';
        const text = isTa ? (el.value || '') : (el.innerText || '');
        const imgs = [...el.querySelectorAll('img')];
        return {
          found: true,
          sel: isTa ? 'textarea（发博框）' : (el.className ? String(el.className).slice(0, 40) : el.getAttribute('data-placeholder') || el.tagName),
          textLen: text.trim().length,
          // textarea 本身无 img（图片走上传通道成为缩略图），从 value 长度判断注入成功即可
          imgCount: imgs.length,
          textareaMode: isTa,
          allBase64: imgs.every((i) => i.src.startsWith('data:')),
          anyExternal: imgs.some((i) => /^https?:/.test(i.src)),
          hasToken: /IMG_\d/.test(text),
          titleFilled: (() => {
            const t = document.querySelector('textarea[placeholder*="标题"], input[placeholder*="标题"], #title, .ql-editor[data-placeholder*="标题"]');
            return t ? (t.value !== undefined ? t.value.length > 0 : (t.innerText || '').trim().length > 0) : null;
          })(),
          preview: text.trim().slice(0, 100).replace(/\n+/g, ' | '),
        };
      }).catch(() => ({ found: false }));

      console.log(`  编辑器核对：`);
      if (verify.found) {
        console.log(`    文字 ${verify.textLen} 字 | 图片 ${verify.imgCount} 张${verify.textareaMode ? '（textarea 发博框：文字以 value 计，图片经上传通道见上方日志）' : ''}`);
        console.log(`    标题已填：${verify.titleFilled === null ? '无法检测' : verify.titleFilled ? '是' : '否'}`);
        console.log(`    全为base64图：${verify.allBase64 ? '是' : '否'} | 含外链图：${verify.anyExternal ? '是(问题)' : '否'}`);
        console.log(`    无占位符残留：${verify.hasToken ? '否(问题)' : '是'}`);
        console.log(`    正文预览：${verify.preview}`);
      } else {
        console.log(`    未能定位编辑器元素（可能页面结构变化）`);
      }

      console.log(`  流程结果：${result.ok ? 'PASS' : 'FAIL'} —— ${result.message}`);
      console.log(`  截图：screenshots/${shot}`);

      report.push({
        id, name: adapter.meta.name,
        status: result.ok ? 'passed' : 'failed',
        message: result.message, logs, verify, screenshot: shot,
      });
    } catch (e) {
      const shot = `real-${id}-error.png`;
      await page.screenshot({ path: path.join(shotDir, shot) }).catch(() => {});
      console.log(`  异常：${e.message.split('\n')[0]}`);
      report.push({ id, name: adapter.meta.name, status: 'error', message: e.message.split('\n')[0], logs, screenshot: shot });
    } finally {
      await page.close().catch(() => {});
    }
  }

  const out = path.join(__dirname, '..', 'data', 'real-publish-report.json');
  fs.writeFileSync(out, JSON.stringify({ time: new Date().toISOString(), submit: SUBMIT, report }, null, 2));

  console.log(`\n${'='.repeat(50)}`);
  console.log('汇总');
  console.log('='.repeat(50));
  report.forEach((r) => {
    const icon = { passed: 'PASS', failed: 'FAIL', skipped: 'SKIP', error: 'ERR ' }[r.status];
    console.log(`  ${icon}  ${r.name}${r.verify && r.verify.found ? `  [文字${r.verify.textLen}字/图${r.verify.imgCount}张]` : ''}  ${r.message || r.reason || ''}`);
  });
  console.log(`\n详细报告：${out}`);
  console.log(SUBMIT ? '⚠️ 已使用 --submit 模式（会真实提交）' : 'ℹ️ 草稿模式：只填表未提交，不影响线上内容');
}

main().then(() => process.exit(0)).catch((e) => { console.error('测试异常：', e.message); process.exit(1); });
