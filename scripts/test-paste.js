/**
 * 离线验证：模拟编辑器 DOM，检验 fillBody 的文字 + 图片注入是否真的生效
 * 用法：node scripts/test-paste.js
 * 说明：playwright-core 不带浏览器，这里复用用户已安装的 Chrome（channel: 'chrome'）
 */
const { chromium } = require('playwright-core');
const { BasePublisher } = require('../src/adapters/base');

const IMG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

const TEST_HTML = `<h1>测试标题</h1>
<p>第一段文字内容，用于验证粘贴是否正常。</p>
<p><img src="${IMG_1PX}" /></p>
<p>第二段文字内容，图片应该插在中间。</p>`;

const TEST_TEXT = '测试标题 第一段文字内容，用于验证粘贴是否正常。 第二段文字内容，图片应该插在中间。';

async function runCase(browser, name, editorHtml) {
  const page = await browser.newPage();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.setContent(`
    <div id="editor" contenteditable="true"
      style="min-height:200px;border:1px solid #ccc;padding:10px;font-family:sans-serif">${editorHtml}</div>
  `);

  const inst = Object.create(BasePublisher.prototype);
  const logs = [];
  const stat = await inst.fillBody(page, '#editor', { html: TEST_HTML, text: TEST_TEXT }, (m) => logs.push(m));

  const finalHtml = await page.locator('#editor').innerHTML();
  console.log(`\n===== ${name} =====`);
  logs.forEach((l) => console.log('  · ' + l));
  console.log(`  最终：文字 ${stat.len} 字 / 图片 ${stat.imgs} 张（期望 ${stat.expectedImages}）`);
  console.log(`  判定：文字 ${stat.len > 10 ? 'PASS' : 'FAIL'} ｜ 图片 ${stat.imgs >= 1 ? 'PASS' : 'FAIL'}`);

  await page.close();
  return stat.imgs >= 1;
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    console.log('已启动 Chrome（headless）');
  } catch (e) {
    console.log('channel:chrome 启动失败，尝试 Edge：', e.message.split('\n')[0]);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  }

  const r1 = await runCase(browser, '空编辑器（常规场景）', '');
  const r2 = await runCase(browser, '编辑器已有内容（应被替换）', '<p>这是编辑器里原有的旧内容。</p>');

  await browser.close();
  console.log('\n========== 总判定 ==========');
  console.log(r1 && r2 ? 'PASS —— 图片注入链路可用' : 'FAIL —— 图片未注入，需继续修复');
  process.exit(r1 && r2 ? 0 : 1);
}

main().catch((e) => { console.error('测试异常：', e.message); process.exit(1); });
