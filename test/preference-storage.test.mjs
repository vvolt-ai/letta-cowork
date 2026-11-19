import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreferenceStorage } from '../src/ui/store/preferenceStorage.ts';

function fixture() {
  const values = new Map();
  const writes = [];
  let fail = false;
  const storage = createPreferenceStorage(() => ({
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      if (fail) throw new Error('quota');
      writes.push([key, value]);
      values.set(key, value);
    },
    removeItem: key => values.delete(key),
  }));
  return { storage, values, writes, setFail: value => { fail = value; } };
}

test('unchanged preferences never rewrite storage during typing/streaming', () => {
  const {storage, writes} = fixture();
  storage.setItem('preferences', 'original');
  for (let i = 0; i < 1000; i++) storage.setItem('preferences', 'original');
  assert.equal(writes.length, 1);
  storage.setItem('preferences', 'changed');
  assert.equal(writes.length, 2);
});

test('hydrated preferences are deduplicated and removal invalidates cache', () => {
  const {storage, values, writes} = fixture();
  values.set('preferences', 'saved');
  assert.equal(storage.getItem('preferences'), 'saved');
  storage.setItem('preferences', 'saved');
  assert.equal(writes.length, 0);
  storage.removeItem('preferences');
  storage.setItem('preferences', 'saved');
  assert.equal(writes.length, 1);
  assert.equal(values.get('preferences'), 'saved');
});

test('failed writes are not cached and can be retried', () => {
  const {storage, writes, setFail} = fixture();
  setFail(true);
  assert.throws(() => storage.setItem('preferences', 'new'), /quota/);
  setFail(false);
  storage.setItem('preferences', 'new');
  assert.equal(writes.length, 1);
});
