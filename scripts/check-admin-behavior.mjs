import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../css/admin.js', import.meta.url), 'utf8');
const nodes = new Map();
function node() { return { hidden: true, value: '', textContent: '', innerHTML: '', children: [],
    appendChild(child) { this.children.push(child); }, setAttribute() {} }; }
const document = { querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); }, createElement: node };
const context = vm.createContext({ document, URLSearchParams, console: { warn() {} }, showToast() {},
    window: { BadmintonAuth: { requireAdmin: async () => null, request: async () => { throw Error('offline'); } } } });
vm.runInContext(source.replace(/    init\(\);\s*\}\)\(\);\s*$/, 'globalThis.testAdmin = { init, state, loadProducts, loadOrders, loadUsers, loadDeposits, loadSupport, loadContent, loadVouchers, loadAudit, loadApprovals }; })();'), context);
const admin = context.testAdmin;
await admin.init();
assert.equal(admin.state.admin, null, 'Authentication failure must not fabricate an admin');
assert.match(nodes.get('#adminLoading').textContent, /Không xác thực/);
for (const [fn, field, table] of [['loadProducts','products','productRows'], ['loadOrders','orders','adminOrderRows'],
    ['loadUsers','users','userRows'], ['loadDeposits','deposits','depositAdminRows'], ['loadSupport','support','supportRows'],
    ['loadContent','content','contentRows'], ['loadVouchers','vouchers','voucherRows']]) {
    await admin[fn]();
    assert.equal(admin.state[field].length, 0, `${field} must not contain fake records after API failure`);
    const rows = nodes.get('#' + table).children;
    assert.match(rows.at(-1).children[0].textContent, /Không tải được/);
}
console.log('Admin: authentication and 7 API failure scenarios passed.');
