import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}
function fixture(file, marker, expose) {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).find(script => script.includes(marker));
    const nodes = new Map();
    const node = () => ({ value: '', textContent: '', innerHTML: '', children: [], style: {}, hidden: false,
        classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute() {},
        setCustomValidity(value) { this.validityMessage = value; }, reportValidity() { return !this.validityMessage; },
        querySelector() { return node(); }, appendChild(child) { this.children.push(child); },
        replaceChildren(...children) { this.children = children; } });
    const get = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
    const context = vm.createContext({ console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
        API_BASE: 'https://store.test', API_HEADERS: {}, showToast() {}, capNhatBadgeGioHang() {},
        window: { addEventListener() {} }, history: { replaceState() {} }, location: { pathname: '/sanpham.html' },
        document: { getElementById: get, querySelectorAll: () => [], querySelector: () => node(), createElement: node, addEventListener() {} } });
    vm.runInContext(`${source}\n${expose}`, context);
    return { context, get, api: context.testStore };
}

const catalog = fixture('sanpham.html', 'async function fetchCatalogProducts', `
    globalThis.rendered = [];
    renderCatalogList = (products, total) => rendered.push({ products, total });
    globalThis.testStore = { fetchCatalogProducts, renderPagination, setPage: value => currentPage = value };
`);
catalog.get('sortSelect').value = 'moi_nhat';
let calls = [];
catalog.context.fetch = () => { const pending = deferred(); calls.push(pending); return pending.promise; };
const first = catalog.api.fetchCatalogProducts();
const second = catalog.api.fetchCatalogProducts();
calls[1].resolve({ ok: true, json: async () => ({ success: true, products: [], total: 0 }) });
await second;
calls[0].resolve({ ok: true, json: async () => ({ success: true, products: [{ MaSP: 1 }], total: 1 }) });
await first;
assert.equal(catalog.context.rendered.length, 1, 'Old requests must not replace newer filters');
assert.equal(catalog.context.rendered[0].total, 0, 'Empty API results must remain empty');
assert.equal(catalog.context.rendered[0].products.length, 0);
catalog.get('priceMin').value = '100'; catalog.get('priceMax').value = '0';
await catalog.api.fetchCatalogProducts();
assert.equal(calls.length, 2, 'Invalid price range must not send a request');
assert.ok(catalog.get('priceMax').validityMessage);
catalog.api.setPage(5000);
catalog.api.renderPagination(200000, 20);
assert.ok(catalog.get('pagination').children.length <= 9, 'Pagination stays bounded for large catalogs');
catalog.get('priceMin').value = ''; catalog.get('priceMax').value = '';
catalog.context.fetch = async () => { throw Error('offline'); };
await catalog.api.fetchCatalogProducts();
assert.match(catalog.get('productGrid').innerHTML, /Thử lại/);
assert.equal(catalog.context.rendered.length, 1, 'Network errors must not fabricate products');

const cart = fixture('giohang.html', 'async function updateItemQuantity', `
    fetchCartItems = async () => {};
    globalThis.testStore = { updateItemQuantity, applyCoupon, buildVietQrPaymentData, processCheckout,
        setCart: () => { cartReady = true; cartItems = [{ MaSP: 1 }]; },
        setCoupon: () => { cartTotal = 100000; appliedCouponCode = 'OLD'; appliedDiscount = 20000; },
        discount: () => appliedDiscount };
`);
calls = [];
cart.context.fetch = () => { const pending = deferred(); calls.push(pending); return pending.promise; };
cart.api.setCoupon();
const update = cart.api.updateItemQuantity(1, 3);
await cart.api.updateItemQuantity(1, 4);
assert.equal(calls.length, 1, 'Repeated quantity clicks must not send concurrent writes');
assert.equal(cart.api.discount(), 0, 'Cart changes invalidate stale discounts');
calls[0].resolve({ ok: true, json: async () => ({ success: true }) });
await update;
cart.api.setCoupon(); cart.get('couponInput').value = '?';
await cart.api.applyCoupon();
assert.equal(cart.api.discount(), 0);
assert.equal(cart.get('discountVal').textContent, '0 ₫', 'Invalid vouchers must immediately update the visible total');
assert.equal(cart.api.buildVietQrPaymentData(), null, 'No fabricated bank payment defaults');
const payment = { orderPlaced: true, configured: true, qr_url: '/api/thanh-toan/ma-qr.png?reference=ORDER1', account_no: '123456789', content: 'ORDER1' };
assert.equal(cart.api.buildVietQrPaymentData(payment).qr_url, 'https://store.test/api/thanh-toan/ma-qr.png?reference=ORDER1');
assert.equal(cart.api.buildVietQrPaymentData({ ...payment, qr_url: 'https://other.test/qr' }), null);
cart.api.setCart();
let checkoutCalls = 0;
cart.context.fetch = async () => { checkoutCalls++; throw Error('network'); };
await cart.api.processCheckout({ preventDefault() {} });
await cart.api.processCheckout({ preventDefault() {} });
assert.equal(checkoutCalls, 2, 'Checkout must allow retry after a failed request');
console.log('Store: request races, empty/error states, price validation, bounded pagination, cart concurrency, voucher totals and server-issued QR passed.');

const authSource = readFileSync(new URL('../css/auth.js', import.meta.url), 'utf8').split('    // API tương thích cho các trang cũ.')[0];
const storage = () => {
    const values = new Map();
    return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const localStorage = storage(), sessionStorage = storage();
const authLocation = { pathname: '/admin.html', hostname: 'store.test', protocol: 'https:', origin: 'https://store.test' };
const authContext = vm.createContext({ localStorage, sessionStorage, location: authLocation, URL, console,
    CustomEvent: class { constructor(name, options) { this.type = name; this.detail = options.detail; } },
    window: { location: authLocation, dispatchEvent() {} },
    document: { querySelector: () => null, createElement: () => ({}), head: { appendChild() {} } } });
vm.runInContext(`${authSource}\n globalThis.testAuth = { me, request, saveSession, clearSession }; })();`, authContext);
const auth = authContext.testAuth;
calls = [];
authContext.fetch = () => { const pending = deferred(); calls.push(pending); return pending.promise; };
auth.saveSession('old-token');
const oldRequest = auth.me();
auth.saveSession('new-token');
const newRequest = auth.me();
calls[0].resolve({ ok: false, status: 401, json: async () => ({ success: false }) });
await oldRequest;
assert.equal(sessionStorage.getItem('badminton_access_token'), 'new-token', 'Old 401 responses must not clear a newer login');
calls[1].resolve({ ok: true, json: async () => ({ user: { username: 'new-user' } }) });
await newRequest;
assert.equal((await auth.me()).username, 'new-user');
const pendingLogout = auth.me(true);
auth.clearSession();
calls[2].resolve({ ok: true, json: async () => ({ user: { username: 'new-user' } }) });
assert.equal(await pendingLogout, null, 'A late profile response cannot restore a logged-out session');
console.log('Auth: delayed 401 and logout/profile races passed.');
