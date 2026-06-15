/**
 * 法定繼承計算回歸 — Node 執行：node scripts/test-inheritance-fixtures.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const IC = require(join(__dirname, '..', 'public', 'lib', 'inheritanceCompute.js'));

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// 單一子女存活 — 第一順位
const m1 = {
  decedentId: 'd',
  persons: {
    d: { id: 'd', name: '甲', deathDate: '1140105', birthDate: '', birthOrder: '' },
    c: { id: 'c', name: '乙', deathDate: '', birthDate: '', birthOrder: '' },
  },
  parentEdges: [{ parentId: 'd', childId: 'c' }],
  spousePairs: [],
};
const r1 = IC.computeInheritance(m1);
assert(r1.activeOrder === 1 && r1.byId.c.status === 'heir', 'fixture1 heir');

// 終止收養之養親邊不計入繼承親屬關係
const m2 = {
  decedentId: 'd',
  persons: {
    d: { id: 'd', name: '甲', deathDate: '1140105', birthDate: '', birthOrder: '' },
    x: { id: 'x', name: '丙', deathDate: '', birthDate: '', birthOrder: '' },
  },
  parentEdges: [{ parentId: 'd', childId: 'x', kind: 'adoptive', adoptionTerminated: true }],
  spousePairs: [],
};
const r2 = IC.computeInheritance(m2);
assert(r2.byId.x && r2.byId.x.status !== 'heir', 'fixture2 terminated adoption excludes heir status');

console.log('inheritance fixtures: ok');
