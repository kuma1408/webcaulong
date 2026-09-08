import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../chitiet.html', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../css/auth.js', import.meta.url), 'utf8');
const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).filter(source => source.trim()).join('\n');
const aliases = auth.slice(auth.lastIndexOf('const API_BASE ='));

async function scenario(query, response, expected) {
    const nodes = new Map();
    const node = () => ({ textContent: '', disabled: false, append() {}, after() {},
        setAttribute() {}, addEventListener() {}, remove() {} });
    const actions = [node(), node(), node()];
    let requests = 0;
    let rendered = null;
    const context = vm.createContext({
        window: { API_BASE: 'https://shop.test', location: { search: query } },
        document: { addEventListener() {}, createElement: node,
            querySelectorAll: () => actions,
            getElementById(id) {
                if (id === 'productLoadError') return null;
                if (!nodes.has(id)) nodes.set(id, node());
                return nodes.get(id);
            } },
        URLSearchParams, AbortController, setTimeout, clearTimeout, console,
        fetch: async () => { requests++; if (response instanceof Error) throw response; return response; },
        record: (product, reviews) => { rendered = { product, reviews }; }
    });
    // Classic scripts share lexical scope: this catches the original duplicate API_BASE crash.
    vm.runInContext(aliases, context);
    vm.runInContext(inline, context);
    vm.runInContext('populateProductUI = record;', context);
    await vm.runInContext('initProductDetail()', context);
    assert.equal(Boolean(rendered), expected.success);
    assert.equal(requests, expected.requests ?? 1);
    assert.equal(actions[0].disabled, !expected.success);
    if (expected.success) {
        assert.equal(rendered.product.MaSP, 7);
        assert.equal(rendered.reviews.length, 0);
    } else {
        assert.equal(nodes.get('productName').textContent, 'Chưa tải được sản phẩm');
        assert.equal(nodes.get('productPrice').textContent, '—');
    }
}
const ok = { ok: true, status: 200, json: async () => ({ success: true, product: { MaSP: 7, TonKho: 2 }, reviews: [] }) };
await scenario('?id=7', ok, { success: true });
await scenario('?id=bad', ok, { success: false, requests: 0 });
await scenario('', ok, { success: false, requests: 0 });
await scenario('?id=7', { ok: false, status: 404 }, { success: false });
await scenario('?id=8', ok, { success: false });
await scenario('?id=7', new TypeError('Failed to fetch'), { success: false });
const timeout = new Error('timeout'); timeout.name = 'AbortError';
await scenario('?id=7', timeout, { success: false });
console.log('Product detail: 7 loading/error scenarios passed; shared scripts compile together.');
