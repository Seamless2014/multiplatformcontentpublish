/* 探测：贴吧发贴编辑器内所有 file input 的真实身份（哪个是图片通道，哪个是视频封面） */
const path = require('path');
const bm = require(path.join(__dirname, '..', '..', 'src', 'core', 'browser'));

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  const forum = process.env.TIEBA_FORUM || '数字化管理师';
  await page.goto('https://tieba.baidu.com/f?kw=' + encodeURIComponent(forum), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  const addBtn = await page.evaluate(() => {
    const el = document.querySelector('.add-post');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!addBtn) { console.log('未找到 +发贴 按钮'); process.exit(1); }
  await page.mouse.click(addBtn.x, addBtn.y);
  await page.waitForTimeout(5000);

  const inputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input[type="file"]')].map((el, i) => {
      const r = el.getBoundingClientRect();
      let chain = [];
      let p = el;
      for (let d = 0; d < 5 && p; d++) { chain.push((p.className || p.tagName).toString().slice(0, 60)); p = p.parentElement; }
      return {
        idx: i,
        cls: (el.className || '').toString().slice(0, 80),
        accept: el.accept || '',
        multiple: el.multiple,
        id: el.id, name: el.name,
        visible: r.width > 0 && r.height > 0,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        parents: chain,
      };
    });
  });
  console.log('file input 总数:', inputs.length);
  for (const it of inputs) {
    console.log(`\n#${it.idx} cls="${it.cls}" accept="${it.accept}" multiple=${it.multiple} visible=${it.visible} rect=${JSON.stringify(it.rect)}`);
    console.log('   parents:', it.parents.join('  <-  '));
  }

  // 同时看编辑器结构里有没有「图片」按钮
  const imgBtns = await page.evaluate(() => [...document.querySelectorAll('button, .action-btn, [class*="btn"]')]
    .filter((el) => /图片/.test(el.textContent || '') && (el.textContent || '').length < 20)
    .map((el) => ({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), text: el.textContent.trim().slice(0, 20) })));
  console.log('\n含「图片」的按钮:', JSON.stringify(imgBtns, null, 1));

  await page.screenshot({ path: path.join(__dirname, '..', '..', 'screenshots', 'probe-tieba-inputs.png') });
  await page.close();
  console.log('\n完成（页面已关闭，未提交任何内容）');
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
