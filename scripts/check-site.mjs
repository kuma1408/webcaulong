import { access, readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const errors = new Set();
const htmlFiles = (await readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".html")
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, "vi"));

const customStyles = new Map([
  ["trangchu.html", ["css/home.css"]],
  ["dangnhap.html", ["css/account.css"]],
  ["dangky.html", ["css/account.css"]],
  ["canhan.html", ["css/account.css"]],
  ["admin.html", ["css/admin.css"]],
  ["index.html", []],
  // Trang lỗi đứng độc lập: dùng biến màu của home.css và giao diện riêng error-page.css.
  ["404.html", ["css/home.css", "css/error-page.css"]],
  ["500.html", ["css/home.css", "css/error-page.css"]],
]);

const forbiddenFrontendExtensions = new Set([
  ".db", ".env", ".key", ".pem", ".pfx", ".p12", ".py", ".pyc", ".sql", ".sqlite", ".sqlite3",
]);
const forbiddenClientNames = new Set([
  ".env", "dockerfile", "migrate_database.py", "package.json", "requirements.txt",
]);
const textExtensions = new Set([".cjs", ".css", ".html", ".js", ".json", ".mjs", ".svg", ".txt", ".xml"]);
const javascriptExtensions = new Set([".cjs", ".js", ".mjs"]);
const ignoredWalkDirectories = new Set([".git", "dist", "node_modules", "scratch", "__pycache__"]);
const secretPatterns = [
  ["khóa riêng PEM", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ["GitHub token", /\bgh[pousr]_[0-9A-Za-z]{30,}\b/],
  ["OpenAI-style key", /\bsk-[0-9A-Za-z_-]{24,}\b/],
  ["Stripe secret key", /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}\b/],
  ["database URI có mật khẩu", /\b(?:mysql|mariadb|postgres(?:ql)?)\+?[a-z0-9]*:\/\/[^\s:/]+:[^\s@/]+@/i],
  [
    "secret gán cứng",
    /\b(?:API_KEY|CLIENT_SECRET|DATABASE_URL|DB_PASSWORD|PRIVATE_KEY|SECRET_KEY)\b\s*[:=]\s*["'`][^"'`\r\n]{8,}["'`]/i,
  ],
];
const placeholderPatterns = [
  ["số điện thoại mẫu", /\+123456789/],
  ["email mẫu", /support@thethao\.com/i],
  ["địa chỉ mẫu", /Số 123,\s*Đường ABC/i],
  ["hàm tìm kiếm chưa triển khai", /Search functionality not implemented/i],
];

function addError(message) {
  errors.add(message);
}

function getAttribute(attributes, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = attributes.match(pattern);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}

function markupOnly(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, "$1$2")
    .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style>)/gi, "$1$2");
}

function extractLocalReferences(html) {
  const references = [];
  const markup = markupOnly(html);
  const attributePattern = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (const match of markup.matchAll(attributePattern)) {
    const reference = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!reference || /^(?:#|\?|\/\/|[a-z][a-z0-9+.-]*:)/i.test(reference)) continue;
    references.push(reference);
  }
  return references;
}

function localPathFromReference(reference, owner) {
  const withoutQuery = reference.split(/[?#]/, 1)[0].replace(/&amp;/gi, "&");
  if (!withoutQuery) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    addError(`${owner}: URL không thể giải mã: ${reference}`);
    return null;
  }

  const absolutePath = resolve(root, decoded.replace(/^[\\/]+/, ""));
  const relativePath = relative(root, absolutePath);
  if (!relativePath || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    addError(`${owner}: tham chiếu nằm ngoài thư mục frontend: ${reference}`);
    return null;
  }
  return { absolutePath, relativePath };
}

function normalizeWebPath(value) {
  return value
    .split(/[?#]/, 1)[0]
    .replace(/^[./\\]+/, "")
    .replace(/\\/g, "/")
    .toLowerCase();
}

function expectedStylesFor(fileName) {
  return customStyles.get(fileName.toLowerCase()) ?? ["css/tutaoo.css", "css/site-refresh.css"];
}

function verifyStyles(fileName, html) {
  const stylesheets = [];
  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = match[1];
    const relValue = getAttribute(attributes, "rel") ?? "";
    if (!relValue.split(/\s+/).some((value) => value.toLowerCase() === "stylesheet")) continue;
    const href = getAttribute(attributes, "href");
    if (href) stylesheets.push(normalizeWebPath(href));
  }

  for (const expected of expectedStylesFor(fileName)) {
    if (!stylesheets.includes(expected.toLowerCase())) {
      addError(`${fileName}: thiếu stylesheet bắt buộc ${expected}`);
    }
  }
}

function compactSyntaxError(result) {
  const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim();
  return output.split(/\r?\n/).slice(0, 5).join(" | ") || `Node thoát với mã ${result.status}`;
}

function checkJavaScriptSource(source, label, module = false) {
  if (!source.trim()) return true;
  const args = ["--check"];
  if (module) args.push("--input-type=module");
  const result = spawnSync(process.execPath, args, {
    input: source,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) {
    addError(`${label}: JavaScript không hợp lệ — ${compactSyntaxError(result)}`);
    return false;
  }
  return true;
}

function checkInlineScripts(fileName, html) {
  let checked = 0;
  let index = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    index += 1;
    const attributes = match[1];
    const source = match[2];
    if (getAttribute(attributes, "src") !== null) continue;

    const type = (getAttribute(attributes, "type") ?? "").trim().toLowerCase().split(";", 1)[0];
    if (type.includes("json") || type === "importmap" || type === "speculationrules") continue;
    if (type && type !== "module" && !/(?:java|ecma)script/.test(type)) continue;

    checked += 1;
    checkJavaScriptSource(source, `${fileName} (inline script #${index})`, type === "module");
  }
  return checked;
}

async function walkFiles(directory, options = {}) {
  const results = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return results;
    throw error;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (options.skipDirectories?.has(entry.name)) continue;
      results.push(...await walkFiles(absolutePath, options));
    } else if (entry.isFile()) {
      results.push(absolutePath);
    }
  }
  return results;
}

