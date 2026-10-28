import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../css/admin.js', import.meta.url), 'utf8');
const markup = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
for (const control of ['productSort', 'contentSort']) {
    assert.match(markup, new RegExp(`id="${control}"`), `${control} must exist in the admin toolbar`);
    assert.ok(source.includes(`#${control}`), `${control} must be wired into admin behavior`);
}
assert.match(source, /quick_filter:\s*state\.productQuickFilter/,
    'Quick product filters must be sent to the paginated API, not applied only to the current page');
assert.match(source, /sort:\s*\$\('#productSort'\)\.value/,
    'Product sort selection must reach the admin API');
assert.match(source, /sort:\$\('#contentSort'\)\.value/,
    'News and guide sort selection must reach the admin API');
const nodes = new Map();
function node() { return { hidden: true, value: '', textContent: '', innerHTML: '', children: [], style: {}, parentElement: {},
    appendChild(child) { this.children.push(child); }, setAttribute() {} }; }
const document = { querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); }, createElement: node };
const context = vm.createContext({ document, URLSearchParams, setTimeout: fn => fn(), console: { warn() {} }, showToast() {},
    window: { matchMedia: () => ({ matches: true }), BadmintonAuth: { requireAdmin: async () => null, request: async () => { throw Error('offline'); } } } });
vm.runInContext(source.replace(/    init\(\);\s*\}\)\(\);\s*$/, 'globalThis.testAdmin = { renderFunnel, init, state, loadProducts, loadOrders, loadUsers, loadDeposits, loadSupport, loadContent, loadVouchers, loadAudit, loadApprovals, loadSupplementalEvidence }; })();'), context);
const admin = context.testAdmin;
await admin.init();
assert.equal(admin.state.admin, null, 'Authentication failure must not fabricate an admin');
assert.match(nodes.get('#adminLoading').textContent, /Không xác thực/);
await admin.loadSupplementalEvidence();
assert.match(nodes.get('#supplementEvidenceRows').children.at(-1).children[0].textContent, /Không tải được/,
    'Supplemental evidence requests must show an API error instead of fabricated requests');
for (const [fn, field, table] of [['loadProducts','products','productRows'], ['loadOrders','orders','adminOrderRows'],
    ['loadUsers','users','userRows'], ['loadDeposits','deposits','depositAdminRows'], ['loadSupport','support','supportRows'],
    ['loadContent','content','contentRows'], ['loadVouchers','vouchers','voucherRows']]) {
    await admin[fn]();
    assert.equal(admin.state[field].length, 0, `${field} must not contain fake records after API failure`);
    const rows = nodes.get('#' + table).children;
    assert.match(rows.at(-1).children[0].textContent, /Không tải được/);
}
console.log('Admin: authentication and 7 API failure scenarios passed.');
admin.renderFunnel({ registered_users: 0, users_with_cart: 0, buyers_30d: 0, completed_orders_30d: 0 });
assert.equal(nodes.get('#funnelUsers').textContent, '0', 'Zero accounts must not become sample analytics');
assert.equal(nodes.get('#funnelConvRate').textContent, '0.0%');
admin.renderFunnel({ registered_users: 10, users_with_cart: 3, buyers_30d: 2, completed_orders_30d: 6 });
assert.equal(nodes.get('#funnelConvRate').textContent, '20.0%', 'Conversion uses distinct buyers, not order count');
assert.equal(nodes.get('#funnelCompletedSub').textContent, '3.0 đơn hoàn tất / khách đã mua');
console.log('Admin: zero-data analytics and multiple-orders-per-customer calculations passed.');
