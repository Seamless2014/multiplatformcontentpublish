/**
 * 平台适配器基类：统一接口 checkLogin / publish
 * 所有适配器共同约定：
 *  - mode = 'draft'：填写完成后保存为草稿（不对外发布，安全默认值）
 *  - mode = 'publish'：直接点平台的发布/群发按钮（公众号群发不可撤回，慎用）
 *  - publish() 失败时自动截图留证（screenshots/ 目录）
 */
const browserMgr = require('../core/browser');
const { mdToHtml, htmlToText } = require('../core/article');

class BasePublisher {
  /** 子类必须提供 meta：{ id, name, homeUrl } */
  get meta() { throw new Error('not implemented'); }

  /** 依序尝试多个 selector，返回第一个可见元素（超时返回 null） */
  async trySelect(page, selectors, timeout = 6000) {
    for (const sel of selectors) {
      try {
        const el = page.locator(sel).first();
        await el.waitFor({ state: 'visible', timeout });
        return el;
      } catch { /* try next */ }
    }
    return null;
  }

  /** 子类实现：登录态检测，返回 { ok, message } */
  async doCheckLogin(page) { throw new Error('not implemented'); }

  async checkLogin(context) {
    // newPage 必须放在 try 内：浏览器被关闭时它会抛错，
    // 若在 try 外抛出会变成未捕获异常，直接带崩整个 Node 服务。
    let page = null;
    try {
      page = await context.newPage();
      await page.goto(this.meta.homeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      return await this.doCheckLogin(page);
    } catch (e) {
      return { ok: false, message: `检测失败：${e.message.split('\n')[0]}` };
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  /** 子类实现：发布流程，返回 { ok, url?, message } */
  async doPublish(page, article, ctx, log) { throw new Error('not implemented'); }

  /**
   * 统一填写正文：注入文字结构 → 按占位符逐张回填图片 → 校验结果
   * @param {{keepImages?: boolean}} opts
   *   keepImages=true：不剥离图片、不做占位符替换，正文 HTML（含 base64 图）一次性注入。
   *   适用于「编辑器会自行转存 base64 图」的平台——实测头条 ProseMirror 接受整体注入
   *   并自动上传；而占位符+DOM 兜底插 img 的方式会被其 schema 丢弃（真实踩坑）。
   * @returns {{ method, len, imgs, expectedImages, missing }} 便于日志诊断
   */
  async fillBody(page, selector, article, log = () => {}, opts = {}) {
    const keep = !!opts.keepImages;
    let html, imgs;
    if (keep) {
      html = article.html;
      imgs = [];
      const m = (article.html.match(/<img[^>]*src="data:/g) || []).length;
      log(`注入正文（keepImages 模式，含 ${m} 张 base64 图，不剥离）`);
    } else {
      ({ html, imgs } = stripImages(article.html));
    }
    const plain = article.text || '';

    const r = await pasteRichText(page, selector, html, { text: plain });
    log(`注入方式：${r.method}，文字 ${r.len} 字，含图 ${r.imgs} 张`);

    if (r.len < 3 && plain.length > 3) {
      throw new Error('正文注入失败（编辑器未接收内容，可能被富文本框架拦截）');
    }

    if (!keep) {
      // 逐张回填图片，失败自动重试一次
      for (let i = 0; i < imgs.length; i++) {
        let ok = await replaceTokenWithImage(page, selector, IMG_TOKEN(i), imgs[i]);
        if (!ok) {
          await page.waitForTimeout(600);
          ok = await replaceTokenWithImage(page, selector, IMG_TOKEN(i), imgs[i]);
        }
        if (!ok) log(`第 ${i + 1} 张图未找到占位符`);
        await page.waitForTimeout(700); // 等平台处理/转存图片
      }

      // 清理可能残留的占位符文本
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) {
          if (/\u2063\u2063IMG_\d+\u2063\u2063/.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
        }
        nodes.forEach((n) => { n.nodeValue = n.nodeValue.replace(/\u2063\u2063IMG_\d+\u2063\u2063/g, ''); });
      }, selector).catch(() => {});
    }

    const after = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? { len: el.innerText.trim().length, imgs: el.querySelectorAll('img').length } : { len: 0, imgs: 0 };
    }, selector).catch(() => ({ len: 0, imgs: 0 }));

    const expected = keep ? (article.html.match(/<img[^>]*src="data:/g) || []).length : imgs.length;
    const missing = keep ? Math.max(0, expected - after.imgs) : Math.max(0, imgs.length - after.imgs);
    log(`正文结果：文字 ${after.len} 字，图片 ${after.imgs}/${expected} 张${missing ? `，${missing} 张未插入` : ''}`);

    return { method: r.method, len: after.len, imgs: after.imgs, expectedImages: expected, missing };
  }

  async publish(context, article, mode, log = () => {}) {
    // 同 checkLogin：newPage 必须包在 try 内，浏览器异常不能带崩服务
    let page = null;
    try {
      page = await context.newPage();
    } catch (e) {
      return { ok: false, message: `无法创建页面：${e.message.split('\n')[0]}（浏览器可能已关闭，请重新连接）` };
    }
    page.setDefaultTimeout(15000);
    try {
      // 预处理正文：markdown → html（图片内联 base64）+ 纯文本
      const { html, inlineFailed } = await mdToHtml(article.content, { inlineImages: this.meta.inlineImages !== false });
      const text = htmlToText(article.content);
      const payload = {
        title: (article.title || '').trim(),
        html,
        text,
        mode,
        images: article.images || [],
        forum: (article.forum || '').trim(), // 贴吧目标吧名（其他平台忽略）
      };
      const result = await this.doPublish(page, payload, { context }, log);
      if (inlineFailed.length) {
        result.message += `（${inlineFailed.length} 张外链图转存失败，可能需手动处理）`;
      }
      return result;
    } catch (e) {
      const shotName = page ? await browserMgr.shot(page, this.meta.id) : null;
      return {
        ok: false,
        message: `${e.message.split('\n')[0]}${shotName ? `（已截图 ${shotName}）` : ''}`,
        screenshot: shotName,
      };
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }
}

/**
 * 在编辑器 contenteditable 内注入内容（文字结构 + 图片）。
 *
 * 重要结论（已实测验证）：
 *  - 伪造 `new ClipboardEvent('paste', { clipboardData })` 完全无效 —— Chrome 出于
 *    安全考虑不允许脚本伪造粘贴内容，编辑器读不到我们放进去的 HTML。
 *  - 因此采用「DOM 直接写入 + 原生编辑事件」路线：
 *      1) 用 execCommand('insertHTML') 走浏览器原生编辑路径（编辑器能感知）
 *      2) 失败则退回设置 innerHTML
 *      3) 图片由 fillBody 逐张按占位符插入
 *  - 最后统一派发 input / change 事件，让 React/Vue/DraftJS 等受控组件同步内部状态。
 */
async function pasteRichText(page, selector, html, { text = null } = {}) {
  const plain = text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // 聚焦 + 全选，保证替换而非追加。
  // click 被页面遮罩/侧栏拦截时（如头条 AI 助手抽屉 mask），退化为 focus()——
  // focus 不经过命中测试，一样能把光标放进编辑器（2026-10-01 头条实测）。
  const focusEl = page.locator(selector).first();
  try {
    await focusEl.click({ timeout: 5000 });
  } catch {
    await focusEl.focus({ timeout: 5000 });
  }
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }, selector);

  const result = await page.evaluate(({ sel, h, p }) => {
    const el = document.querySelector(sel);
    if (!el) return { method: 'none', ok: false, len: 0, imgs: 0 };

    // 识别富文本框架：不同框架需要不同事件序列，否则内部 state 不同步
    const framework =
      el.classList.contains('ProseMirror') ? 'prosemirror'
      : document.querySelector('.public-DraftEditor-content') ? 'draftjs'
      : document.querySelector('.cke_editable') ? 'ckeditor'
      : document.querySelector('.edui-body-container') ? 'ueditor'
      : 'plain';

    const selectAll = () => {
      el.focus();
      const r = document.createRange();
      r.selectNodeContents(el);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      return r;
    };
    const fire = (inputType = 'insertFromPaste') => {
      try {
        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType, data: p }));
      } catch {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    let method = 'innerHTML';
    let ok = false;

    // ProseMirror / DraftJS 优先用 beforeinput + execCommand 组合，
    // 这类框架监听 beforeinput 自行接管插入，execCommand 只是触发源
    if (framework === 'prosemirror' || framework === 'draftjs') {
      try {
        selectAll();
        const be = new InputEvent('beforeinput', {
          bubbles: true, cancelable: true, inputType: 'insertFromPaste', data: p,
        });
        el.dispatchEvent(be);
        // 框架若未 preventDefault，则用 execCommand 落地
        ok = document.execCommand('insertHTML', false, h);
        if (ok) method = `${framework}-beforeinput+insertHTML`;
      } catch { ok = false; }
    }

    // 通用原生编辑路径
    if (!ok) {
      try {
        selectAll();
        ok = document.execCommand('insertHTML', false, h);
        if (ok) method = 'execCommand-insertHTML';
      } catch { ok = false; }
    }

    // 兜底：直接写 innerHTML
    if (!ok) {
      el.innerHTML = h;
      method = 'innerHTML';
      ok = true;
    }

    fire();

    // 框架内部 state 是否同步：看它有没有把内容还原（ProseMirror 常会）
    const len = el.innerText.trim().length;
    const imgs = el.querySelectorAll('img').length;

    // 若内容被框架回滚（长度明显不符），标记失败交给上层重试
    return { method: `${framework}/${method}`, ok, len, imgs };
  }, { sel: selector, h: html, p: plain });

  await page.waitForTimeout(500);
  return result;
}

/** 图片占位符：正文粘贴时用 <img> 无法可靠进入编辑器，
 *  改为先粘贴文字结构 + 唯一占位段，再在占位处逐张插入图片。
 *  （各平台插入图片的方式不同，由适配器实现 insertImage）
 */
const IMG_TOKEN = (i) => `\u2063\u2063IMG_${i}\u2063\u2063`;

/** 把 HTML 中的 <img> 替换为占位文本，返回 { html, imgs }
 *  会连同包裹的 <p> 一起替换，避免产生嵌套空段落。
 */
function stripImages(html) {
  const imgs = [];
  const take = (src) => { imgs.push(src); return `<p>${IMG_TOKEN(imgs.length - 1)}</p>`; };
  // 先处理「<p>...只含img...</p>」整体替换，再兜底裸 <img>
  let out = html.replace(/<p>\s*<img[^>]*src=["']([^"']+)["'][^>]*>\s*<\/p>/gi, (_m, src) => take(src));
  out = out.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, (_m, src) => take(src));
  return { html: out, imgs };
}

