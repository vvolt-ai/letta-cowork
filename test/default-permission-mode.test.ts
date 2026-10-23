import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { useAppStore } from '../src/ui/store/useAppStore';

test('new Cowork preference state defaults to Full access', () => {
  expect(useAppStore.getInitialState().permissionMode).toBe('unrestricted');
});
test('saved user choices hydrate and remain changeable in isolated browser storage', () => {
  // Install fake browser storage before module initialization. The other
  // renderer tests intentionally run without storage, where persist is absent.
  const result = Bun.spawnSync([process.execPath, '--eval', `
    import assert from 'node:assert/strict';
    const values=new Map();
    globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
    const {useAppStore}=await import('./src/ui/store/useAppStore.ts');
    assert.equal(useAppStore.getState().permissionMode,'unrestricted');
    const key=useAppStore.persist.getOptions().name;
    for(const mode of ['standard','acceptEdits','strict','unrestricted']){
      useAppStore.setState({permissionMode:'unrestricted'});
      values.set(key,JSON.stringify({state:{permissionMode:mode},version:0}));
      await useAppStore.persist.rehydrate();
      assert.equal(useAppStore.getState().permissionMode,mode);
    }
    useAppStore.getState().setPermissionMode('strict');
    assert.equal(JSON.parse(values.get(key)).state.permissionMode,'strict');
    console.log('PERMISSION_PREFERENCES_VERIFIED');
  `], { cwd: fileURLToPath(new URL('..', import.meta.url)) });
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain('PERMISSION_PREFERENCES_VERIFIED');
});