let localReferenceCount = 0;
let inlineScriptCount = 0;
const frontendTextFiles = new Set();

for (const fileName of htmlFiles) {
  const absoluteHtmlPath = resolve(root, fileName);
  const html = await readFile(absoluteHtmlPath, "utf8");
  frontendTextFiles.add(absoluteHtmlPath);

  if (!/<html\b[^>]*\blang\s*=\s*(["'])vi\1/i.test(html)) {
    addError(`${fileName}: thiếu lang="vi" trên thẻ html`);
  }
  if (!/<meta\b[^>]*\bname\s*=\s*(["'])viewport\1[^>]*>/i.test(html)) {
    addError(`${fileName}: thiếu meta viewport`);
  }
  const missingAlt = markupOnly(html).match(/<img\b(?![^>]*\balt\s*=)[^>]*>/gi) || [];
  if (missingAlt.length) addError(`${fileName}: có ${missingAlt.length} ảnh thiếu alt`);
  const unsafeBlankLinks = markupOnly(html).match(/<a\b(?=[^>]*\btarget\s*=\s*(["'])_blank\1)(?![^>]*\brel\s*=)[^>]*>/gi) || [];
  if (unsafeBlankLinks.length) addError(`${fileName}: có ${unsafeBlankLinks.length} liên kết _blank thiếu rel an toàn`);
  verifyStyles(fileName, html);
  inlineScriptCount += checkInlineScripts(fileName, html);

  for (const reference of extractLocalReferences(html)) {
    localReferenceCount += 1;
    const local = localPathFromReference(reference, fileName);
    if (!local) continue;

    if (forbiddenFrontendExtensions.has(extname(local.relativePath).toLowerCase())) {
      addError(`${fileName}: frontend tham chiếu tệp back-end/nhạy cảm ${reference}`);
    }
    try {
      await access(local.absolutePath);
    } catch {
      addError(`${fileName}: không tìm thấy tài nguyên ${reference}`);
      continue;
    }
    if (textExtensions.has(extname(local.absolutePath).toLowerCase())) {
      frontendTextFiles.add(local.absolutePath);
    }
  }
}

for (const directoryName of ["css", "HA"]) {
  for (const filePath of await walkFiles(resolve(root, directoryName))) {
    if (textExtensions.has(extname(filePath).toLowerCase())) frontendTextFiles.add(filePath);
  }
}

const clientRoot = resolve(root, "dist", "client");
const clientFiles = await walkFiles(clientRoot);
for (const filePath of clientFiles) {
  const extension = extname(filePath).toLowerCase();
  const baseName = filePath.slice(filePath.lastIndexOf(sep) + 1).toLowerCase();
  if (forbiddenFrontendExtensions.has(extension) || forbiddenClientNames.has(baseName)) {
    addError(`dist/client chứa tệp back-end/nhạy cảm: ${relative(clientRoot, filePath)}`);
  }
  if (textExtensions.has(extension)) frontendTextFiles.add(filePath);
}

for (const filePath of frontendTextFiles) {
  const source = await readFile(filePath, "utf8");
  const sourceLabel = relative(root, filePath);
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(source)) {
      addError(`${sourceLabel}: phát hiện ${label} trong tài nguyên frontend`);
    }
  }
  if (!normalizeWebPath(sourceLabel).startsWith("dist/client/")) {
    for (const [label, pattern] of placeholderPatterns) {
      if (pattern.test(source)) addError(`${sourceLabel}: còn ${label}`);
    }
  }
}

const ownedJavaScript = (await walkFiles(root, { skipDirectories: ignoredWalkDirectories }))
  .filter((filePath) => javascriptExtensions.has(extname(filePath).toLowerCase()));

for (const filePath of ownedJavaScript) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) {
    addError(`${relative(root, filePath)}: JavaScript không hợp lệ — ${compactSyntaxError(result)}`);
  }
}

if (errors.size) {
  console.error([...errors].map((error) => `- ${error}`).join("\n"));
  console.error(`Kiểm tra thất bại với ${errors.size} lỗi.`);
  process.exitCode = 1;
} else {
  console.log(
    `Kiểm tra site đạt: ${htmlFiles.length} HTML, ${localReferenceCount} tham chiếu local, `
      + `${ownedJavaScript.length} tệp JS và ${inlineScriptCount} inline script.`,
  );
}
