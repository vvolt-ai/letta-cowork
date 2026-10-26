import test from 'node:test';
import assert from 'node:assert/strict';
import {
  redactSecretText,
  SECRET_MARKER,
  isCredentialName,
} from '../dist-electron/services/client-tools/runners/_shared/secret-redaction.js';
import {
  redactRuntimeSecrets,
  runWithRuntimeSecrets,
  getSensitiveEnvValues,
} from '../dist-electron/services/client-tools/runners/_shared/runtime-secrets.js';
const secret = 'synthetic-token-7Xa9Qp';
test('numeric collision regression preserves business fields and valid JSON', () => {
  const raw =
    '{"messageId":"900123456789","quantity":1234,"amount":"1234.50","date":"2026-01-23","credential":"1234"}';
  const result = redactSecretText(raw, ['1', '1234']);
  assert.equal(
    result,
    raw.replace('"credential":"1234"', `"credential":"${SECRET_MARKER}"`),
  );
  assert.equal(JSON.parse(result).quantity, 1234);
});
test('large IDs and raw numeric formatting are lossless', () => {
  const raw =
    ' { "id":9007199254740993123456789, "amount":1.2300, "scale":1e+10, "count":0 } ';
  assert.equal(
    redactSecretText(raw, ['0', '1', '1234', '9007199254740993123456789']),
    raw,
  );
});
test('credential fields redact even short/numeric or newly returned secrets, not metrics', () => {
  const value = JSON.parse(
    redactSecretText(
      '{"password":1234,"accessToken":"1234","headers":{"Authorization":"Bearer new-value"},"token_count":1234,"tokenType":"Bearer"}',
      [],
    ),
  );
  assert.equal(value.password, SECRET_MARKER);
  assert.equal(value.accessToken, SECRET_MARKER);
  assert.equal(value.headers.Authorization, SECRET_MARKER);
  assert.equal(value.token_count, 1234);
  assert.equal(value.tokenType, 'Bearer');
  assert.equal(
    redactSecretText(
      'credential=1234 password is 1234 Authorization: Bearer new-token',
      ['1234'],
    ),
    `credential=${SECRET_MARKER} password is ${SECRET_MARKER} Authorization: ${SECRET_MARKER}`,
  );
});
test('full long secret tokens, including ID/ref-shaped values, are still masked', () => {
  assert.equal(
    redactSecretText(`path/${secret}/suffix`, [secret]),
    `path/${SECRET_MARKER}/suffix`,
  );
  assert.equal(
    redactSecretText(
      JSON.stringify({ messageId: secret, notes: `prefix ${secret} suffix` }),
      [secret],
    ),
    JSON.stringify({
      messageId: SECRET_MARKER,
      notes: `prefix ${SECRET_MARKER} suffix`,
    }),
  );
});
test('nested serialized MCP JSON preserves big IDs while redacting escaped credential strings', () => {
  const inner = String.raw`{"id":90071992547409931234,"password":1234,"access_token":"synthetic\u002dtoken-7Xa9Qp"}`;
  const result = JSON.parse(
    redactSecretText(
      JSON.stringify({ content: [{ type: 'text', text: inner }] }),
      ['1234', secret],
    ),
  );
  assert.equal(
    result.content[0].text,
    `{"id":90071992547409931234,"password":"${SECRET_MARKER}","access_token":"${SECRET_MARKER}"}`,
  );
});
test('redaction is literal and idempotent for overlapping marker-like secrets', () => {
  const value = 'fixture.$&+key[123]',
    result = redactSecretText(`${SECRET_MARKER} ${value}`, [
      value,
      'REDACTED_SECRET',
    ]);
  assert.equal(result, `${SECRET_MARKER} ${SECRET_MARKER}`);
  assert.equal(redactSecretText(result, [value, 'REDACTED_SECRET']), result);
});
test('configuration and tool-schema descriptions survive without exposing credential defaults', () => {
  assert.equal(isCredentialName('TOKEN_TTL'), false);
  assert.equal(isCredentialName('tokenCount'), false);
  assert.equal(isCredentialName('x-api-key'), true);
  assert.deepEqual(
    getSensitiveEnvValues({
      TOKEN_TTL: '3600',
      TOKEN_VERSION: '1',
      API_KEY: 'fixture-key-value',
    }),
    ['fixture-key-value'],
  );
  const value = JSON.parse(
    redactSecretText(
      '{"properties":{"api_key":{"type":"string","description":"required API key","default":"1234"}},"enabled":true,"quantity":1}',
      ['true', '1'],
    ),
  );
  assert.equal(value.properties.api_key.type, 'string');
  assert.equal(value.properties.api_key.default, SECRET_MARKER);
  assert.equal(value.enabled, true);
  assert.equal(value.quantity, 1);
});
test('secret descriptors and env namespaces stay protected; business IDs are not secrets', () => {
  const value = JSON.parse(
    redactSecretText(
      '{"name":"PASSWORD","value":"1234","env":{"BANK_CODE":"1234"},"orderId":"1234"}',
      ['1234'],
    ),
  );
  assert.equal(value.value, SECRET_MARKER);
  assert.equal(value.env.BANK_CODE, SECRET_MARKER);
  assert.equal(value.orderId, '1234');
  assert.equal(redactSecretText('1234', ['1234']), '1234');
});
test('desktop wrapper preserves async scoped secrets and ordinary numbers', async () => {
  await runWithRuntimeSecrets(['1234', secret], async () => {
    assert.equal(
      redactRuntimeSecrets(
        '{"id":"991234567890","password":"1234","value":"' + secret + '"}',
      ),
      '{"id":"991234567890","password":"' +
        SECRET_MARKER +
        '","value":"' +
        SECRET_MARKER +
        '"}',
    );
  });
});
test('timestamp/config/secret-name metadata remain readable while secret records are protected', () => {
  const timestamp = '2026-10-25T07:00:00Z';
  assert.equal(
    redactSecretText(JSON.stringify({ receivedAt: timestamp }), [timestamp]),
    JSON.stringify({ receivedAt: timestamp }),
  );
  assert.equal(isCredentialName('TOKEN_EXPIRES_AT'), false);
  assert.equal(isCredentialName('secretName'), false);
  const record = JSON.parse(
    redactSecretText('{"secret_name":"BANK_CODE","value":"1234"}', ['1234']),
  );
  assert.equal(record.secret_name, 'BANK_CODE');
  assert.equal(record.value, SECRET_MARKER);
});
test('typed credential records cannot masquerade as tool-schema metadata', () => {
  const record = JSON.parse(
    redactSecretText(
      '{"credentials":{"type":"string","description":"value holder","value":"1234"}}',
      ['1234'],
    ),
  );
  assert.equal(record.credentials.value, SECRET_MARKER);
});
test('unlabelled scalar measurements and config values stay lossless even when candidates collide', () => {
  for (const raw of [
    '4242',
    '4242\n',
    '"4242"',
    'true',
    '"true"',
    '"2026-10-26T00:00:00Z"',
  ])
    assert.equal(
      redactSecretText(raw, ['4242', 'true', '2026-10-26T00:00:00Z']),
      raw,
    );
  assert.equal(
    redactSecretText('suppression from 1 to 4242 MHz', ['4242']),
    'suppression from 1 to 4242 MHz',
  );
});
test('source identifiers and expressions are not credential assignments', () => {
  for (const raw of [
    'const runtimeSecretStorage = new AsyncLocalStorage();',
    'return known ? SECRET_MARKER : plain(input);',
    'export const apiToken = createToken();',
    'type Token = string;',
    'function accept(apiToken: string) {}',
    'const options = {apiToken: createToken()};',
  ])
    assert.equal(redactSecretText(raw, []), raw);
});
test('real labelled credentials and literal credentials in source still mask short values', () => {
  for (const raw of [
    'password=4242',
    'GITHUB_TOKEN=short',
    'client_secret: short',
    'const password = "4242";',
    'const token = "x";',
    'Authorization: Bearer 4242',
  ])
    assert.ok(redactSecretText(raw, []).includes(SECRET_MARKER));
});
test('non-secret prose and empty output stay intact', () => {
  assert.equal(redactSecretText('', []), '');
  assert.equal(
    redactSecretText('password is required; quantity 1234; date 2026-01-23', [
      '1',
      '1234',
    ]),
    'password is required; quantity 1234; date 2026-01-23',
  );
});
