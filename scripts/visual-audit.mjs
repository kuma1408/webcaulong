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
for (const width of [1440, 1024, 390]) {
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
                trend: [{ date: '2026-09-20', revenue: 1500000, orders: 3 }], category_distribution: ['Vợt cầu lông', 'Giày cầu lông', 'Áo cầu lông', 'Quần cầu lông', 'Túi đựng vợt và phụ kiện thi đấu', 'Balo', 'Váy', 'Phụ kiện'].map((TenDM, i) => ({ TenDM, DoanhThu: 1500000 * (8 - i), TongSP: i + 1 })),
                order_status: [{ TrangThai: 'HOAN_THANH', SoLuong: 3 }], top_products: [product], products: [product], product,
                categories: [{ MaDM: 1, TenDM: 'Vợt' }], items: url.pathname === '/api/gio-hang' ? [{ ...product, SoLuong: 2, ThanhTien: 1000000 }] : [], orders: [], users: [], requests: [], changes: [], logs: [], reviews: [], cart: [], total: 1000000 } });
        }
        if (url.hostname !== 'preview.test') return route.abort();
        const file = resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + '\\') || !['.html', '.js', '.css', '.png', '.svg', '.jpg', '.webp'].includes(extname(file))) return route.abort();
        try { await route.fulfill({ body: await readFile(file), contentType: ({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'})[extname(file)] }); }
        catch { await route.fulfill({ status: 404, body: '' }); }
    });
    for (const path of (process.env.AUDIT_PAGES?.split(',') || ['admin.html', 'trangchu.html', 'sanpham.html', 'chitiet.html?id=1', 'canhan.html', 'lienhe.html', 'giohang.html'])) {
        errors.length = 0;
        await page.goto('http://preview.test/' + path);
        await page.waitForTimeout(1800);
        if (path === 'trangchu.html') {
            await page.locator('.category-grid').scrollIntoViewIfNeeded();
            await page.waitForTimeout(700);
            await page.locator('.category-grid').screenshot({ path: resolve(root, `scratch/ui-audit/${theme}-${width}-categories.png`) });
            const blend = await page.locator('.category-card img').first().evaluate(node => getComputedStyle(node).mixBlendMode);
            if (theme === 'dark' && blend !== 'normal') errors.push('Category images use a darkening blend');
            await page.evaluate(() => scrollTo(0, 0));
        }
        if (path.startsWith('chitiet') && width > 992) {
            const gallery = page.locator('.detail-img-box');
            await page.evaluate(() => scrollTo(0, 450));
            await page.waitForTimeout(500);
            const first = await gallery.boundingBox();
            await page.evaluate(() => scrollTo(0, 650));
            await page.waitForTimeout(500);
            const second = await gallery.boundingBox();
            if (Math.abs(first.y - second.y) > 3) errors.push('Product gallery does not stay sticky');
            const menuBottom = await page.locator('#menu').evaluate(node => node.getBoundingClientRect().bottom);
            if (second.y < menuBottom) errors.push('Product gallery is covered by navigation');
        }
        if (path === 'giohang.html') {
            if (await page.locator('#couponInput').count() !== 1) errors.push('Duplicate coupon field');
            if (!await page.locator('.checkout-box > #checkoutForm').count()) errors.push('Checkout form nested incorrectly');
        }
        await page.screenshot({ path: resolve(root, `scratch/ui-audit/${theme}-${width}-${path.split('?')[0]}.png`) });
        if (path === 'admin.html') {
            await page.locator('.admin-top-products-card').scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);
            await page.screenshot({ path: resolve(root, `scratch/ui-audit/${theme}-${width}-admin-products.png`) });
        }
        if (width === 390 && await page.locator('.bs-mobile-toggle').count()) {
            const links = page.locator('.bs-nav__links');
            if (await links.isVisible()) errors.push('Mobile menu visible while closed');
            await page.locator('.bs-mobile-toggle').click();
            if (!await links.isVisible()) errors.push('Mobile menu did not open');
            await page.locator('.bs-mobile-toggle').click();
            if (await links.isVisible()) errors.push('Mobile menu did not close');
        }
        const layout = await page.evaluate(() => ({
            viewport: innerWidth, document: document.documentElement.scrollWidth,
            topButtons: document.querySelectorAll('#bsBackToTop,.sport-back-to-top,.to-top').length,
            clippedLegends: [...document.querySelectorAll('.admin-legend-card')].filter(node => node.scrollHeight > node.clientHeight + 2).length
        }));
        results.push({ theme, width, path, ...layout, errors: [...errors] });
    }
    await page.close();
}
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
if (results.some(r => r.errors.length || r.document > r.viewport + 2 || r.topButtons > 1 || r.clippedLegends)) process.exitCode = 1;
