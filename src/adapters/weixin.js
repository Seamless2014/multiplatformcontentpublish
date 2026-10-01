/**
 * 微信公众号适配器（Web 端，非 API 路线）
 * 流程：后台首页取 token → 打开新图文编辑器(type=77) → 填标题 → 粘贴富文本（base64 图片自动转存素材库）
 * 草稿模式点「保存为草稿」；发布模式点「群发」（不可撤回，慎用）。
 */
const { BasePublisher, clickButton, anyVisible } = require('./base');

class WeixinPublisher extends BasePublisher {
  get meta() {
    return { id: 'weixin', name: '微信公众号', homeUrl: 'https://mp.weixin.qq.com/', inlineImages: true };
  }

  async doCheckLogin(page) {
    const url = page.url();

    // 微信特殊性：未登录与已登录时 URL 都可能停留在 mp.weixin.qq.com/，
    // 不能只靠 URL 判断。用「已登录才有的后台元素」作为主判据。
    const loggedInSel = [
      '.weui-desktop-menu',              // 左侧后台菜单
      '.weui-desktop-account__type',     // 账号类型角标
      '.new-creation__menu-item',        // 新的创作入口
      'text=新的创作',
      'text=首页',
      'text=内容管理',
    ];
    if (await anyVisible(page, loggedInSel, 2000)) return { ok: true, message: '已登录' };

    // 未登录判据：扫码登录页的二维码容器（scanloginqrcode 是微信登录专用接口）
    const loginQr = await anyVisible(page, [
      'img[src*="scanloginqrcode"]',
      '.login__type__container',
      '.login_frame',
      '.login_input_panel',
    ], 3000);
    if (loginQr || /loginpage|\/cgi-bin\/login/.test(url)) {
      return { ok: false, message: '未登录：请在专用浏览器窗口扫码登录 mp.weixin.qq.com' };
    }

    // 既无后台元素也无登录页特征 —— 可能页面未加载完，保守判定为未登录
    return { ok: false, message: '未检测到后台元素（可能未登录或页面未加载完成），请刷新后重试' };
  }

