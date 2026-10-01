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

  const targets = new Set();
  strings.forEach((s, i) => { if (s === '暂存离开' || s === '发布') targets.add(i); });
  console.log('目标字符串索引: ' + [...targets].join(','));

  const doc = documents[0];
  const { nodes, layout } = doc;
  const nodeIndexToLayout = new Map();
  layout.nodeIndex.forEach((ni, li) => { if (!nodeIndexToLayout.has(ni)) nodeIndexToLayout.set(ni, li); });

  // 遍历所有可能携带文本的字段
  const fields = ['textValue', 'inputValue', 'inputChecked', 'optionSelected', 'currentValue', 'pseudoElements', 'pseudoType'];
  for (const f of fields) {
    if (!nodes[f]) continue;
    for (let i = 0; i < nodes[f].length; i++) {
      const v = nodes[f][i];
      if (!v || v.value === undefined) continue;
      if (targets.has(v.value)) {
        const li = nodeIndexToLayout.get(i);
        let boxStr = '无布局';
        if (li !== undefined) {
          const b = layout.bounds[li];
          boxStr = JSON.stringify({ x: b[0], y: b[1], w: b[2], h: b[3] });
        }
        console.log('[' + f + '] node#' + i + ' <' + S(nodes.nodeName[i]) + '> text="' + S(v.value) + '" box=' + boxStr);
      }
    }
  }
  await client.detach().catch(() => {});
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
