/**
 * 探测头条发布页：「我知道了」提示条 + 是否有全屏遮罩拦截 click
 */
const path = require('path');
const fs = require('fs');
const bm = require('../../src/core/browser');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = await ctx.newPage();
  const out = [];
  const log = (m) => { out.push(m); console.log(m); };

  try {
    log('打开头条发布页');
    await page.goto('https://mp.toutiao.com/profile_v4/graphic/publish', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    log('URL: ' + page.url());

    // 1) 找「我知道了」提示条
    const tipInfo = await page.evaluate(() => {
      const hits = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) {
        const el = walker.currentNode;
        const t = (el.innerText || '').trim();
        if (t.includes('我知道了') && t.length < 80) {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          hits.push({
            tag: el.tagName, cls: (el.className || '').toString().slice(0, 80),
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            pos: cs.position, z: cs.zIndex, text: t.slice(0, 50),
          });
        }
      }
      return hits;
    });
    log('含「我知道了」的元素: ' + JSON.stringify(tipInfo, null, 2));

    // 2) 在编辑器中心点做 elementFromPoint，看点击会落到谁身上
    const proCount = await page.locator('.ProseMirror').count();
    log('.ProseMirror 数量: ' + proCount);
    if (proCount > 0) {
      const hit = await page.evaluate(() => {
        const el = document.querySelector('.ProseMirror');
        const r = el.getBoundingClientRect();
        const cx = r.x + r.width / 2, cy = r.y + Math.min(r.height / 2, 200);
        const top = document.elementFromPoint(cx, cy);
        const chain = [];
        let cur = top;
        while (cur && chain.length < 6) {
          chain.push(cur.tagName + '.' + ((cur.className || '').toString().split(' ')[0] || '').slice(0, 40));
          cur = cur.parentElement;
        }
        // 收集全屏尺寸的高 z-index 元素（疑似遮罩）
        const overlays = [];
        document.querySelectorAll('body *').forEach((e) => {
          const b = e.getBoundingClientRect();
          const cs = getComputedStyle(e);
          if (b.width >= innerWidth * 0.9 && b.height >= innerHeight * 0.9 && cs.position !== 'static') {
            overlays.push({ tag: e.tagName, cls: (e.className || '').toString().slice(0, 60), pe: cs.pointerEvents, z: cs.zIndex, vis: cs.visibility, disp: cs.display });
          }
        });
        return { cx, cy, topChain: chain, overlays: overlays.slice(0, 8) };
      });
      log('编辑器中心 elementFromPoint 链: ' + JSON.stringify(hit.topChain));
      log('全屏疑似遮罩: ' + JSON.stringify(hit.overlays, null, 2));

      // 3) 真实 click 测试（15s 内是否能落上）
      try {
        await page.locator('.ProseMirror').first().click({ timeout: 8000 });
        log('click 结果: 成功');
      } catch (e) {
        log('click 结果: 失败 - ' + e.message.split('\n')[0]);
        // 4) fallback: focus() 是否可行
        try {
          await page.locator('.ProseMirror').first().focus({ timeout: 3000 });
          log('focus 结果: 成功');
        } catch (e2) {
          log('focus 结果: 失败 - ' + e2.message.split('\n')[0]);
        }
        // 5) force click 是否可行
        try {
          await page.locator('.ProseMirror').first().click({ timeout: 5000, force: true });
          log('force click 结果: 成功');
        } catch (e3) {
          log('force click 结果: 失败 - ' + e3.message.split('\n')[0]);
        }
      }
    }

    // 6) 顺带检查标题框
    const titleSel = ['textarea[placeholder*="标题"]', 'input[placeholder*="标题"]', '.article-input__title'];
    for (const s of titleSel) {
      const c = await page.locator(s).count();
      log(`标题选择器 ${s}: ${c} 个`);
    }

    await page.screenshot({ path: path.join(__dirname, '../../screenshots/probe-toutiao-guide.png') });
    log('截图: probe-toutiao-guide.png');
  } catch (e) {
    log('异常: ' + e.message.split('\n')[0]);
  } finally {
    fs.writeFileSync(path.join(__dirname, 'probe-toutiao-guide.out.txt'), out.join('\n'));
    await page.close().catch(() => {});
    bm.disconnect().catch(() => {});
    process.exit(0);
  }
})();
