/**
 * 实测：点击「上传图文」页签后，file input 的 accept / DOM 是否切换。
 */
const bm = require('../src/core/browser');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /creator\.xiaohongshu\.com\/publish/.test(p.url()));
  if (!page) { console.error('未找到小红书发布页'); process.exit(1); }
  await page.bringToFront();
  await page.waitForTimeout(1500);

  const dump = async (tag) => {
    const s = await page.evaluate(() => ({
      activeTab: (() => { const e = document.querySelector('.creator-tab.active'); return e ? e.innerText.trim() : null; })(),
      inputs: [...document.querySelectorAll('input[type="file"]')].map((el) => ({ accept: el.accept, cls: String(el.className).slice(0, 60), rect: (() => { const r = el.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)}`; })() })),
      uploadHint: (() => { const p = [...document.querySelectorAll('p')].find((e) => /拖拽|点击上传/.test(e.innerText)); return p ? p.innerText.trim() : null; })(),
      editables: document.querySelectorAll('[contenteditable="true"]').length,
      textareas: document.querySelectorAll('textarea').length,
    }));
    console.log(`\n[${tag}] activeTab=${s.activeTab} | editables=${s.editables} textareas=${s.textareas} | hint="${s.uploadHint}"`);
    for (const i of s.inputs) console.log(`   input accept="${i.accept}" cls="${i.cls}" @${i.rect}`);
  };

  await dump('切换前');

  // 用坐标点击可见的「上传图文」页签（x>0 且 y<150）
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.creator-tab')].map((el) => { const r = el.getBoundingClientRect(); return { text: el.innerText.trim(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }));
  console.log('\n所有 .creator-tab:', JSON.stringify(tabs, null, 1));

  const target = tabs.find((t) => t.text === '上传图文' && t.x > 0 && t.y > 0 && t.y < 150);
  if (!target) { console.error('未找到可见的「上传图文」页签'); process.exit(1); }
  console.log(`\n点击「上传图文」@(${target.x + target.w / 2}, ${target.y + target.h / 2})`);
  await page.mouse.click(target.x + target.w / 2, target.y + target.h / 2);
  await page.waitForTimeout(3000);

  await dump('切换后');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
