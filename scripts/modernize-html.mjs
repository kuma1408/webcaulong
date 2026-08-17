import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(SCRIPT_DIR, "..");
const CHECK_ONLY = process.argv.includes("--check");

// Các trang này có giao diện riêng hoặc đang được nâng cấp bởi luồng khác.
const EXCLUDED_FILES = new Set([
  "trangchu.html",
  "index.html",
  "dangnhap.html",
  "dangky.html",
  "canhan.html",
  "admin.html",
  "giohang.html",
  "lienhe.html",
]);

const VIEWPORT_TAG = '<meta name="viewport" content="width=device-width, initial-scale=1">';
const ASSET_VERSION = "20260817-3";
const REFRESH_LINK = `<link rel="stylesheet" href="css/site-refresh.css?v=${ASSET_VERSION}">`;
const AUTH_SCRIPT = `<script src="css/auth.js?v=${ASSET_VERSION}"></script>`;

function insertAfterFirst(source, pattern, addition) {
  const match = source.match(pattern);
  if (!match || match.index === undefined) return null;
  const end = match.index + match[0].length;
  return `${source.slice(0, end)}${addition}${source.slice(end)}`;
}

function insertBeforeFirst(source, pattern, addition) {
  const match = source.match(pattern);
  if (!match || match.index === undefined) return null;
  return `${source.slice(0, match.index)}${addition}${source.slice(match.index)}`;
}

