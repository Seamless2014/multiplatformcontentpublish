/**
 * 百度贴吧适配器（Web 端）
 * 流程（2026-10-01 改版）：打开贴吧首页 → 点「+发贴」弹出发贴弹窗 → 搜索并选中目标吧
 *      → Quill 编辑器（.ql-editor）填标题/正文 → 图片走工具条「图片」→ filechooser 上传
 *      → 点「发布」。
 * 为什么不走吧页面（f?kw=吧名）点「发贴」：真实踩坑（2026-10-01）——吧页面加载时自身
 * JS 抛 `_typeof is not defined`，发贴组件事件绑定失败，点「发贴」无任何反应（真实鼠标
 * 点击也不行）；首页的发贴弹窗组件一切正常，且自带「选择吧」搜索框，可先发帖后选吧。
 * 特殊：
 *  - 贴吧无草稿功能：draft 模式只填表不点发布，由用户在浏览器确认后手动点「发布」。
 *  - 标题 5~31 字必填；正文建议 200~2000 字。
 *  - 贴吧是「发贴」（贝字旁），选择器与文案都用「贴」。
 *  - 目标吧名取 article.forum（必填）。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BasePublisher, clickButton, anyVisible } = require('./base');

class TiebaPublisher extends BasePublisher {
  get meta() {
    return { id: 'tieba', name: '百度贴吧', homeUrl: 'https://tieba.baidu.com/', inlineImages: true };
  }

  async doCheckLogin(page) {
    const url = page.url();
    await page.goto('https://tieba.baidu.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // 已登录：首页有带用户 id 的「主页」链接
    const loggedIn = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a[href*="home/main?id="]')][0];
      return a ? a.href : null;
    });
    if (loggedIn) return { ok: true, message: '已登录' };

    // 登录页特征
    const loginForm = await anyVisible(page, ['text=登录', 'text=扫码登录', 'input[placeholder*="手机"]'], 3000);
    if (loginForm) return { ok: false, message: '未登录：请在专用浏览器窗口登录 tieba.baidu.com' };

    return { ok: false, message: '无法确认登录态（未找到用户主页链接）' };
  }

  /**
   * 把图片落盘为临时文件（贴吧 input 仅收 png/jpeg）。
   *
   * 修正（实测踩坑）：早期版本用「article.images 非空 ? images : 提取 content」的短路三元，
   * 一旦 article.images 是非空但无效的数组（如 ['']）就永远不回落去解析 content/html，
   * 结果为「html 里明明有 1 张 base64 图，却提取到 0 张」。现改为合并所有来源，去重后逐个落盘。
   */
  prepareImageFiles(article, maxCount = 9) {
    const files = [];
    const { extractImages } = require('../core/article');
    const srcs = [];
    const push = (s) => { if (s && typeof s === 'string' && !srcs.includes(s)) srcs.push(s); };

    for (const s of (article.images || [])) push(s);                       // 显式文件路径 / data URI
    for (const s of extractImages(article.content || '')) push(s);         // markdown 图片语法
    if (article.html) {                                                    // html 里已内联的 base64
      const re = /src="(data:image\/[^"]+)"/g;
      let m;
      while ((m = re.exec(article.html)) !== null) push(m[1]);
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tieba-img-'));
    let i = 0;
    for (const src of srcs) {
      if (files.length >= maxCount) break; // 贴吧单贴最多 9 张图
      try {
        let buf = null;
        const m = src.match(/^data:image\/[\w+.-]+;base64,(.+)$/s);
        if (m) {
          buf = Buffer.from(m[1].replace(/\s/g, ''), 'base64');
        } else if (fs.existsSync(src)) {
          buf = fs.readFileSync(src);
        } else if (/^https?:/i.test(src)) {
          // 贴吧上传是同步方法，这里只支持 data URI / 本地文件；外链图需先转存（由上层 mdToHtml 负责）
          continue;
        }
        // 实测：几百字节的极小图会被贴吧上传通道静默丢弃，阈值与 article.js 的 MIN_IMG_BYTES 对齐
        if (!buf || buf.length < 1024) continue;
        i += 1;
        const f = path.join(tmpDir, 'img-' + i + '.png');
        fs.writeFileSync(f, buf);
        files.push(f);
      } catch { /* skip bad image */ }
    }
    return files;
  }

  async doPublish(page, article, _ctx, log) {
    const forum = (article.forum || '').trim();
    if (!forum) throw new Error('未指定目标吧名（article.forum），请在任务中填写要发贴的吧名');

    // ── 1. 首页点「发贴」弹出发贴弹窗 ──
    // 不走吧页面：吧页面 JS 自崩（_typeof is not defined），「发贴」点了没反应（见文件头）。
    log('打开贴吧首页');
    await page.goto('https://tieba.baidu.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    if (/login|passport/.test(page.url())) throw new Error('贴吧未登录');

    log('点「发贴」弹出发贴弹窗');
    const addBtn = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.add-post, [class*="add-post"], [class*="add-btn"]')]
        .find((e) => (e.textContent || '').includes('发贴'));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!addBtn) throw new Error('未找到「+发贴」按钮');
    await page.mouse.click(addBtn.x, addBtn.y);
    // 等弹窗编辑器出现（Quill 标题框）。
    // 必须加 .first()：弹窗里「贴子标题」「视频标题」两个 placeholder 都含「标题」，
    // strict mode 下多元素匹配会让 waitFor 直接抛 strict violation（而非等待超时）。
    const editorReady = await page.locator('.ql-editor[data-placeholder*="标题"]').first()
      .waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    if (!editorReady) throw new Error('发贴弹窗未弹出（未等到标题编辑器）');

    // ── 2. 「选择吧」搜索框：输入吧名 → 点联想项 ──
    log(`搜索并选择吧「${forum}」`);
    const searchBox = page.locator('.search-warp input.search-box').first();
    if (!(await searchBox.count())) throw new Error('未找到「选择吧」搜索框');
    await searchBox.click();
    await searchBox.fill(forum);
    await page.waitForTimeout(2500); // 等联想
    // 联想列表 .forum-list 项；无结果时显示 .no-data「没有搜索到相关吧」
    const opt = page.locator('.search-warp .forum-list').first();
    const optCnt = await opt.count();
    if (!optCnt) {
      const noData = await page.evaluate(() => {
        const n = document.querySelector('.search-warp .no-data');
        return n ? (n.textContent || '').trim() : '';
      });
      throw new Error(`吧「${forum}」联想无结果${noData ? `（${noData}）` : ''}，请确认吧名`);
    }
    await opt.click();
    await page.waitForTimeout(1200);

    // ── 3. 填标题 / 正文 ──
    // 编辑器（Quill）：按 data-placeholder 定位（弹窗里有 3 个 ql-editor：标题/正文/视频标题）
    const titleEd = page.locator('.ql-editor[data-placeholder*="标题"]').first();
    const bodyEd = page.locator('.ql-editor[data-placeholder*="正文"]').first();
    log('填写标题');
    await titleEd.click();
    await titleEd.fill('');
    await titleEd.fill(article.title);

    log('填写正文');
    // 实测：Quill 对 execCommand insertHTML 不生效（注入 0 字），fill() 原子写入可靠（与标题同理）。
    // 贴吧正文按纯文本提交（富文本格式丢失可接受；图片走上传通道保留）。
    const bodyText = (article.text || '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    await bodyEd.click();
    await bodyEd.fill('');
    await bodyEd.fill(bodyText);
    await page.waitForTimeout(1000);
    const bodyLen = await bodyEd.evaluate((el) => (el.innerText || '').trim().length);
    log(`正文注入完成（${bodyLen} 字）`);
    if (!bodyLen) throw new Error('正文注入失败（Quill 编辑器未接受内容）');

    // ── 4. 图片：点工具条「图片」→ 拦截 filechooser 上传 ──
    // 实测踩坑：绝不能用 .input-uploadimg —— 那是「发视频」表单里的视频封面上传通道，
    // 误用会弹出「上传视频封面」弹窗、图片进不了正文。
    // 新弹窗工具条：表情 / 用户 / 话题 / 图片；上传后图片以内联 img 插入 Quill 编辑器。
    const imgFiles = this.prepareImageFiles(article);
    let uploaded = 0;
    if (imgFiles.length) {
      log(`上传图片 ${imgFiles.length} 张`);
      const chooserPromise = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
      const clicked = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('.action-btn, button, [class*="btn"], div, span')]
          .find((el) => (el.textContent || '').trim() === '图片' && el.children.length <= 2);
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (!clicked) throw new Error('未找到编辑器工具条「图片」按钮');
      const chooser = await chooserPromise;
      if (!chooser) throw new Error('点击「图片」未触发文件选择框（filechooser）');
      await chooser.setFiles(imgFiles);
      // 等待上传完成：按 .ql-editor 内 img 总数宽松验证（新弹窗下内联图类名可能与老版不同）
      const done = await page.waitForFunction(
        (n) => document.querySelectorAll('.ql-editor img').length >= n,
        imgFiles.length,
        { timeout: 30000 },
      ).then(() => true).catch(() => false);
      uploaded = await page.evaluate(() => document.querySelectorAll('.ql-editor img').length);
      if (!done) log(`提示：等待图片上传超时（编辑器内已见 ${uploaded} 张），继续后续流程`);
      else log(`图片已上传（编辑器内联 ${uploaded} 张）`);
    }

    const picNote = imgFiles.length ? `（已上传图片 ${imgFiles.length} 张）` : '（无图片）';

    if (article.mode === 'publish') {
      log('点击发布');
      const ok = await clickButton(page, ['发布'], 6000);
      if (!ok) {
        // 兜底：发贴弹窗内文本为「发布」的可点击元素
        const issued = await page.evaluate(() => {
          const el = [...document.querySelectorAll('.publisher-warp button, .publisher-warp [class*="btn"], .publisher-warp div, .publisher-warp span')]
            .find((e) => (e.textContent || '').trim() === '发布' && e.getBoundingClientRect().width > 0);
          if (!el) return false;
          el.click();
          return true;
        });
        if (!issued) throw new Error('未找到「发布」按钮');
      }
      await page.waitForTimeout(5000);
      return { ok: true, url: 'https://tieba.baidu.com/f?kw=' + encodeURIComponent(forum), message: `已在贴吧「${forum}」点击发布${picNote}，请到吧内确认（可能有审核延迟）` };
    }

    // 草稿模式：贴吧无草稿功能，填表后停在编辑器，由用户手动点发布
    return { ok: true, url: page.url(), message: `贴吧「${forum}」内容已填写完毕${picNote}，贴吧无草稿功能 —— 请到浏览器确认后手动点击「发布」` };
  }
}

module.exports = TiebaPublisher;
