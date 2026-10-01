/**
 * 一键验证：完整检查所有环节，输出明确结论
 * 用法：node scripts/verify-all.js
 *
 * 检查项：
 *   A. 图片处理链路（离线，无需登录）
 *   B. 富文本注入（离线，无需登录）
 *   C. 浏览器 CDP 连接
 *   D. 各平台登录态
 */
const fs = require('fs');
const path = require('path');
const bm = require('../src/core/browser');
const adapters = require('../src/adapters');
const { mdToHtml, extractImages } = require('../src/core/article');
const { BasePublisher } = require('../src/adapters/base');
const { chromium } = require('playwright-core');

const GOOD_IMG = 'https://www.baidu.com/img/flexible/logo/pc/result.png';
const BAD_IMG = 'https://img.alicdn.com/tfs/TB1.ZBecWT1gK0jSZFGXXbd3FXa-1300-702.png';
const results = [];
const add = (section, name, pass, detail) => results.push({ section, name, pass, detail });

async function testImagePipeline() {
  const md = `段落一。\n\n![好图](${GOOD_IMG})\n\n段落二。\n\n![坏图](${BAD_IMG})\n\n收尾。`;
  const r = await mdToHtml(md, { inlineImages: true });
  const base64Count = (r.html.match(/data:image\//g) || []).length;
  const residualExt = (r.html.match(/<img[^>]*src="https?:/g) || []).length;

  add('A. 图片处理', '正常图片转 base64', base64Count === 1, `转成 ${base64Count} 张`);
  add('A. 图片处理', '坏图（防盗链404）被识别剔除', r.inlineFailed.length === 1, `识别失败 ${r.inlineFailed.length} 张`);
  add('A. 图片处理', '正文无残留外链图', residualExt === 0, `残留 ${residualExt} 个`);
  add('A. 图片处理', '文字段落完整保留', r.html.includes('段落一') && r.html.includes('段落二') && r.html.includes('收尾'), '三段文字均在');
  add('A. 图片处理', '图片URL提取完整', r.images.length === 2, `提取 ${r.images.length} 个`);
}

async function testInjection() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
  const HTML = `<h2>标题</h2><p>正文<strong>加粗</strong>。</p><p><img src="${IMG}" /></p><p>收尾段落。</p>`;

  const cases = [
    { name: 'ProseMirror（头条/百家号/微信）', dom: '<div id="e" class="ProseMirror" contenteditable="true" style="min-height:150px"></div>' },
    { name: 'DraftJS（知乎）', dom: '<div class="public-DraftEditor-content"><div id="e" contenteditable="true" style="min-height:150px"></div></div>' },
    { name: 'UEditor（微信旧版）', dom: '<div id="e" class="edui-body-container" contenteditable="true" style="min-height:150px"></div>' },
    { name: '普通 contenteditable', dom: '<div id="e" contenteditable="true" style="min-height:150px"></div>' },
  ];

  for (const c of cases) {
    const page = await browser.newPage();
    await page.setContent(c.dom);
    const inst = Object.create(BasePublisher.prototype);
    let stat;
    try {
      stat = await inst.fillBody(page, '#e', { html: HTML, text: '标题 正文加粗。 收尾段落。' }, () => {});
    } catch (e) { stat = { len: 0, imgs: 0, expectedImages: 1, error: e.message }; }
    const pass = !stat.error && stat.len > 10 && stat.imgs === 1;
    add('B. 富文本注入', c.name, pass, `文字 ${stat.len} 字 / 图片 ${stat.imgs}/1 张${stat.error ? ' 异常:' + stat.error : ''}`);

    const fmt = await page.evaluate(() => {
      const el = document.querySelector('#e');
      return {
        h2: !!el.querySelector('h2'), strong: !!el.querySelector('strong'),
        token: /IMG_\d/.test(el.innerText), src: [...el.querySelectorAll('img')].every((i) => i.src.startsWith('data:image/')),
      };
    });
    add('B. 富文本注入', `${c.name} · 格式/清理`, fmt.h2 && fmt.strong && !fmt.token && fmt.src, `标题${fmt.h2 ? '✓' : '✗'} 加粗${fmt.strong ? '✓' : '✗'} 无残留${!fmt.token ? '✓' : '✗'} base64图${fmt.src ? '✓' : '✗'}`);
    await page.close();
  }
  await browser.close();
}

async function testBrowserAndLogin() {
  const d = await bm.diagnose();
  add('C. 浏览器连接', '调试端口监听', d.portOpen, d.portOpen ? d.browser : '未监听');
  if (!d.portOpen) {
    add('C. 浏览器连接', 'CDP 连接', false, '端口未开，请先点「拉起浏览器」');
    return;
  }
  try {
    await bm.connect();
    const ctx = bm.getContext();
    const p = await ctx.newPage();
    await p.goto('about:blank');
    await p.close();
    add('C. 浏览器连接', 'CDP 连接与页面控制', true, '可创建/关闭页面');
  } catch (e) {
    add('C. 浏览器连接', 'CDP 连接与页面控制', false, e.message.split('\n')[0]);
    return;
  }

  const ctx = bm.getContext();
  for (const [id, adapter] of Object.entries(adapters)) {
    try {
      const r = await adapter.checkLogin(ctx);
      add('D. 平台登录态', adapter.meta.name, r.ok, r.message);
    } catch (e) {
      add('D. 平台登录态', adapter.meta.name, false, e.message.split('\n')[0]);
    }
  }
}

async function main() {
  console.log('开始完整验证...\n');
  await testImagePipeline();
  await testInjection();
  await testBrowserAndLogin();

  const sections = [...new Set(results.map((r) => r.section))];
  for (const s of sections) {
    console.log(`\n===== ${s} =====`);
    results.filter((r) => r.section === s).forEach((r) => {
      console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  —— ${r.detail}`);
    });
  }

  // 离线项必须全过；登录态是环境相关，单独统计
  const offline = results.filter((r) => r.section.startsWith('A') || r.section.startsWith('B'));
  const online = results.filter((r) => r.section.startsWith('C') || r.section.startsWith('D'));
  const offlinePass = offline.every((r) => r.pass);
  const connPass = online.filter((r) => r.section.startsWith('C')).every((r) => r.pass);
  const loginCount = online.filter((r) => r.section.startsWith('D') && r.pass).length;

  console.log('\n========== 总结 ==========');
  console.log(`离线链路（图片处理+注入）：${offlinePass ? '全部通过 ✅' : '存在失败 ❌'}`);
  console.log(`浏览器连接：${connPass ? '正常 ✅' : '异常 ❌'}`);
  console.log(`平台登录态：${loginCount}/${Object.keys(adapters).length} 个已登录`);
  if (loginCount === 0) console.log('  → 请在专用浏览器窗口登录各平台后重跑本脚本');

  const out = path.join(__dirname, '..', 'data', 'verify-report.json');
  fs.writeFileSync(out, JSON.stringify({ time: new Date().toISOString(), results }, null, 2));
  console.log(`\n详细报告：${out}`);

  process.exit(offlinePass && connPass ? 0 : 1);
}

main().catch((e) => { console.error('验证异常：', e); process.exit(1); });
