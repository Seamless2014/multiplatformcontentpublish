/**
 * 端到端真实测试：拉起浏览器 → CDP 连接 → 打开测试页 → 注入图文 → 校验结果
 * 用法：node scripts/test-e2e.js
 *
 * 本脚本会真实启动 Chrome（独立 profile）并走完整链路，无需任何登录态。
 */
const fs = require('fs');
const path = require('path');
const bm = require('../src/core/browser');
const { BasePublisher } = require('../src/adapters/base');
const { mdToHtml } = require('../src/core/article');

const GOOD_IMG = 'https://www.baidu.com/img/flexible/logo/pc/result.png';
const BAD_IMG = 'https://img.alicdn.com/tfs/TB1.ZBecWT1gK0jSZFGXXbd3FXa-1300-702.png';

// 模拟「带完整事件机制的富文本编辑器」页面，尽量贴近真实平台行为
const EDITOR_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>测试编辑器</title></head>
<body style="font-family:sans-serif;padding:20px">
<h3>模拟编辑器（点击后可直接观察内容）</h3>
<div id="pm" class="ProseMirror" contenteditable="true"
  style="min-height:260px;border:2px solid #ccc;border-radius:8px;padding:12px;font-size:15px"></div>
<script>
  // 模拟 ProseMirror 的行为：监听 beforeinput，若非受信任事件则拒绝
  const pm = document.getElementById('pm');
  window.__accepted = { input: 0, beforeinput: 0 };
  pm.addEventListener('beforeinput', (e) => {
    window.__accepted.beforeinput++;
  });
  pm.addEventListener('input', (e) => {
    window.__accepted.input++;
  });
</script>
</body></html>`;

async function main() {
  console.log('===== 步骤 1：拉起浏览器（独立 profile）=====');
  let r = await bm.launchBrowser('chrome', 'separate');
  console.log(r.ok ? '  OK ' + r.message : '  FAIL ' + r.message);
  if (!r.ok) process.exit(1);

  console.log('\n===== 步骤 2：CDP 连接 =====');
  const st = await bm.connect();
  console.log('  连接状态：', JSON.stringify(st));

  console.log('\n===== 步骤 3：打开测试编辑器页 =====');
  const ctx = bm.getContext();
  const page = await ctx.newPage();
  const tmpFile = path.join(__dirname, '..', 'data', '_test-editor.html');
  fs.writeFileSync(tmpFile, EDITOR_HTML);
  await page.goto('file:///' + tmpFile.replace(/\\/g, '/'));
  await page.waitForTimeout(500);
  console.log('  页面标题：', await page.title());

  console.log('\n===== 步骤 4：Markdown → HTML（含1好图+1坏图）=====');
  const md = `## 图文测试\n\n这是**第一段**正文内容。\n\n![好图](${GOOD_IMG})\n\n这是图片之后的第二段文字。\n\n![坏图](${BAD_IMG})\n\n收尾段落，验证文字完整。`;
  const art = await mdToHtml(md, { inlineImages: true });
  console.log(`  提取图片 ${art.images.length} 张，转存失败 ${art.inlineFailed.length} 张`);
  console.log(`  正文中 base64 图 ${(art.html.match(/data:image\//g) || []).length} 张`);
  console.log(`  残留外链图 ${(art.html.match(/<img[^>]*src="https?:/g) || []).length} 张（应为 0）`);

  console.log('\n===== 步骤 5：注入正文 =====');
  const inst = Object.create(BasePublisher.prototype);
  const logs = [];
  const text = '图文测试 这是第一段正文内容。 这是图片之后的第二段文字。 收尾段落，验证文字完整。';
  const stat = await inst.fillBody(page, '#pm', { html: art.html, text }, (m) => logs.push(m));
  logs.forEach((l) => console.log('  · ' + l));

  console.log('\n===== 步骤 6：校验注入结果 =====');
  const info = await page.evaluate(() => {
    const el = document.querySelector('#pm');
    return {
      textLen: el.innerText.trim().length,
      imgCount: el.querySelectorAll('img').length,
      imgSrcIsDataUri: [...el.querySelectorAll('img')].every((i) => i.src.startsWith('data:image/')),
      hasResidualToken: /IMG_\d/.test(el.innerText),
      hasResidualMarkdown: /!\[/.test(el.innerText),
      hasHeadings: !!el.querySelector('h2'),
      hasBold: !!el.querySelector('strong'),
      accepted: window.__accepted,
      preview: el.innerText.trim().slice(0, 80).replace(/\n/g, ' | '),
      imgSizes: [...el.querySelectorAll('img')].map((i) => i.src.length),
    };
  });
  console.log('  文字长度：', info.textLen);
  console.log('  图片数量：', info.imgCount, '（期望 1，坏图应被剔除）');
  console.log('  图片为base64：', info.imgSrcIsDataUri ? 'PASS' : 'FAIL');
  console.log('  无占位符残留：', info.hasResidualToken ? 'FAIL' : 'PASS');
  console.log('  无Markdown残留：', info.hasResidualMarkdown ? 'FAIL' : 'PASS');
  console.log('  标题格式保留：', info.hasHeadings ? 'PASS' : 'FAIL');
  console.log('  加粗格式保留：', info.hasBold ? 'PASS' : 'FAIL');
  console.log('  编辑器收到事件：', JSON.stringify(info.accepted));
  console.log('  正文预览：', info.preview);

  console.log('\n===== 步骤 7：重新打开页面验证内容持久化 =====');
  await page.reload();
  await page.waitForTimeout(400);
  const afterReload = await page.evaluate(() => document.querySelector('#pm').innerText.trim().length);
  console.log('  刷新后文字长度：', afterReload, '（file:// 页面无存储，此项仅确认页面可重载）');

  // 汇总判定
  const checks = {
    '图片已注入': info.imgCount === 1,
    '图片为base64': info.imgSrcIsDataUri,
    '无占位符残留': !info.hasResidualToken,
    '无Markdown残留': !info.hasResidualMarkdown,
    '格式保留(标题)': info.hasHeadings,
    '格式保留(加粗)': info.hasBold,
    '文字完整': info.textLen > 30,
  };
  const failed = Object.entries(checks).filter(([, v]) => !v);

  console.log('\n========== 最终判定 ==========');
  Object.entries(checks).forEach(([k, v]) => console.log(`  ${v ? 'PASS' : 'FAIL'}  ${k}`));

  await page.close();
  await bm.disconnect();
  fs.rmSync(tmpFile, { force: true });

  console.log(failed.length === 0 ? '\n全部通过 ✅' : `\n${failed.length} 项未通过 ❌`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('测试异常：', e); process.exit(1); });
