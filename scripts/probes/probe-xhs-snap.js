const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /creator\.xiaohongshu\.com\/publish/.test(p.url()));
  if (!page) { console.error('no page'); process.exit(1); }
  await page.bringToFront();

  const client = await ctx.newCDPSession(page);
  const snap = await client.send('DOMSnapshot.captureSnapshot', { computedStyles: [] });
  const { strings, documents } = snap;
  const S = (i) => (i >= 0 && i < strings.length ? strings[i] : '');

  // 遍历所有 document 的 layout/node 索引，找文本含「暂存离开」「发布」的元素及其 box
  const results = [];
  for (const doc of documents) {
    const { nodes, layout } = doc;
    for (let i = 0; i < nodes.nodeName.length; i++) {
      const name = S(nodes.nodeName[i]);
      // 文本节点
      const tv = nodes.textValue ? nodes.textValue[i] : null;
      if (tv && tv.value >= 0) {
        const t = S(tv.value).trim();
        if (t === '暂存离开' || t === '发布') {
          const boxIdx = layout.nodeIndex.indexOf(i);
          if (boxIdx >= 0) {
            results.push({ name, text: t, box: { x: S(layout.bounds[boxIdx][0]), y: S(layout.bounds[boxIdx][1]), w: S(layout.bounds[boxIdx][2]), h: S(layout.bounds[boxIdx][3]) } });
          } else {
            results.push({ name, text: t, box: null });
          }
        }
      }
    }
  }
  console.log('命中文本节点:');
  for (const r of results) console.log('  <' + r.name + '> "' + r.text + '" box=' + JSON.stringify(r.box));

  await client.detach().catch(() => {});
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
