/**
 * 百家号适配器（2026-10-01 实测改版后结构）
 * 实测结论：
 *  - 图文编辑器有直达 URL：/builder/rc/edit?type=news（旧的「发布→图文」菜单点击已失效）
 *  - 标题：.client_components_titleInput .input-box 内的 contenteditable（FeEditorApp 自研组件，非 input）
 *    ⚠️ 必须用 fill() 原子写入——keyboard.type 逐键输入会触发组件 keydown+beforeinput 双通道
 *    导致标题文字重复一遍（真实踩坑）
 *  - 正文：懒激活 iframe——点击「请输入正文」占位符区域后 iframe body 才变 contenteditable
 *  - 文字：iframe 内 dispatch beforeinput(insertHTML) 即可，编辑器自行消费（execCommand 返回 false
 *    但内容进入）
 *  - 图片：base64 图会被标记「图片链接异常」，必须走上传通道：点工具栏 .edui-for-insertimage →
 *    弹出 cheetah-modal → 里面有隐藏 input[type=file][accept=image/*] → setInputFiles → 确认 →
 *    图片以 baijiahao.baidu.com/bjh/picproxy CDN 地址插入
 *  - 底部有独立「存草稿」按钮
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { BasePublisher, clickButton, anyVisible } = require('./base');

const EDITOR_URL = 'https://baijiahao.baidu.com/builder/rc/edit?type=news';

class BaijiahaoPublisher extends BasePublisher {
  get meta() {
    return { id: 'baijiahao', name: '百家号', homeUrl: 'https://baijiahao.baidu.com/builder/rc/home', inlineImages: true };
  }

  async doCheckLogin(page) {
    const url = page.url();
    if (/passport|login/.test(url)) {
      return { ok: false, message: '未登录：请在专用浏览器窗口登录百家号后台' };
    }
    const ok = await anyVisible(page, ['.publish-btn', '[class*="publish"]', 'text=发布', 'text=图文创作', 'text=内容管理', 'text=发布作品'], 6000);
    if (ok) return { ok: true, message: '已登录' };

    // 登录页兜底特征（URL 未变但页面是登录框的情况）
    const loginForm = await anyVisible(page, ['input[placeholder*="手机"]', 'input[placeholder*="验证码"]', 'text=扫码登录'], 2000);
    if (loginForm) return { ok: false, message: '未登录：页面为登录界面，请在专用浏览器窗口登录' };

    return { ok: false, message: '无法确认登录态（页面结构未匹配，可能改版或加载未完成）' };
  }

  /** 找到正文所在的 contenteditable iframe（懒激活后 body.isContentEditable 为 true） */
  async findEditableFrame(page) {
    for (const f of page.frames()) {
      const ed = await f.evaluate(() => document.body && document.body.isContentEditable).catch(() => false);
      if (ed) return f;
    }
    return null;
  }

  /** 关闭可能挡住点击的引导弹窗 */
  async dismissPopups(page) {
    for (const t of ['我知道了', '知道了', '我知道', '下次再说']) {
      const b = page.locator(`button:has-text("${t}"), div:text-is("${t}"), span:text-is("${t}")`).first();
      if (await b.isVisible({ timeout: 800 }).catch(() => false)) {
        await b.click().catch(() => {});
        await page.waitForTimeout(800);
      }
    }
  }

  /** 在正文 iframe 末尾追加一段 HTML（beforeinput + insertHTML，编辑器自行消费） */
  async appendHtml(frame, html) {
    await frame.evaluate((h) => {
      const el = document.body;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const s = window.getSelection();
      s.removeAllRanges(); s.addRange(range);
      el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertHTML', data: h }));
      try { document.execCommand('insertHTML', false, h); } catch (e) { /* 编辑器自行处理 beforeinput */ }
    }, html).catch((e) => { throw new Error('iframe 注入失败：' + e.message.split('\n')[0]); });
  }

  /**
   * 注入后用真实鼠标点击正文末尾恢复编辑器光标。
   * 关键：frame.evaluate 里的 DOM 操作不会更新编辑器内部选区状态，
   * 不恢复光标的话工具栏 insertimage 点击无效（真实踩坑）。
   * 坐标必须换算：页面坐标 = iframe 页面偏移 + iframe 内元素坐标（否则会点到工具栏）。
   */
  async restoreCursor(page, frame) {
    const pos = await page.evaluate(() => {
      const ifr = [...document.querySelectorAll('iframe')].find((f) => {
        try { return f.contentDocument && f.contentDocument.body.isContentEditable; } catch (e) { return false; }
      });
      if (!ifr) return null;
      const ir = ifr.getBoundingClientRect();
      const doc = ifr.contentDocument;
      const els = doc.body.querySelectorAll('p, h1, h2, h3, div');
      const last = els[els.length - 1] || doc.body;
      const lr = last.getBoundingClientRect();
      return { pageX: ir.left + Math.min(lr.left + Math.max(lr.width - 10, 20), 400), pageY: ir.top + lr.top + lr.height / 2 };
    }).catch(() => null);
    if (pos) {
      await page.mouse.click(pos.pageX, pos.pageY);
      await page.waitForTimeout(600);
    }
  }

  /** dataUri → 临时文件，返回文件路径（上传通道需要真实文件） */
  writeTempImage(dataUri, idx) {
    const m = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!m) throw new Error(`第 ${idx + 1} 张图不是合法 base64`);
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const file = path.join(os.tmpdir(), `bjh-upload-${Date.now()}-${idx}.${ext}`);
    fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
    return file;
  }

  /** 走编辑器上传通道插入一张图：工具栏 insertimage → cheetah-modal → 隐藏 file input → 确认
   *  实测：点 insertimage 不弹系统文件选择器（filechooser 事件不触发），而是弹出含
   *  隐藏 input[type=file][accept=image/*] 的 cheetah-modal，setInputFiles 后点「确认」。 */
  async uploadOneImage(page, file, idx, log) {
    await page.locator('.edui-for-insertimage').first().click();
    await page.locator('.cheetah-modal').first().waitFor({ state: 'visible', timeout: 8000 })
      .catch(() => { throw new Error('图片上传弹窗未出现'); });
    const modalInput = page.locator('.cheetah-modal input[type="file"][accept*="image"]').first();
    await modalInput.waitFor({ state: 'attached', timeout: 8000 })
      .catch(() => { throw new Error('上传弹窗内未找到文件输入框'); });
    await modalInput.setInputFiles([file]);
    // 等缩略图出现后点确认
    await page.waitForTimeout(4000);
    const okBtn = page.locator('.cheetah-modal button:has-text("确认"), .cheetah-modal button:has-text("确 定")').first();
    if (await okBtn.isVisible().catch(() => false)) {
      await okBtn.click();
    } else {
      log(`第 ${idx + 1} 张图：未找到确认按钮（可能已自动插入）`);
    }
    await page.waitForTimeout(3500); // 等图片上传并插入
  }

  async doPublish(page, article, _ctx, log) {
    log('打开百家号图文编辑器（直达 URL）');
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // 编辑器是慢渲染 SPA，必须真实等待；同时它会恢复上次未发布的草稿，需要清空
    await page.locator('.client_components_titleInput .input-box [contenteditable="true"]')
      .first().waitFor({ state: 'visible', timeout: 20000 })
      .catch(() => { throw new Error('百家号编辑器加载超时（标题框未出现）'); });
    await page.waitForTimeout(2000);
    if (/passport|login/.test(page.url())) throw new Error('百家号未登录');
    await this.dismissPopups(page);

    log('填写标题（fill 原子覆盖，防逐键重复 + 覆盖恢复的旧草稿）');
    const titleEl = page.locator('.client_components_titleInput .input-box [contenteditable="true"]').first();
    await titleEl.fill('');
    await titleEl.fill(article.title);
    await page.waitForTimeout(800);

    log('激活正文编辑区（点 .edui-editor 容器，不依赖占位符）');
    const edBox = await page.locator('.edui-editor').first().boundingBox()
      .catch(() => null);
    if (!edBox) throw new Error('未找到正文编辑器容器（.edui-editor）');
    await page.mouse.click(edBox.x + edBox.width / 2, edBox.y + 60);
    await page.waitForTimeout(2500);

    let frame = await this.findEditableFrame(page);
    if (!frame) {
      // 重试一次
      await page.mouse.click(edBox.x + edBox.width / 2, edBox.y + 120);
      await page.waitForTimeout(2000);
      frame = await this.findEditableFrame(page);
    }
    if (!frame) throw new Error('正文 iframe 未激活（点击后仍无 contenteditable body）');
    log('正文 iframe 已激活');

    // 编辑器会恢复上次草稿：全选删除清空正文
    const clearedLen = await frame.evaluate(() => {
      const el = document.body; el.focus();
      const s = window.getSelection(); s.removeAllRanges();
      const range = document.createRange(); range.selectNodeContents(el);
      s.addRange(range);
      document.execCommand('delete');
      return document.body.innerText.trim().length;
    }).catch(() => -1);
    log(`正文已清空（残留 ${clearedLen} 字）`);

    // 分段注入：text0 → [img0] → text1 → [img1] …（保证图文顺序）
    const { stripImages } = require('./base');
    const { html, imgs } = stripImages(article.html);
    const segs = html.split('<!--IMG_PLACEHOLDER-->'); // stripImages 不用注释占位，见下方自行切分
    // 自行按 <img ...> 切分原始 html（stripImages 已剥离 img，这里直接用主流程产物）
    void segs;
    const rawParts = article.html.split(/<img[^>]*>/i);
    const dataUris = imgs.length ? imgs : (article.html.match(/src="(data:image\/[^"]+)"/g) || []).map((s) => s.replace(/^src="/, '').replace(/"$/, ''));

    const tempFiles = [];
    try {
      let injectedImgs = 0;
      for (let i = 0; i < rawParts.length; i++) {
        const seg = rawParts[i].trim();
        if (seg) {
          await this.appendHtml(frame, seg);
          await page.waitForTimeout(600);
          // 恢复真实光标（否则下一步工具栏上传无效）
          await this.restoreCursor(page, frame);
        }
        if (i < rawParts.length - 1 && dataUris[injectedImgs]) {
          const file = this.writeTempImage(dataUris[injectedImgs], injectedImgs);
          tempFiles.push(file);
          log(`上传第 ${injectedImgs + 1}/${dataUris.length} 张图（编辑器上传通道）`);
          await this.uploadOneImage(page, file, injectedImgs, log);
          injectedImgs++;
        }
      }
      await page.waitForTimeout(2000);
    } finally {
      tempFiles.forEach((f) => { try { fs.unlinkSync(f); } catch {} });
    }

    const stat = await frame.evaluate(() => ({
      len: document.body.innerText.trim().length,
      imgs: document.body.querySelectorAll('img').length,
    })).catch(() => ({ len: 0, imgs: 0 }));
    const expected = dataUris.length;
    const imgNote = expected ? `（正文含图 ${stat.imgs}/${expected} 张）` : '';
    log(`正文结果：文字 ${stat.len} 字，图片 ${stat.imgs}/${expected} 张`);
    if (stat.len < 3 && (article.text || '').length > 3) {
      throw new Error('正文注入失败（iframe 内容为空）');
    }

    if (article.mode === 'publish') {
      log('点击发布');
      const ok = await clickButton(page, ['发布'], 6000);
      if (!ok) throw new Error('未找到「发布」按钮');
      await page.waitForTimeout(3000);
      return { ok: true, url: 'https://baijiahao.baidu.com/builder/rc/content', message: `已点击发布${imgNote}，请到内容管理确认审核状态` };
    }

    log('点击存草稿');
    const saved = await clickButton(page, ['存草稿', '保存草稿'], 6000);
    if (!saved) throw new Error('未找到「存草稿」按钮');
    await page.waitForTimeout(2500);
    return { ok: true, url: 'https://baijiahao.baidu.com/builder/rc/content', message: `已保存到百家号草稿箱${imgNote}` };
  }
}

module.exports = BaijiahaoPublisher;
