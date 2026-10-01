/**
 * 富文本框架兼容性测试
 * 模拟 ProseMirror / DraftJS / UEditor 的 DOM 结构，检验注入是否生效
 * 用法：node scripts/test-frameworks.js
 */
const { chromium } = require('playwright-core');
const { BasePublisher } = require('../src/adapters/base');

const IMG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

const HTML = `<h2>小标题</h2>
<p>正文段落，<strong>加粗内容</strong>。</p>
<p><img src="${IMG_1PX}" /></p>
<p>图片之后的收尾段落。</p>`;

const CASES = [
  {
    name: 'ProseMirror（头条/百家号/微信）',
    dom: '<div id="editor" class="ProseMirror" contenteditable="true" style="min-height:200px;padding:8px"></div>',
    sel: '#editor',
  },
  {
    name: 'DraftJS（知乎）',
    dom: '<div class="public-DraftEditor-content"><div id="editor" contenteditable="true" style="min-height:200px;padding:8px"></div></div>',
    sel: '#editor',
  },
  {
    name: 'UEditor iframe 容器（微信旧版）',
    dom: '<div class="edui-body-container" id="editor" contenteditable="true" style="min-height:200px;padding:8px"></div>',
    sel: '#editor',
  },
  {
    name: '普通 contenteditable（对照）',
    dom: '<div id="editor" contenteditable="true" style="min-height:200px;padding:8px"></div>',
    sel: '#editor',
  },
];

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];

  for (const c of CASES) {
    const page = await browser.newPage();
    await page.setContent(c.dom);
    const inst = Object.create(BasePublisher.prototype);
    const logs = [];
    let stat;
    try {
      stat = await inst.fillBody(page, c.sel, { html: HTML, text: '小标题 正文段落，加粗内容。 图片之后的收尾段落。' }, (m) => logs.push(m));
    } catch (e) {
      stat = { error: e.message, len: 0, imgs: 0, expectedImages: 1, missing: 1 };
    }
    const pass = !stat.error && stat.len > 10 && stat.imgs >= 1;

    console.log(`\n===== ${c.name} =====`);
    logs.forEach((l) => console.log('  · ' + l));
    if (stat.error) console.log('  异常：' + stat.error);
    console.log(`  结果：文字 ${stat.len} 字 / 图片 ${stat.imgs}/${stat.expectedImages} 张`);
    console.log(`  判定：${pass ? 'PASS' : 'FAIL'}`);
    results.push(pass);
    await page.close();
  }

  await browser.close();
  const okCount = results.filter(Boolean).length;
  console.log(`\n========== 汇总：${okCount}/${results.length} 通过 ==========`);
  process.exit(okCount === results.length ? 0 : 1);
}

main().catch((e) => { console.error('测试异常：', e.message); process.exit(1); });
