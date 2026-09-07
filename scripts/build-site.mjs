import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const client = resolve(dist, "client");
const server = resolve(dist, "server");
const allowedAssetExtensions = new Set([".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".svg"]);

function encodePathSegment(name) {
  return encodeURIComponent(name);
}

if (relative(root, dist).startsWith(`..${sep}`) || dist === root) {
  throw new Error("Thư mục build không an toàn.");
}

await rm(dist, { recursive: true, force: true });
await mkdir(client, { recursive: true });
await mkdir(server, { recursive: true });

const rootEntries = await readdir(root, { withFileTypes: true });
for (const entry of rootEntries) {
  if (entry.isFile() && extname(entry.name).toLowerCase() === ".html") {
    await cp(join(root, entry.name), join(client, encodePathSegment(entry.name)));
  }
}

for (const publicFile of ["favicon.svg"]) {
  await cp(resolve(root, publicFile), resolve(client, publicFile));
}

async function copyAssets(sourceDir, destinationDir) {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const source = join(sourceDir, entry.name);
    const destination = join(destinationDir, encodePathSegment(entry.name));
    if (entry.isDirectory()) {
      await mkdir(destination, { recursive: true });
      await copyAssets(source, destination);
    } else if (entry.isFile() && allowedAssetExtensions.has(extname(entry.name).toLowerCase())) {
      await mkdir(destinationDir, { recursive: true });
      await cp(source, destination);
    }
  }
}

await copyAssets(resolve(root, "css"), resolve(client, "css"));
await copyAssets(resolve(root, "HA"), resolve(client, "HA"));
await copyAssets(resolve(root, "vendor"), resolve(client, "vendor"));

const workerSource = `const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") url.pathname = "/trangchu.html";

    let response = await env.ASSETS.fetch(new Request(url, request));
    if (response.status === 404 && !url.pathname.split("/").pop().includes(".")) {
      url.pathname = "/trangchu.html";
      response = await env.ASSETS.fetch(new Request(url, request));
    }

    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

export default worker;
`;

await writeFile(resolve(server, "index.js"), workerSource, "utf8");

const hostingPath = resolve(root, ".openai", "hosting.json");
try {
  const hosting = await readFile(hostingPath, "utf8");
  await mkdir(resolve(dist, ".openai"), { recursive: true });
  await writeFile(resolve(dist, ".openai", "hosting.json"), hosting, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

console.log("Bản dựng tĩnh đã sẵn sàng trong dist/.");