/** 在编辑器内把占位符替换为真实图片
 *  优先 execCommand('insertImage') 走原生编辑路径；失败则 DOM 插入。
 *  注：公众号会自动把 base64 转存素材库；小红书走独立上传通道（见其适配器）。
 */
async function replaceTokenWithImage(page, selector, token, dataUri) {
  return page.evaluate(({ sel, token, dataUri }) => {
    const el = document.querySelector(sel);
    if (!el) return false;

    // 找到包含占位符的文本节点
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node = null;
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.includes(token)) { node = walker.currentNode; break; }
    }
    if (!node) return false;

    const idx = node.nodeValue.indexOf(token);
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + token.length);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
    el.focus();

    let ok = false;
    try { ok = document.execCommand('insertImage', false, dataUri); } catch { ok = false; }

    if (!ok) {
      // 兜底：删掉占位文本，原位插入 img 节点
      const img = document.createElement('img');
      img.src = dataUri;
      range.deleteContents();
      range.insertNode(img);
      ok = true;
    }

    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertContent' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return ok;
  }, { sel: selector, token, dataUri });
}

/** 用 CDP 把本地图片文件塞进 <input type=file>（部分平台必须走上传通道） */
async function uploadImages(page, selector, filePaths) {
  try {
    const input = page.locator(selector).first();
    await input.waitFor({ state: 'attached', timeout: 8000 });
    await input.setInputFiles(filePaths);
    return true;
  } catch {
    return false;
  }
}
async function clickButton(page, texts, timeout = 6000) {
  for (const t of texts) {
    try {
      const btn = page.locator(`button:has-text("${t}"), a:has-text("${t}"), [role="button"]:has-text("${t}")`).first();
      await btn.waitFor({ state: 'visible', timeout });
      await btn.click();
      return true;
    } catch { /* try next */ }
  }
  return false;
}

