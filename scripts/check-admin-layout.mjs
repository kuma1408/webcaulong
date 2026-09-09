import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../admin.html', import.meta.url), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(<(?:script|style)\b[^>]*>)[\s\S]*?(<\/(?:script|style)>)/gi, '$1$2');
const voids = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const stack = [];
const panels = [];
const ids = new Set();
for (const match of html.matchAll(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi)) {
    const tag = match[1].toLowerCase();
    const token = match[0];
    const line = html.slice(0, match.index).split('\n').length;
    if (token.startsWith('</')) {
        const opened = stack.pop();
        assert.equal(opened?.tag, tag, `Unbalanced </${tag}> at line ${line}; open tag: ${opened?.tag}`);
        continue;
    }
    const id = token.match(/\bid="([^"]+)"/)?.[1];
    if (id) { assert.ok(!ids.has(id), `Duplicate id: ${id}`); ids.add(id); }
    const panel = token.match(/data-admin-panel="([^"]+)"/)?.[1];
    if (panel) {
        assert.ok(stack.at(-1)?.token.includes('class="admin-workspace"'), `${panel} must be directly inside workspace`);
        panels.push(panel);
    }
    if (['adminCategoryDonut', 'adminTopProductsList', 'adminStatusDonut'].includes(id)) {
        assert.ok(stack.some(item => item.token.includes('data-admin-panel="overview"')), `${id} escaped overview`);
    }
    if (!voids.has(tag) && !token.endsWith('/>')) stack.push({ tag, token });
}
assert.equal(stack.length, 0, 'Unclosed HTML elements');
assert.equal(panels.length, 10, 'All 10 admin panels must remain in workspace');
console.log('Admin layout: balanced HTML, unique IDs, 10 panels and overview charts correctly nested.');