  /**
   * 把 article.html 里的 base64 图逐张上传公众号素材库，替换为 mmbiz.qpic.cn CDN 地址。
   * 上传走编辑器同源接口 /cgi-bin/filetransfer?action=upload_material（scene=8），
   * 在页面上下文执行 fetch，自动携带登录 cookie 与 wx.commonData 票据。
   * 实测返回：{"base_resp":{"ret":0},"cdn_url":"https://mmbiz.qpic.cn/sz_mmbiz_png/..."}
   * 返回新 article（含改写后的 html）与上传统计 { ok, failed }。
   */
  async inlineBase64ToMaterial(page, article, log) {
    const srcs = [...new Set((article.html || '').match(/src="data:image\/[^"]+"/g) || [])];
    if (!srcs.length) return { ...article, _wxUpload: { ok: 0, failed: 0 } };

    let html = article.html;
    let ok = 0;
    let failed = 0;
    let idx = 0;
    for (const m of srcs) {
      idx += 1;
      const b64 = m.replace(/^src="data:image\/\w+;base64,/, '').replace(/"$/, '');
      try {
        const cdn = await page.evaluate(async ({ dataB64, tries }) => {
          const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
          let lastErr = '';
          for (let t = 0; t < tries; t++) {
            try {
              const cd = window.wx && window.wx.commonData && window.wx.commonData.data;
              if (!cd || !cd.ticket) throw new Error('缺少 wx.commonData 票据（未登录或页面异常）');
              const token = cd.token || (location.href.match(/token=(\d+)/) || [])[1];
              const bytes = Uint8Array.from(atob(dataB64), (c) => c.charCodeAt(0));
              const fd = new FormData();
              fd.append('file', new Blob([bytes], { type: 'image/png' }), 'img-' + Date.now() + '.png');
              const url = '/cgi-bin/filetransfer?action=upload_material&f=json&scene=8&writetype=doublewrite&groupid=1&ticket_id=' + cd.uin + '_news&ticket=' + cd.ticket + '&svr_time=' + Math.floor(Date.now() / 1000) + '&token=' + token + '&lang=zh_CN';
              const r = await fetch(url, { method: 'POST', body: fd, credentials: 'include' });
              const j = await r.json();
              if (j && j.base_resp && j.base_resp.ret === 0 && j.cdn_url) return j.cdn_url;
              lastErr = 'ret=' + (j && j.base_resp ? j.base_resp.ret : '?') + ' ' + (j && j.base_resp ? j.base_resp.err_msg : '');
              // 200039 = 频率限制，等待后重试；其他错误直接抛出
              if (j && j.base_resp && j.base_resp.ret !== 200039) break;
            } catch (e) {
              lastErr = e.message;
              if (!/200039|频率|rate/i.test(e.message)) break;
            }
            await sleep(4000);
          }
          throw new Error(lastErr || '上传失败');
        }, { dataB64: b64, tries: 4 });
        if (!cdn || !/^https?:\/\//.test(cdn)) throw new Error('返回地址异常: ' + String(cdn).slice(0, 60));
        html = html.split(m).join('src="' + cdn + '"');
        ok += 1;
        log(`图片 ${idx}/${srcs.length} 已转存素材库`);
      } catch (e) {
        failed += 1;
        log(`图片 ${idx}/${srcs.length} 转存失败：${e.message}`);
      }
    }
    return { ...article, html, _wxUpload: { ok, failed } };
  }

  /**
   * 微信专用正文注入。
   * 微信 ProseMirror schema 对 img 有结构性要求：必须包在编辑器原生的
   * <section nodeleaf=""><img class="rich_pages wxw-img" ...></section> 里，
   * 裸 img（无论 data: 还是 mmbiz CDN src）都会被静默丢弃（实测）。
   * 因此把 html 按 img 切段：文字段用常规 insertHTML，图片段用编辑器原生结构注入。
   * 要求：传入的 article.html 里图片 src 必须已是 mmbiz CDN 地址（先走 inlineBase64ToMaterial）。
   */
  async fillWxBody(page, article, log) {
    const html = article.html || '';
    // 按 img 标签切段
    const parts = [];
    const imgRe = /<img[^>]*src="([^"]*)"[^>]*>/gi;
    let last = 0;
    let m;
    while ((m = imgRe.exec(html)) !== null) {
      if (m.index > last) parts.push({ type: 'html', html: html.slice(last, m.index) });
      parts.push({ type: 'img', src: m[1], tag: m[0] });
      last = m.index + m[0].length;
    }
    if (last < html.length) parts.push({ type: 'html', html: html.slice(last) });

    const n = await page.locator('.ProseMirror').count();
    const sel = '.ProseMirror';
    const bodyLoc = page.locator(sel).nth(n - 1);
    await bodyLoc.click();
    await page.keyboard.press('Control+End');
    await page.waitForTimeout(300);

    let textLen = 0;
    let imgsOk = 0;
    let imgsMiss = 0;

    for (const part of parts) {
      if (part.type === 'html') {
        const txt = part.html.replace(/<[^>]+>/g, '').trim();
        if (!part.html.trim() || (!txt && !/<(h\d|p|br|strong|em|blockquote|li)/i.test(part.html))) continue;
        const r = await page.evaluate(({ sel: s, html: h, idx }) => {
          const pms = [...document.querySelectorAll(s)];
          const pm = pms[pms.length - 1];
          if (!pm) return { ok: false };
          pm.focus();
          const sel2 = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(pm);
          range.collapse(false);
          sel2.removeAllRanges();
          sel2.addRange(range);
          pm.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' ' }));
          document.execCommand('insertHTML', false, h);
          return { ok: true };
        }, { sel, html: part.html });
        if (r.ok) textLen += txt.length;
      } else {
        // 图片段：仅接受 mmbiz CDN；data: / 其他域的图在微信必须先转存
        if (!/^https?:\/\/mmbiz\.qpic\.cn\//.test(part.src)) {
          imgsMiss += 1;
          log(`跳过非素材库图片（微信仅接受 mmbiz CDN）：${part.src.slice(0, 60)}`);
          continue;
        }
        // 从原 img 标签提取 data-* 元信息（若有）
        const ratio = (part.tag.match(/data-ratio="([^"]*)"/) || [])[1] || '1.7777777777777777';
        const dw = (part.tag.match(/data-w="([^"]*)"/) || [])[1] || '640';
        const ds = (part.tag.match(/data-s="([^"]*)"/) || [])[1] || '300,640';
        const ok = await page.evaluate(({ sel: s, src, ratio: ra, dw: w, ds }) => {
          const pms = [...document.querySelectorAll(s)];
          const pm = pms[pms.length - 1];
          if (!pm) return false;
          pm.focus();
          const sel2 = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(pm);
          range.collapse(false);
          sel2.removeAllRanges();
          sel2.addRange(range);
          const esc = src.replace(/&/g, '&amp;');
          const h = '<section style="text-align: center" nodeleaf=""><img src="' + esc + '" data-src="' + esc + '" class="rich_pages wxw-img js_insertlocalimg" data-ratio="' + ra + '" data-s="' + ds + '" data-w="' + w + '" type="block" contenteditable="false"></section>';
          pm.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' ' }));
          document.execCommand('insertHTML', false, h);
          return true;
        }, { sel, src: part.src, ratio, dw, ds });
        if (ok) imgsOk += 1; else imgsMiss += 1;
      }
      await page.waitForTimeout(250);
    }

    await page.waitForTimeout(1500);
    // 核对
    const stat = await page.evaluate((s) => {
      const pms = [...document.querySelectorAll(s)];
      const pm = pms[pms.length - 1];
      if (!pm) return { text: 0, imgs: 0 };
      return { text: (pm.innerText || '').trim().length, imgs: [...pm.querySelectorAll('img')].filter((i) => !i.className.includes('separator')).length };
    }, sel);
    return { text: Math.max(stat.text, textLen), imgs: stat.imgs, expectedImages: imgsOk + imgsMiss, missing: imgsMiss, inserted: imgsOk };
  }

  async doPublish(page, article, _ctx, log) {
    log('打开公众号后台获取 token');
    await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 登录判断：不能只看 URL（未登录时 URL 可能仍是根域名），要看二维码/登录容器
    const qrcode = await page.locator('img[src*="scanloginqrcode"], .login__type__container, .login_frame')
      .first().isVisible({ timeout: 3000 }).catch(() => false);
    if (qrcode) {
      throw new Error('公众号未登录：请先在专用浏览器窗口扫码登录 mp.weixin.qq.com，再重试');
    }

    const tokenMatch = page.url().match(/token=(\d+)/) || (await page.content()).match(/token=(\d+)/);
    if (!tokenMatch) throw new Error('未能获取后台 token，请确认已登录公众号后台');
    const token = tokenMatch[1];

    log('打开图文编辑器');
    const editorUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&token=${token}&lang=zh_CN`;
    await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);

    log('填写标题');
    // 微信新版编辑器：原生 #title textarea 已 visibility:hidden/height:0（仅作存储），
    // 可视标题是 ProseMirror 覆盖层 .title-editor-overlay .ProseMirror（contenteditable）。
    // 填 ProseMirror 后微信会自动同步到 textarea（字数计数器同步更新）。
    const titleReady = await page.waitForFunction(() => {
      const pm = document.querySelector('.title-editor-overlay .ProseMirror[contenteditable="true"]');
      if (pm && pm.getBoundingClientRect().height > 0) return true;
      const t = document.querySelector('#title');
      return t && t.getBoundingClientRect().height > 0; // 老版编辑器兜底
    }, { timeout: 20000 }).then(() => true).catch(() => false);
    if (!titleReady) throw new Error('标题输入框未就绪（编辑器加载超时）');

    const hasPmTitle = (await page.locator('.title-editor-overlay .ProseMirror[contenteditable="true"]').count()) > 0;
    if (hasPmTitle) {
      const pmTitle = page.locator('.title-editor-overlay .ProseMirror[contenteditable="true"]').first();
      await pmTitle.fill('');
      await pmTitle.fill(article.title);
      // 等待同步到隐藏 textarea（计数器变化）
      await page.waitForFunction((expect) => {
        const t = document.querySelector('#title');
        return t && (t.value || '').length > 0;
      }, article.title.slice(0, 10), { timeout: 5000 }).catch(() => {});
    } else {
      const titleEl = await this.trySelect(page, ['#title', 'textarea[placeholder*="标题"]', 'input[placeholder*="标题"]']);
      if (!titleEl) throw new Error('未找到标题输入框（编辑器可能改版）');
      await titleEl.fill(article.title);
    }

    log('上传正文图片到公众号素材库');
    // 微信 ProseMirror schema 不接受 data: URI 的 img（实测被静默丢弃），
    // 必须先把 base64 图上传到素材库（编辑器同源接口 filetransfer，自动带 cookie/ticket），
    // 用返回的 mmbiz.qpic.cn CDN 地址替换后再注入正文
    const wxArticle = await this.inlineBase64ToMaterial(page, article, log);

    log('粘贴正文（分段注入：文字 + 素材库图片 section）');
    const bodyEl = await this.trySelect(page, ['.ProseMirror']);
    if (!bodyEl) throw new Error('未找到正文编辑区');
    const bodyStat = await this.fillWxBody(page, wxArticle, log);
    await page.waitForTimeout(2000);

    if (article.mode === 'publish') {
      log('执行群发（不可撤回）');
      await clickButton(page, ['群发', '发表'], 5000);
      await page.waitForTimeout(3000);
      return { ok: true, url: 'https://mp.weixin.qq.com/', message: `已触发群发，图片 ${bodyStat.imgs} 张，请在后台确认（群发不可撤回）` + (bodyStat.missing ? `；${bodyStat.missing} 张图未插入成功` : '') };
    }

    log('保存草稿');
    const saved = await clickButton(page, ['保存为草稿', '保存'], 6000);
    if (!saved) throw new Error('未找到「保存为草稿」按钮');
    await page.waitForTimeout(2500);
    return { ok: true, url: 'https://mp.weixin.qq.com/cgi-bin/appmsg?action=list&token=' + token, message: `已保存到公众号草稿箱（正文含图 ${bodyStat.imgs}/${bodyStat.expectedImages} 张）` + (bodyStat.missing ? '，部分图片未插入' : '') };
  }
}

module.exports = WeixinPublisher;
