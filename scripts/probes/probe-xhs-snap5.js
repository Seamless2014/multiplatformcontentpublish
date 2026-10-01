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
  const doc = documents[0];
  const { nodes, layout } = doc;
  const S = (i) => (i >= 0 && strings[i] ? strings[i] : '');

  const nodeIndexToLayout = new Map();
  layout.nodeIndex.forEach((ni, li) => { if (!nodeIndexToLayout.has(ni)) nodeIndexToLayout.set(ni, li); });

  const boxOf = (ni) => {
    const li = nodeIndexToLayout.get(ni);
    if (li === undefined) return null;
    const b = layout.bounds[li];
    return { x: b[0], y: b[1], w: b[2], h: b[3] };
  };
  const parentOf = (ni) => (nodes.parentIndex && nodes.parentIndex[ni] >= 0 ? nodes.parentIndex[ni] : null);
  const chainStr = (ni) => {
    const parts = [];
    let cur = ni;
    let hops = 0;
    while (cur !== null && hops < 8) {
      const attrs = nodes.attributes ? nodes.attributes[cur] : null;
      let cls = '';
      if (attrs && attrs.length) {
        for (let k = 0; k + 1 < attrs.length; k += 2) {
          if (S(attrs[k]) === 'class') { cls = S(attrs[k + 1]).slice(0, 50); break; }
        }
      }
      parts.push('<' + S(nodes.nodeName[cur]) + (cls ? ' .' + cls : '') + '>');
      cur = parentOf(cur);
      hops++;
    }
    return parts.join(' > ');
  };

  for (let i = 0; i < nodes.nodeValue.length; i++) {
    const vi = nodes.nodeValue[i];
    if (vi < 0) continue;
    const t = strings[vi];
    if (t !== '暂存离开' && t !== '发布') continue;
    const p = parentOf(i);
    const box = p !== null ? boxOf(p) : null;
    console.log('文本 "' + t + '" 父节点#' + p + ' ' + chainStr(p));
    console.log('  父box=' + JSON.stringify(box));
    // 父的父（按钮容器）
    const pp = p !== null ? parentOf(p) : null;
    if (pp !== null) {
      console.log('  祖父 ' + chainStr(pp).slice(0, 120));
      console.log('  祖box=' + JSON.stringify(boxOf(pp)));
    }
  }
  await client.detach().catch(() => {});
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