function imageAltFromSource(value) {
  const known = new Map([
    ["cc-removebg-preview.png", "Badminton Store"],
    ["dcm.png", "Badminton Store"],
    ["lop.png", "Tài khoản"],
    ["fb.png", "Facebook"],
    ["isg.png", "Instagram"],
    ["yt.png", "YouTube"],
  ]);
  let decoded = String(value || "").split(/[?#]/, 1)[0].replace(/\\/g, "/");
  try { decoded = decodeURIComponent(decoded); } catch { /* Giữ nguyên tên tệp nếu URL lỗi. */ }
  const fileName = decoded.split("/").pop() || "";
  const mapped = known.get(fileName.toLowerCase());
  if (mapped) return mapped;
  const label = fileName
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+\d[\d.,]*\s*₫.*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
  return label && !/^(?:image|img|banner\d*)$/i.test(label) ? label : "Hình minh họa cầu lông";
}

function escapeAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function modernizeHtml(rawSource, fileName) {
  const hasBom = rawSource.charCodeAt(0) === 0xfeff;
  let source = hasBom ? rawSource.slice(1) : rawSource;
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const stats = { lang: 0, viewport: 0, stylesheet: 0, auth: 0, cleanup: 0 };

  if (!/<html\b/i.test(source) || !/<head\b/i.test(source) || !/<\/head>/i.test(source)) {
    throw new Error(`${fileName}: thiếu cấu trúc html/head hợp lệ`);
  }

  source = source.replace(/<html\b([^>]*)>/i, (tag, attributes) => {
    if (/\blang\s*=\s*(["']).*?\1/i.test(attributes)) {
      return tag.replace(/\blang\s*=\s*(["']).*?\1/i, 'lang="vi"');
    }
    stats.lang += 1;
    return `<html lang="vi"${attributes}>`;
  });

  if (!/<meta\b[^>]*\bname\s*=\s*(["'])viewport\1[^>]*>/i.test(source)) {
    const afterCharset = insertAfterFirst(
      source,
      /<meta\b[^>]*\bcharset\s*=\s*(["'])?[^\s"'>]+\1?[^>]*>/i,
      `${eol}    ${VIEWPORT_TAG}`,
    );
    source = afterCharset ?? source.replace(/<head\b[^>]*>/i, (tag) => `${tag}${eol}    ${VIEWPORT_TAG}`);
    stats.viewport += 1;
  }

  if (!/<link\b[^>]*\bhref\s*=\s*(["'])[^"']*css\/site-refresh\.css(?:[?#][^"']*)?\1[^>]*>/i.test(source)) {
    const inserted = insertBeforeFirst(source, /<\/head>/i, `    ${REFRESH_LINK}${eol}`);
    if (inserted === null) throw new Error(`${fileName}: không tìm thấy </head>`);
    source = inserted;
    stats.stylesheet += 1;
  }
  const normalizedStylesheet = source.replace(
    /css\/site-refresh\.css(?:[?#][^"']*)?/gi,
    `css/site-refresh.css?v=${ASSET_VERSION}`,
  );
  if (normalizedStylesheet !== source) {
    source = normalizedStylesheet;
    stats.stylesheet += 1;
  }

  if (!/<script\b[^>]*\bsrc\s*=\s*(["'])[^"']*css\/auth\.js(?:[?#][^"']*)?\1[^>]*>/i.test(source)) {
    const inserted = insertBeforeFirst(source, /<\/body>/i, `    ${AUTH_SCRIPT}${eol}`);
    if (inserted === null) throw new Error(`${fileName}: không tìm thấy </body>`);
    source = inserted;
    stats.auth += 1;
  }
  const normalizedAuth = source.replace(
    /css\/auth\.js(?:[?#][^"']*)?/gi,
    `css/auth.js?v=${ASSET_VERSION}`,
  );
  if (normalizedAuth !== source) {
    source = normalizedAuth;
    stats.auth += 1;
  }

  const placeholderPatterns = [
    [
      /<li>\s*<a\s+href\s*=\s*(["'])tel:\+123456789\1>\s*Hotline:\s*\+123456789\s*<\/a>\s*<\/li>/gi,
      '<li><a href="lienhe.html#contact">Gửi yêu cầu hỗ trợ</a></li>',
    ],
    [
      /<li>\s*<a\s+href\s*=\s*(["'])mailto:support@thethao\.com\1>\s*Email:\s*support@thethao\.com\s*<\/a>\s*<\/li>/gi,
      '<li><a href="hướng dẫn.html">Hướng dẫn mua hàng</a></li>',
    ],
    [
      /<li>\s*<a\s+href\s*=\s*(["'])#\1>\s*Địa chỉ:\s*Số 123,\s*Đường ABC,\s*TP\.\s*HCM\s*<\/a>\s*<\/li>/gi,
      '<li>Hỗ trợ giao hàng toàn quốc</li>',
    ],
  ];
  for (const [pattern, replacement] of placeholderPatterns) {
    source = source.replace(pattern, () => {
      stats.cleanup += 1;
      return replacement;
    });
  }

  source = source.replace(
    /function\s+searchProduct\s*\(\s*\)\s*\{\s*alert\s*\(\s*(["'])Search functionality not implemented\1\s*\)\s*;?\s*\}/gi,
    () => {
      stats.cleanup += 1;
      return `function searchProduct() {
      const input = document.querySelector('.search-input');
      const keyword = input?.value.trim();
      if (keyword) window.location.assign('sanpham.html?q=' + encodeURIComponent(keyword));
      else input?.focus();
    }`;
    },
  );

  source = source.replace(/<img\b(?![^>]*\balt\s*=)([^>]*)>/gi, (tag, attributes) => {
    const sourceMatch = attributes.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const alt = imageAltFromSource(sourceMatch ? (sourceMatch[1] ?? sourceMatch[2] ?? sourceMatch[3]) : "");
    stats.cleanup += 1;
    return tag.replace(/<img\b/i, `<img alt="${escapeAttribute(alt)}"`);
  });

  source = source.replace(
    /<a\b(?=[^>]*\btarget\s*=\s*(["'])_blank\1)(?![^>]*\brel\s*=)([^>]*)>/gi,
    (tag) => {
      stats.cleanup += 1;
      return tag.replace(/<a\b/i, '<a rel="noopener noreferrer"');
    },
  );

  return {
    output: hasBom ? `\ufeff${source}` : source,
    stats,
  };
}

const entries = await readdir(SITE_ROOT, { withFileTypes: true });
const htmlFiles = entries
  .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".html")
  .filter((entry) => !EXCLUDED_FILES.has(entry.name.toLowerCase()))
  .sort((left, right) => left.name.localeCompare(right.name, "vi"));

const report = {
  mode: CHECK_ONLY ? "check" : "write",
  root: SITE_ROOT,
  scanned: htmlFiles.length,
  changed: 0,
  unchanged: 0,
  additions: { lang: 0, viewport: 0, stylesheet: 0, auth: 0, cleanup: 0 },
  files: [],
};

for (const entry of htmlFiles) {
  const absolutePath = resolve(SITE_ROOT, entry.name);
  const source = await readFile(absolutePath, "utf8");
  const result = modernizeHtml(source, entry.name);
  const changed = result.output !== source;

  if (changed) {
    report.changed += 1;
    report.files.push(entry.name);
    for (const key of Object.keys(report.additions)) {
      report.additions[key] += result.stats[key];
    }
    if (!CHECK_ONLY) await writeFile(absolutePath, result.output, "utf8");
  } else {
    report.unchanged += 1;
  }
}

console.log(JSON.stringify(report, null, 2));

if (CHECK_ONLY && report.changed > 0) {
  process.exitCode = 1;
}
