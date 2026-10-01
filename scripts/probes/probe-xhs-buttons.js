/**
 * 探测小红书发布页底部按钮的真实 DOM 结构。
 * 只读，不点击、不修改。用于定位「暂存离开」按钮的标签/类名/可见性/遮挡情况。
 */
const bm = require('../src/core/browser');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const pages = ctx.pages();

  let page = pages.find((p) => /creator\.xiaohongshu\.com/.test(p.url()));
  if (!page) {
    page = await ctx.newPage();
    await page.goto('https://creator.xiaohongshu.com/publish/publish?target=image', { waitUntil: 'domcontentloaded' });
  }
  await page.bringToFront();
  await page.waitForTimeout(3500);

  console.log('URL:', page.url());

  const info = await page.evaluate(() => {
    const out = { textHits: [], bottomButtons: [], allBtnLike: [] };

    // 1) 含「暂存」「草稿」「发布」文本的所有元素
    const all = [...document.querySelectorAll('*')];
    for (const el of all) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      if (!own) continue;
      if (/暂存|草稿|发布|存为/.test(own) && own.length <= 20) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        out.textHits.push({
          text: own,
          tag: el.tagName,
          cls: (el.className && el.className.toString().slice(0, 120)) || '',
          id: el.id || '',
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          vis: cs.visibility,
          display: cs.display,
          opacity: cs.opacity,
          pointerEvents: cs.pointerEvents,
          role: el.getAttribute('role') || '',
          parentTag: el.parentElement ? el.parentElement.tagName : '',
          parentCls: el.parentElement ? String(el.parentElement.className).slice(0, 120) : '',
        });
      }
    }

    // 2) 视口底部区域（y > innerHeight*0.6）所有 button / [role=button] / 可点击元素
    const H = window.innerHeight, W = window.innerWidth;
    for (const el of all) {
      const tag = el.tagName;
      const role = el.getAttribute('role') || '';
      const isBtnLike = tag === 'BUTTON' || role === 'button' || /btn|button/i.test(String(el.className));
      if (!isBtnLike) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.y < H * 0.55) continue;
      const cs = getComputedStyle(el);
      out.bottomButtons.push({
        text: (el.innerText || '').trim().slice(0, 30),
        tag, role,
        cls: String(el.className).slice(0, 140),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        vis: cs.visibility, display: cs.display, opacity: cs.opacity, pointerEvents: cs.pointerEvents,
        zIndex: cs.zIndex,
      });
    }

    // 3) 该元素中心点上真实命中的顶层元素（检测遮挡）
    const probe = (x, y) => {
      const top = document.elementFromPoint(x, y);
      if (!top) return null;
      return { tag: top.tagName, cls: String(top.className).slice(0, 120), text: (top.innerText || '').trim().slice(0, 30) };
    };
    out.viewport = { W, H };
    out.hitTests = [];
    for (const h of out.textHits) {
      if (h.rect.w <= 0 || h.rect.h <= 0) continue;
      const cx = h.rect.x + h.rect.w / 2, cy = h.rect.y + h.rect.h / 2;
      if (cx < 0 || cy < 0 || cx > W || cy > H) continue;
      out.hitTests.push({ target: h.text, tag: h.tag, at: { x: Math.round(cx), y: Math.round(cy) }, top: probe(cx, cy) });
    }
    return out;
  });

  console.log('\n=== 视口 ===', JSON.stringify(info.viewport));
  console.log('\n=== 文本命中（暂存/草稿/发布）===');
  for (const h of info.textHits) {
    console.log(`  [${h.text}] <${h.tag}> cls="${h.cls}" rect=${JSON.stringify(h.rect)} vis=${h.vis} disp=${h.display} pe=${h.pointerEvents} parent=<${h.parentTag} cls="${h.parentCls}">`);
  }
  console.log('\n=== 底部可视 button-like ===');
  for (const b of info.bottomButtons) {
    console.log(`  [${b.text}] <${b.tag}> role=${b.role} cls="${b.cls}" rect=${JSON.stringify(b.rect)} vis=${b.vis} disp=${b.display} pe=${b.pointerEvents} z=${b.zIndex}`);
  }
  console.log('\n=== 命中测试（中心点最顶层元素）===');
  for (const h of info.hitTests) {
    console.log(`  目标[${h.target}] <${h.tag}> @${JSON.stringify(h.at)} → 顶层 <${h.top ? h.top.tag : 'null'}> cls="${h.top ? h.top.cls : ''}" text="${h.top ? h.top.text : ''}"`);
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
