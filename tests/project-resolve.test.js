const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveProjectId } = require('../src/services/projectResolve');

const projects = [
  { id: 'f9260d48-uuid', name: '100T' },
  { id: 'abc-uuid', name: 'Alpha' },
];

describe('resolveProjectId', () => {
  it('用名稱解析成真正的 id', () => {
    assert.equal(resolveProjectId(projects, '100T'), 'f9260d48-uuid');
  });
  it('給 id 直接回該 id', () => {
    assert.equal(resolveProjectId(projects, 'abc-uuid'), 'abc-uuid');
  });
  it('找不到回 null', () => {
    assert.equal(resolveProjectId(projects, 'nope'), null);
  });
});
