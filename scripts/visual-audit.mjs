import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'scratch/ui-audit'), { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
for (const theme of ['dark', 'light']) {
for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(theme => {
        sessionStorage.setItem('badminton_access_token', 'local-fixture');
        localStorage.setItem('badminton_theme', theme);
    }, theme);
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/api/')) {
            const user = { id: 1, username: 'preview', fullname: 'Tài khoản kiểm thử', role: 'admin', balance: 0 };
            const product = { MaSP: 1, TenSP: 'Vợt cầu lông kiểm thử', MaDM: 1, TenDM: 'Vợt', GiaBan: 500000, TonKho: 5, HinhAnh: 'HA/cc-removebg-preview.png', DoanhThu: 1500000, DaBan: 3 };
            return route.fulfill({ json: { success: true, user, metrics: { revenue_month: 1500000, orders: 3, products: 1 },
                trend: [{ date: '2026-09-20', revenue: 1500000, orders: 3 }], category_distribution: [{ TenDM: 'Vợt', DoanhThu: 1500000, TongSP: 1 }],
                order_status: [{ TrangThai: 'HOAN_THANH', SoLuong: 3 }], top_products: [product], products: [product], product,
                categories: [{ MaDM: 1, TenDM: 'Vợt' }], items: [], orders: [], users: [], requests: [], changes: [], logs: [], reviews: [], cart: [], total: 1 } });
        }
        if (url.hostname !== 'preview.test') return route.abort();
        const file = resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + '\\') || !['.html', '.js', '.css', '.png', '.svg', '.jpg', '.webp'].includes(extname(file))) return route.abort();
        try { await route.fulfill({ body: await readFile(file), contentType: ({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'})[extname(file)] }); }
        catch { await route.fulfill({ status: 404, body: '' }); }
    });
    for (const path of ['admin.html', 'trangchu.html', 'sanpham.html', 'chitiet.html?id=1', 'canhan.html', 'lienhe.html', 'giohang.html']) {
        errors.length = 0;
        await page.goto('http://preview.test/' + path);
        await page.waitForTimeout(1800);
        await page.screenshot({ path: resolve(root, `scratch/ui-audit/${theme}-${width}-${path.split('?')[0]}.png`) });
        if (path === 'admin.html') {
            await page.locator('.admin-top-products-card').scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);
            await page.screenshot({ path: resolve(root, `scratch/ui-audit/${theme}-${width}-admin-products.png`) });
        }
        const layout = await page.evaluate(() => ({
            viewport: innerWidth, document: document.documentElement.scrollWidth,
            topButtons: document.querySelectorAll('#bsBackToTop,.sport-back-to-top,.to-top').length
        }));
        results.push({ theme, width, path, ...layout, errors: [...errors] });
    }
    await page.close();
}
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
if (results.some(r => r.errors.length || r.document > r.viewport + 2 || r.topButtons > 1)) process.exitCode = 1;
