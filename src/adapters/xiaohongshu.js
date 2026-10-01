/**
 * 小红书适配器（创作服务平台）
 * 流程：发布页 → 上传图片（必须 ≥1 张，走 input[type=file]）→ 填标题（≤20 字）→ 正文纯文本（≤1000 字）→ 存草稿 / 发布
 * 特殊：正文不支持富文本；无图无法发布（规则校验已拦截）。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { BasePublisher, clickButton, clickShadowButton, anyVisible } = require('./base');

class XiaohongshuPublisher extends BasePublisher {
  get meta() {
    return { id: 'xiaohongshu', name: '小红书', homeUrl: 'https://creator.xiaohongshu.com/', inlineImages: false };
  }

  async doCheckLogin(page) {
    const url = page.url();
    if (/login/.test(url)) {
      return { ok: false, message: '未登录：请在专用浏览器窗口登录 creator.xiaohongshu.com' };
    }

    // 已登录：发布页出现上传入口或编辑区（anyVisible 真实等待 + 逐元素验证）
    const ok = await anyVisible(page, ['input[type="file"]', '[contenteditable="true"]', '#post-textarea', 'text=发布笔记'], 6000);
    if (ok) return { ok: true, message: '已登录' };

    // 兜底：登录表单特征
    const loginForm = await anyVisible(page, ['input[placeholder*="手机"]', 'text=短信登录', 'text=扫码登录'], 2000);
    if (loginForm) return { ok: false, message: '未登录：页面为登录界面' };

    return { ok: false, message: '无法确认登录态（页面结构未匹配）' };
  }

  /** 把 data URI / 远程图片落盘为临时文件，供 setInputFiles 使用 */
  async prepareImageFiles(article) {
    const files = [];
    const { extractImages, downloadAsDataUri } = require('../core/article');
    // 图片来源优先级：article.images（文件路径）> content 里的 Markdown 图片 > html 里的 base64 img
    // 注意（实测踩坑）：小红书 inlineImages=false，html 里保留的是**外链** <img src="https://...">，
    // 因此这里必须把外链也纳入并下载转存，否则会「没有可上传的图片」（必须含图）而失败。
    let srcs = (article.images && article.images.length) ? article.images : extractImages(article.content || '');
    if (!srcs.length && article.html) {
      // 先收 base64，再收外链
      const dataUris = (article.html.match(/src="data:image\/[^"]+"/g) || []).map((s) => s.replace(/^src="/, '').replace(/"$/, ''));
      const remote = (article.html.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/g) || [])
        .map((s) => (s.match(/src=["']([^"']+)["']/) || [])[1]);
      srcs = [...dataUris, ...remote];
    }
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-img-'));
    let i = 0;
    for (const src of srcs.slice(0, 18)) {
      try {
        let ext = 'png';
        let buf = null;
        if (src.startsWith('data:image/')) {
          const m = src.match(/^data:image\/(\w+);base64,(.+)$/s);
          if (!m) continue;
          ext = m[1] === 'jpeg' ? 'jpg' : m[1];
          buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
        } else if (/^https?:/.test(src)) {
          const dataUri = await downloadAsDataUri(src);
          if (!dataUri) continue;
          const m = dataUri.match(/^data:image\/(\w+);base64,(.+)$/s);
          if (!m) continue;
          ext = m[1] === 'jpeg' ? 'jpg' : m[1];
          buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
        } else if (fs.existsSync(src)) {
          ext = path.extname(src).replace('.', '') || 'png';
          buf = fs.readFileSync(src);
        }
        if (!buf || buf.length < 1024) continue; // <1KB 视为占位图/坏图
        const f = path.join(tmpDir, `img-${i++}.${ext}`);
        fs.writeFileSync(f, buf);
        files.push(f);
      } catch { /* skip bad image */ }
    }
    return files;
  }

  async doPublish(page, article, _ctx, log) {
    log('打开小红书发布页');
    await page.goto('https://creator.xiaohongshu.com/publish/publish?source=official', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);
    if (/login/.test(page.url())) throw new Error('小红书未登录');

    // 默认停在「上传视频」页签（file input 只收视频），必须先切到「上传图文」。
    // 页面上有多个同名元素（部分在屏幕外负坐标、部分可见但点了没反应），
    // 因此逐个尝试可见候选，每次点击后检查图片上传框是否出现。
    log('切换到「上传图文」页签');
    const tabN = await page.locator('text=上传图文').count();
    const hasImageInput = async () => (await page.locator('input[type="file"][accept*="jpg"], input[type="file"][accept*="jpeg"], input[type="file"][accept*="png"], input[type="file"][accept*="webp"], input[type="file"][accept*="image"]').count()) > 0;
    let tabClicked = false;
    for (let i = 0; i < tabN; i++) {
      const bb = await page.locator('text=上传图文').nth(i).boundingBox().catch(() => null);
      if (!bb || bb.x <= 0 || bb.y <= 0 || bb.y >= 150 || bb.width <= 30) continue;
      await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.waitForTimeout(1500);
      if (await hasImageInput()) { tabClicked = true; break; }
    }
    if (!tabClicked) throw new Error('未找到「上传图文」页签（点击后图片上传框未出现）');
    await page.waitForTimeout(1000);

    log('上传图片');
    const files = await this.prepareImageFiles(article);
    if (!files.length) throw new Error('没有可上传的图片（小红书发布必须含图）');
    // 图片 input 是 display:none 的隐藏元素（藏在样式化上传区后面），
    // 不能用要求可见的 trySelect——waitFor attached + setInputFiles 即可
    const fileInput = page.locator('input[type="file"][accept*="jpg"], input[type="file"][accept*="jpeg"], input[type="file"][accept*="png"], input[type="file"][accept*="webp"], input[type="file"][accept*="image"]').first();
    await fileInput.waitFor({ state: 'attached', timeout: 8000 })
      .catch(() => { throw new Error('未找到图片上传入口'); });
    await fileInput.setInputFiles(files);
    await page.waitForTimeout(5000); // 等图片处理与编辑区出现

    log('填写标题');
    const titleEl = await this.trySelect(page, [
      'input[placeholder*="标题"]', 'textarea[placeholder*="标题"]', '#title-textarea', '#post-title',
    ]);
    if (!titleEl) throw new Error('未找到标题输入框（上传图片后应出现编辑区）');
    await titleEl.fill(article.title);

    log('填写正文（纯文本）');
    const bodySel = (await page.locator('#post-textarea').count()) > 0 ? '#post-textarea'
      : (await page.locator('[contenteditable="true"]').count()) > 0 ? '[contenteditable="true"]' : null;
    if (!bodySel) throw new Error('未找到正文编辑区');
    // 小红书正文为纯文本：剥离 Markdown 图片语法，避免正文里出现 ![xx](url) 字样
    const cleanText = (article.text || '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    await page.locator(bodySel).first().click();
    await page.evaluate(({ sel, text }) => {
      const el = document.querySelector(sel);
      el.focus();
      document.execCommand('insertText', false, text);
    }, { sel: bodySel, text: cleanText });
    await page.waitForTimeout(1500);

    const picNote = `（已上传图片 ${files.length} 张）`;

    if (article.mode === 'publish') {
      log('点击发布');
      // 「发布」按钮在小红书是 <xhs-publish-btn> 内的 closed shadow BUTTON，
      // 常规文本选择器无法命中，先试常规再走 CDP shadow 快照定位兜底
      const ok = (await clickButton(page, ['发布'], 3000)) || (await clickShadowButton(page, ['发布'])) !== null;
      if (!ok) throw new Error('未找到「发布」按钮');
      await page.waitForTimeout(4000);
      return { ok: true, url: 'https://creator.xiaohongshu.com/publish/success', message: `已点击发布${picNote}，请到笔记管理确认` };
    }

    // 关掉可能的引导弹窗（如「图片可以编辑啦」），否则可能挡住底部按钮
    for (const t of ['我知道了', '知道了', '下次再说']) {
      const b = page.locator(`button:has-text("${t}"), div:text-is("${t}"), span:text-is("${t}")`).first();
      if (await b.isVisible({ timeout: 800 }).catch(() => false)) {
        await b.click().catch(() => {});
        await page.waitForTimeout(600);
      }
    }

    // 小红书的草稿按钮叫「暂存离开」（不是「存草稿」），在页面底部。
    // 它是 <xhs-publish-btn> 自定义元素内的 closed shadow BUTTON：
    //  - text=/has-text 选择器、querySelectorAll、innerText 全部无法命中（实测）
    //  - 兜底走 CDP DOMSnapshot：快照含 shadow 树文本与布局，定位后按视口坐标真实点击
    log('点击暂存离开（小红书草稿按钮）');
    let saved = await clickButton(page, ['暂存离开', '存草稿', '保存草稿'], 3000);
    if (!saved) {
      const hit = await clickShadowButton(page, ['暂存离开', '存草稿', '保存草稿']);
      saved = hit !== null;
    }
    if (!saved) {
      return { ok: false, message: `内容已填写${picNote}，但未找到「暂存离开」按钮（含 shadow DOM 兜底仍失败），请到浏览器手动处理` };
    }
    await page.waitForTimeout(2000);
    return { ok: true, url: 'https://creator.xiaohongshu.com/publish/note', message: `已保存到小红书草稿${picNote}` };
  }
}

module.exports = XiaohongshuPublisher;
