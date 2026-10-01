/**
 * 文章处理：Markdown → HTML，外链图片下载转 base64
 *
 * 为什么图片转 base64：微信公众号编辑器会自动把粘贴内容里的 base64 图片
 * 上传到素材库并替换为微信 CDN 地址；外链图片则会被防盗链拦截。
 */
const { marked } = require('marked');
marked.setOptions({ gfm: true, breaks: true });

const MAX_IMG_BYTES = 10 * 1024 * 1024;
const MIN_IMG_BYTES = 1024; // 小于 1KB 基本是防盗链占位图 / 1x1 透明图，视为失败

/** 从 markdown 中提取图片 URL 列表 */
function extractImages(md) {
  const set = new Set();
  for (const m of (md || '').matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) set.add(m[1]);
  for (const m of (md || '').matchAll(/<img[^>]+src=["']([^"']+)["']/g)) set.add(m[1]);
  return [...set];
}

/** 下载图片并转为 data URI，失败返回 null
 *  严格校验：HTTP 状态码 + 真实字节数 + 文件头魔数，
 *  避免把防盗链返回的 404 占位图当成正常图片（这类图粘贴到编辑器后不显示）。
 */
async function downloadAsDataUri(url) {
  try {
    if (!/^https?:/i.test(url)) return null;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: new URL(url).origin + '/',
      },
    });
    if (!res.ok) return null; // 404/403 直接判失败

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < MIN_IMG_BYTES || buf.length > MAX_IMG_BYTES) return null;

    // 按文件头魔数判断真实类型，不轻信 content-type
    const mime = sniffImageMime(buf);
    if (!mime) return null;

    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** 通过文件头魔数识别图片类型，非图片返回 null */
function sniffImageMime(buf) {
  if (buf.length < 12) return null;
  const hex = buf.slice(0, 12).toString('hex').toLowerCase();
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';
  if (hex.startsWith('47494638')) return 'image/gif';
  if (hex.startsWith('52494646') && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (hex.startsWith('424d')) return 'image/bmp';
  // svg 是文本，单独判断
  const head = buf.slice(0, 300).toString('utf8');
  if (/<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return null;
}

/**
 * Markdown → 编辑器可粘贴的 HTML
 * @param {boolean} inlineImages 是否把外链图下载转 base64（公众号/头条建议开启）
 * @returns {{ html: string, images: string[], inlineFailed: string[] }}
 */
async function mdToHtml(md, { inlineImages = true } = {}) {
  const images = extractImages(md);
  let html = marked.parse(md || '');

  const inlineFailed = [];
  if (inlineImages) {
    // 并发下载，缩短总耗时（大图多时串行会很慢）
    const results = await Promise.all(images.map((src) => downloadAsDataUri(src)));
    images.forEach((src, i) => {
      const dataUri = results[i];
      if (dataUri) {
        html = html.split(src).join(dataUri);
      } else {
        inlineFailed.push(src);
        // 关键：转存失败的图必须整段移除，绝不能留外链 ——
        // 外链图粘贴到平台编辑器必被防盗链拦截，表现为「只有文字没有图片」
        html = removeImgBySrc(html, src);
      }
    });
  }
  return { html, images, inlineFailed };
}

/** 从 HTML 中彻底移除指定 src 的 <img>（连同其空 <p> 包裹），避免残留外链 */
function removeImgBySrc(html, src) {
  const esc = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html
    .replace(new RegExp(`<p>\\s*<img[^>]*src=["']${esc}["'][^>]*>\\s*</p>`, 'gi'), '')
    .replace(new RegExp(`<img[^>]*src=["']${esc}["'][^>]*>`, 'gi'), '');
}

/** HTML → 纯文本（小红书等纯文本平台用） */
function htmlToText(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { mdToHtml, htmlToText, extractImages, downloadAsDataUri };
