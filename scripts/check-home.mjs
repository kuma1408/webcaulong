import { access, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const htmlPath = resolve(root, "trangchu.html");
const cssPath = resolve(root, "css", "home.css");
const jsPath = resolve(root, "css", "home.js");
const [html, css, js] = await Promise.all([
  readFile(htmlPath, "utf8"),
  readFile(cssPath, "utf8"),
  readFile(jsPath, "utf8"),
]);

const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

assert((html.match(/<h1\b/gi) || []).length === 1, "Trang chủ phải có đúng một thẻ h1.");
assert(/<meta\s+name="viewport"/i.test(html), "Thiếu meta viewport.");
assert(/<meta\s+name="description"/i.test(html), "Thiếu meta description.");
assert(/<main\b/i.test(html) && /<nav\b/i.test(html), "Thiếu landmark main hoặc nav.");
assert(!/swiper|unpkg\.com/i.test(html), "Trang chủ vẫn còn phụ thuộc Swiper/CDN.");
assert(!/\+123|Đường ABC|support@thethao/i.test(html), "Trang chủ còn dữ liệu liên hệ mẫu.");
assert((html.match(/<img\b(?![^>]*\balt=)[^>]*>/gi) || []).length === 0, "Có ảnh thiếu alt text.");
assert((html.match(/<button\b(?![^>]*\btype=)[^>]*>/gi) || []).length === 0, "Có button thiếu thuộc tính type.");

const localRefs = [...html.matchAll(/(?:src|href)="([^"]+)"/gi)]
  .map((match) => match[1])
  .filter((ref) => !/^(?:#|https?:|mailto:|tel:)/i.test(ref));

for (const ref of localRefs) {
  const localPath = decodeURIComponent(ref.split(/[?#]/, 1)[0]).replace(/^\//, "");
  if (!localPath) continue;
  try {
    await access(resolve(root, localPath));
  } catch {
    errors.push(`Không tìm thấy tài nguyên: ${ref}`);
  }
}

for (const match of js.matchAll(/image:\s*'([^']+)'/g)) {
  try {
    await access(resolve(root, match[1]));
  } catch {
    errors.push(`Không tìm thấy ảnh dự phòng: ${match[1]}`);
  }
}

function balancedBraces(source) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let comment = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (comment) {
      if (char === "*" && next === "/") { comment = false; index += 1; }
      continue;
    }
    if (!quote && char === "/" && next === "*") { comment = true; index += 1; continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0 && !quote && !comment;
}

assert(balancedBraces(css), "CSS có dấu ngoặc không cân bằng.");
assert(extname(jsPath) === ".js", "Tệp JavaScript trang chủ không hợp lệ.");

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Kiểm tra đạt: ${localRefs.length} liên kết/tài nguyên, semantic HTML, alt text và CSS.`);
}