/**
 * 点击 Web Component（closed shadow DOM）内部的按钮。
 * 小红书发布页底部「暂存离开/发布」是 <xhs-publish-btn> 自定义元素，内部为 closed shadow root：
 *  - 文本选择器 text=/ getByText 无法命中（Playwright 只穿透 open shadow）
 *  - document.querySelectorAll / innerText 也搜不到内部文本
 * 解法：CDP DOMSnapshot.captureSnapshot 会捕获 shadow 树全部节点（含文本与布局），
 *  从快照中按文本找到宿主 BUTTON，换算视口坐标后真实点击。
 * 坐标系说明：layout.bounds 为「视口坐标 × devicePixelRatio」，需除回 dpr（实测小红书页 dpr=2）。
 * 返回：命中的按钮文本；未命中返回 null。
 */
async function clickShadowButton(page, texts) {
  let client;
  try {
    client = await page.context().newCDPSession(page);
    const snap = await client.send('DOMSnapshot.captureSnapshot', { computedStyles: [] });
    const { strings, documents } = snap;
    const S = (i) => (i >= 0 && strings[i] ? strings[i] : '');
    const doc = documents[0];
    if (!doc) return null;
    const { nodes, layout } = doc;
    const ni2li = new Map();
    layout.nodeIndex.forEach((ni, li) => { if (!ni2li.has(ni)) ni2li.set(ni, li); });
    const parentOf = (ni) => (nodes.parentIndex && nodes.parentIndex[ni] >= 0 ? nodes.parentIndex[ni] : null);
    const dpr = await page.evaluate(() => window.devicePixelRatio || 1);

    for (let i = 0; i < nodes.nodeValue.length; i++) {
      const vi = nodes.nodeValue[i];
      if (vi < 0) continue;
      const t = S(vi).trim();
      if (!texts.includes(t)) continue;
      const p = parentOf(i);
      if (p === null) continue;
      const tag = S(nodes.nodeName[p]);
      if (!['BUTTON', 'DIV', 'SPAN', 'A'].includes(tag)) continue;
      const li = ni2li.get(p);
      if (li === undefined) continue;
      const b = layout.bounds[li];
      if (!b || b[2] <= 0 || b[3] <= 0) continue;
      const cx = (b[0] + b[2] / 2) / dpr;
      const cy = (b[1] + b[3] / 2) / dpr;
      await page.mouse.click(cx, cy);
      return t;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (client) await client.detach().catch(() => {});
  }
}

/**
 * 依次检查多个选择器，任一元素可见即返回 true。
 * 修复两个真实踩坑（头条登录态误判）：
 *  1) isVisible({timeout}) 在 Playwright 1.44 中并不会等待（立即返回），SPA 慢渲染时误判「未登录」
 *  2) 联合选择器 .first().isVisible() 只看 DOM 顺序第一个匹配元素，它可能恰好是隐藏元素
 * 实现：count() 立即返回（无匹配时 waitFor 真实等待至超时）；有匹配时逐个验证可见性。
 */
async function anyVisible(page, selectors, timeout = 5000) {
  for (const sel of selectors) {
    let loc;
    try { loc = page.locator(sel); } catch { continue; }
    const n = Math.min(await loc.count().catch(() => 0), 6);
    if (n === 0) {
      const ok = await loc.first().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
      if (ok) return true;
      continue;
    }
    for (let i = 0; i < n; i++) {
      const ok = await loc.nth(i).waitFor({ state: 'visible', timeout: 800 }).then(() => true).catch(() => false);
      if (ok) return true;
    }
  }
  return false;
}

module.exports = { BasePublisher, pasteRichText, clickButton, clickShadowButton, stripImages, replaceTokenWithImage, uploadImages, IMG_TOKEN, anyVisible };
