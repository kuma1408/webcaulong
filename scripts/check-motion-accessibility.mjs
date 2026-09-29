import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const universal = await readFile(new URL("../css/universal-animations.css", import.meta.url), "utf8");
const adminPolish = await readFile(new URL("../css/admin-polish.css", import.meta.url), "utf8");

assert.match(universal, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/,
  "Hover-only quick actions must only apply to pointer devices.");
assert.match(universal, /@media\s*\(hover:\s*none\),\s*\(pointer:\s*coarse\)[\s\S]*?\.product-card__actions[\s\S]*?opacity:\s*1/,
  "Touch users must see product actions without hovering.");
assert.doesNotMatch(universal, /\[class\*="price"\][^{]*\{[^}]*display:\s*inline-block/i,
  "Generic price selectors must not alter display/layout.");
assert.match(universal, /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
  "Shared motion must respect reduced-motion preferences.");
assert.match(universal, /:focus-visible\s*\{[^}]*outline:/,
  "Shared icon controls need a visible keyboard focus state.");
assert.match(adminPolish, /\.admin-body \.health-icon[\s\S]*?border-radius:/,
  "Admin status icons should use the shared icon-chip treatment.");

console.log("Motion/accessibility: touch actions, reduced motion, focus and admin icon polish passed.");
