import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = name => readFileSync(new URL(`../css/${name}.js`, import.meta.url), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const nodes = new Map();
function node() {
    return { dataset: {}, style: {}, children: [], attributes: {}, listeners: {}, disabled: false, value: '',
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener(name, callback) { this.listeners[name] = callback; },
        setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; },
        replaceChildren(...children) { this.children = children; }, appendChild(child) { this.children.push(child); },
        append(...children) { this.children.push(...children); }, querySelectorAll() { return []; }, querySelector() { return null; },
        remove() { this.removed = true; } };
}
const get = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
let calls = [];
const Auth = { request() { const call = deferred(); calls.push(call); return call.promise; }, me: async () => null };
const document = { body: { dataset: {} }, addEventListener() {}, getElementById: get, createElement: node,
    querySelector: get, querySelectorAll: () => [] };
const context = vm.createContext({ document, console, Intl, URL, URLSearchParams, Set, matchMedia: () => ({ matches: true }),
    window: { BadmintonAuth: Auth, confirm: () => true, showToast() {} }, showToast() {} });
vm.runInContext(source('wishlist').replace(/\}\)\(\);\s*$/, 'globalThis.wish = { load, removeItem }; })();'), context);
const old = context.wish.load(), latest = context.wish.load();
calls[1].resolve({ products: [] }); await latest;
calls[0].reject(Error('stale failure')); await old;
assert.equal(get('wishlistTitle').textContent, '0 sản phẩm đã lưu');
assert.equal(get('wishlistGrid').attributes['aria-busy'], 'false');
const article = node(), removeButton = node(), soldOutButton = node(); soldOutButton.disabled = true;
article.querySelectorAll = () => [removeButton, soldOutButton];
const removal = context.wish.removeItem(article, 1);
await context.wish.removeItem(article, 1);
await context.wish.load();
assert.equal(calls.length, 3, 'Duplicate removal and refresh must not race the pending deletion');
assert.equal(article.removed, undefined, 'Do not hide a product before server confirmation');
calls[2].reject(Error('network')); await removal;
assert.equal(removeButton.disabled, false);
assert.equal(soldOutButton.disabled, true, 'Failed removal preserves unavailable product controls');

calls = [];
vm.runInContext(source('account').replace('    installPasswordToggles();', '    globalThis.account = { loadOrders, updateOrder };\n    installPasswordToggles();'), context);
const firstOrders = context.account.loadOrders(), nextOrders = context.account.loadOrders();
calls[1].reject(Error('latest failure')); await nextOrders;
calls[0].reject(Error('obsolete failure')); await firstOrders;
assert.equal(get('#orderRows').children.at(-1).children[0].textContent, 'latest failure');
const action = context.account.updateOrder(9, 'cancel');
await context.account.updateOrder(9, 'cancel');
assert.equal(calls.length, 3, 'Only one action per order may run at a time');
calls[2].reject(Error('network')); await action;
const retry = context.account.updateOrder(9, 'cancel');
assert.equal(calls.length, 4, 'Failed order actions can be retried');
calls[3].reject(Error('network')); await retry;
console.log('Customer flows: stale wishlist/order responses, duplicate removal/actions and failure recovery passed.');

const input = node(), form = node(), panel = node();
form.querySelector = selector => selector.includes('searchSuggestions') ? null : input;
form.contains = target => target === input;
let scheduled;
calls = [];
const searchContext = vm.createContext({ console, AbortController, injectSearchSuggestionStyles() {},
    window: { API_BASE: 'https://store.test', clearTimeout() { scheduled = null; }, setTimeout(callback) { scheduled = callback; return 1; } },
    document: { querySelectorAll: () => [form], createElement: () => panel, addEventListener() {} },
    fetch() { const call = deferred(); calls.push(call); return call.promise; } });
const authText = source('auth');
vm.runInContext(authText.slice(authText.indexOf('    function setupSearchSuggestions()'), authText.indexOf('    function searchProduct()')) + '\nsetupSearchSuggestions();', searchContext);
input.value = 'yonex'; input.listeners.input();
const pendingSearch = scheduled();
input.listeners.keydown({ key: 'Escape' });
calls[0].resolve({ ok: true, json: async () => ({ success: true, products: [] }) });
await pendingSearch;
assert.equal(panel.hidden, true, 'Escape must keep suggestions closed when a pending response arrives');
input.value = 'victor'; input.listeners.input();
const clearingSearch = scheduled();
input.value = ''; input.listeners.input();
calls[1].resolve({ ok: true, json: async () => ({ success: true, products: [] }) });
await clearingSearch;
assert.equal(panel.hidden, true, 'Clearing the query invalidates pending suggestions');
console.log('Search: Escape and input clearing invalidate delayed suggestions.');
