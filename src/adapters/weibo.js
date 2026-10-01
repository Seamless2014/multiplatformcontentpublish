/**
 * 新浪微博适配器（weibo.com Web 端）
 * 流程：首页发博框 → textarea 填正文（无独立标题，格式化为「【标题】正文」）
 *      → 图片走常驻 input._file_hqmwy_20（multiple，最多 9 张）→ 点「发送」。
 * 特殊：
 *  - 微博正文无标题字段：标题并入正文首行（【标题】+ 换行 + 正文）。
 *  - 正文上限 2000 字；超 140 字前端会折叠（不影响发布）。
 *  - 微博无草稿功能：draft 模式只填表不点发送，由用户确认后手动点「发送」。
 *  - 图片 accept 极宽（image/* + 视频），base64 图落盘临时 png 上传。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BasePublisher, clickButton, anyVisible } = require('./base');

const COMPOSER_TA = 'textarea[placeholder*="新鲜事"]';
const FILE_INPUT = 'input[type="file"][accept*="image"]';
const SEND_TEXTS = ['发送', '发布'];

class WeiboPublisher extends BasePublisher {
  get meta() {
    return { id: 'weibo', name: '新浪微博', homeUrl: 'https://weibo.com/', inlineImages: true };
  }

  async doCheckLogin(page) {
    const url = page.url();
    await page.goto('https://weibo.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const cur = page.url();
    if (/newlogin|login\.php|passport/.test(cur)) {
      return { ok: false, message: '未登录：请在专用浏览器窗口登录 weibo.com（扫码或账号）' };
    }
    // 已登录特征：发博框 textarea
    const composer = await anyVisible(page, [COMPOSER_TA], 6000);
    if (composer) return { ok: true, message: '已登录' };
    const loginForm = await anyVisible(page, ['text=登录', 'text=扫码登录', 'text=二维码登录'], 3000);
    if (loginForm) return { ok: false, message: '未登录：页面为登录界面' };
    return { ok: false, message: '无法确认登录态（未找到发博框，可能改版或加载慢）' };
  }

  /**
   * 图片落盘（微博单条最多 9 张）。
   * 与 tieba 同样的修正：合并所有来源（article.images / markdown / html base64），
   * 不再用「非空就短路」的三元，避免 article.images 为非空无效值时丢失图片。
   */
  prepareImageFiles(article, maxCount = 9) {
    const files = [];
    const { extractImages } = require('../core/article');
    const srcs = [];
    const push = (s) => { if (s && typeof s === 'string' && !srcs.includes(s)) srcs.push(s); };

    for (const s of (article.images || [])) push(s);
    for (const s of extractImages(article.content || '')) push(s);
    if (article.html) {
      const re = /src="(data:image\/[^"]+)"/g;
      let m;
      while ((m = re.exec(article.html)) !== null) push(m[1]);
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weibo-img-'));
    let i = 0;
    for (const src of srcs) {
      if (files.length >= maxCount) break; // 微博单条最多 9 图
      try {
        let buf = null;
        const m = src.match(/^data:image\/[\w+.-]+;base64,(.+)$/s);
        if (m) {
          buf = Buffer.from(m[1].replace(/\s/g, ''), 'base64');
        } else if (fs.existsSync(src)) {
          buf = fs.readFileSync(src);
        } else {
          continue; // 外链图不支持（由上层 mdToHtml 转存）
        }
        // 极小图上传不可靠，阈值与 article.js 的 MIN_IMG_BYTES 对齐
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
    log('打开微博首页（发博框）');
    await page.goto('https://weibo.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    if (/newlogin|login\.php|passport/.test(page.url())) throw new Error('微博未登录');

    // 正文：标题并入首行（微博无标题字段）
    const cleanText = (article.text || article.title || '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/<img[^>]*>/gi, '')
      .trim();
    const fullText = article.title
      ? '【' + article.title + '】\n' + cleanText
      : cleanText;
    if (!fullText.trim()) throw new Error('微博正文为空（微博必须至少有文字）');
    if (fullText.replace(/\s+/g, '').length > 2000) throw new Error('微博正文超 2000 字上限，请精简');

    log('填写微博正文');
    const ta = page.locator(COMPOSER_TA).first();
    const taCount = await ta.count();
    if (!taCount) throw new Error('未找到发博框（textarea，可能改版）');
    await ta.click();
    await ta.fill('');
    await ta.fill(fullText);
    await page.waitForTimeout(1000);

    // 图片：常驻 multiple input
    const imgFiles = this.prepareImageFiles(article);
    let uploaded = 0;
    if (imgFiles.length) {
      log(`上传图片 ${imgFiles.length} 张`);
      const input = page.locator(FILE_INPUT).first();
      await input.waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
      await input.setInputFiles(imgFiles);
      // 等缩略图出现（上传完成）
      const done = await page.waitForFunction(
        (n) => document.querySelectorAll('img[src*="sinaimg.cn"]').length >= n,
        imgFiles.length,
        { timeout: 30000 },
      ).then(() => true).catch(() => false);
      uploaded = await page.evaluate(() => document.querySelectorAll('img[src*="sinaimg.cn"]').length);
      if (!done) log(`提示：等待图片上传超时（当前可见 CDN 图 ${uploaded} 张），继续后续流程`);
      else log(`图片已上传（${uploaded} 张 sinaimg CDN 缩略图）`);
    }

    const picNote = imgFiles.length ? `（已上传图片 ${imgFiles.length} 张）` : '（纯文字）';

    if (article.mode === 'publish') {
      log('点击发送');
      const ok = await clickButton(page, SEND_TEXTS, 6000);
      if (!ok) throw new Error('未找到「发送」按钮');
      await page.waitForTimeout(5000);
      return { ok: true, url: 'https://weibo.com/', message: `微博已点击发送${picNote}，请到个人主页确认` };
    }

    // 草稿模式：微博无草稿，填表后停在发博框
    return { ok: true, url: page.url(), message: `微博内容已填写完毕${picNote}，微博无草稿功能 —— 请到浏览器确认后手动点击「发送」` };
  }
}

module.exports = WeiboPublisher;
