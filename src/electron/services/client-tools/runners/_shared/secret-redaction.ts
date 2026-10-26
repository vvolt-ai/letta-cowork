import { parseTree, type Node, type ParseError } from 'jsonc-parser';

export const SECRET_MARKER = '[REDACTED_SECRET]';
const CREDENTIAL_KEY =
  /(?:^|_)(?:TOKENS?|SECRETS?|PASSWORD|PASSCODE|PIN|OTP|PAT|CREDENTIALS?|API_KEY|APIKEY|PRIVATE_KEY|COOKIE|AUTHORIZATION)(?:_|$)/i;
const CONFIG_SUFFIX =
  /(?:^|_)(?:COUNT|COUNTS|USAGE|LENGTH|SIZE|TTL|TIMEOUT|VERSION|ENABLED|PRESENT|TYPE|COST|LIMIT|EXPIRES_IN|EXPIRY|EXPIRATION|NAME|LABEL|DESCRIPTION|HINT|(?:EXPIRES?|EXPIRY|EXPIRATION|ISSUED|CREATED|UPDATED|ROTATED)_AT)$/i;
function normalizedKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[-.\s]+/g, '_');
}
/** Names identify credential context, not every setting containing 'TOKEN'. */
export function isCredentialName(key: string): boolean {
  const name = normalizedKey(key);
  return !CONFIG_SUFFIX.test(name) && CREDENTIAL_KEY.test(name);
}
/** Text labels must end in a credential role, not merely contain Secret/Token.
 * Structured JSON/env records retain their stronger context below. */
function isPlainCredentialName(key: string): boolean {
  const name = normalizedKey(key.split('.').at(-1) ?? key);
  return (
    isCredentialName(name) &&
    /(?:^|_)(?:TOKENS?|SECRETS?|PASSWORD|PASSCODE|PIN|OTP|PAT|CREDENTIALS?|API_KEY|APIKEY|PRIVATE_KEY|COOKIE|AUTHORIZATION)(?:_(?:VALUE|DATA|KEY))?$/i.test(
      name,
    )
  );
}
function globalCandidate(value: string): boolean {
  // Numeric/short/config values are ambiguous without credential context. They
  // must not become search-and-replace rules for IDs, quantities or timestamps.
  return (
    value.length >= 8 &&
    value.trim().length > 0 &&
    !/^[\d\s.,:/+_-]+$/.test(value) &&
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) &&
    !/^(?:true|false|null|undefined|none|yes|no|on|off)$/i.test(value) &&
    !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/i.test(
      value,
    )
  );
}
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const SCHEMA_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
]);
function entries(node: Node): Array<[string, Node, Node]> {
  return (node.children ?? []).flatMap((property) => {
    const [key, value] = property.children ?? [];
    return key?.type === 'string' && value
      ? [[String(key.value), key, value] as [string, Node, Node]]
      : [];
  });
}

/** Lossless JSON redaction: never stringify parsed numeric values. Only changed
 * scalar token ranges are replaced, preserving large IDs and number lexemes.
 * Opaque IDs are NOT exempt: a complete distinctive secret still redacts.
 * Low-information values redact in credential contexts, not arbitrary fields;
 * unlabelled weak/numeric scalars remain data rather than guessed credentials. */
export function redactSecretText(
  text: string,
  values: readonly string[],
): string {
  if (!text) return text;
  const known = new Set(values.filter((value) => value.length > 0));
  const global = [...known]
    .filter(globalCandidate)
    .sort((a, b) => b.length - a.length);
  const pattern = global.length
    ? new RegExp(
        [escapeRegExp(SECRET_MARKER), ...global.map(escapeRegExp)].join('|'),
        'g',
      )
    : null;
  const replaceGlobal = (value: string) =>
    pattern ? value.replace(pattern, () => SECRET_MARKER) : value;
  const jsonScalar = String.raw`(?:"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)`;
  const jsonAssignment = new RegExp(
    String.raw`("(?:\\.|[^"\\])*")(\s*:\s*)(${jsonScalar})`,
    'g',
  );
  const assignment =
    /(^|[^\w])([A-Za-z_][\w.-]*)([ \t]*(?:=|:)[ \t]*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&<>{}"']+)/g;
  function plain(value: string): string {
    let result = replaceGlobal(value).replace(
      /\b((?:proxy-)?authorization[ \t]*:[ \t]*)(?:bearer|basic)[ \t]+[^\s,"'<>]+/gi,
      (_, prefix) => prefix + SECRET_MARKER,
    );
    result = result.replace(
      /\b(Bearer|Basic)[ \t]+([A-Za-z0-9._~+\/=-]+)/g,
      (all, scheme, token) =>
        known.has(token) ? scheme + ' ' + SECRET_MARKER : all,
    );
    result = result.replace(jsonAssignment, (all, key, separator, raw) => {
      try {
        return isPlainCredentialName(JSON.parse(key)) &&
          raw !== 'null' &&
          raw !== '""'
          ? key + separator + JSON.stringify(SECRET_MARKER)
          : all;
      } catch {
        return all;
      }
    });
    result = result.replace(
      assignment,
      (all, prefix, key, separator, raw, offset) => {
        if (!isPlainCredentialName(key) || raw === SECRET_MARKER) return all;
        const leading = result
          .slice(result.lastIndexOf('\n', offset) + 1, offset)
          .trimEnd();
        const declaration =
          /^\s*(?:(?:export|declare|async)\s+)*(?:const|let|var|type|function|interface|class|return)\b/.test(
            leading,
          );
        const literal =
          /^["']/.test(raw) ||
          /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw);
        // Preserve factory calls/types/identifiers, but never literal credentials.
        if (declaration && !literal) return all;
        return prefix + key + separator + SECRET_MARKER;
      },
    );
    // A natural-language credential label only redacts a known value, avoiding
    // changing prose such as 'password is required'.
    result = result.replace(
      /\b(password|passcode|pin|otp|token|secret)\s+(is|was)\s+([^\s,;]+)/gi,
      (all, key, verb, raw) =>
        known.has(raw) ? `${key} ${verb} ${SECRET_MARKER}` : all,
    );
    return replaceGlobal(result);
  }
  function redact(input: string, nested = 0): string {
    if (input === SECRET_MARKER) return input;
    const errors: ParseError[] = [];
    let tree: Node | undefined;
    try {
      tree = parseTree(input, errors, {
        disallowComments: true,
        allowTrailingComma: false,
      });
    } catch {
      // Fail closed for parser exhaustion, rather than emitting a partially
      // sanitized deep document or executing any untrusted content.
      return JSON.stringify(SECRET_MARKER);
    }
    if (!tree || errors.length) {
      return plain(input);
    }
    const edits: Array<{ start: number; end: number; text: string }> = [];
    function edit(node: Node, replacement: string) {
      if (input.slice(node.offset, node.offset + node.length) !== replacement)
        edits.push({
          start: node.offset,
          end: node.offset + node.length,
          text: replacement,
        });
    }
    function walk(
      node: Node,
      sensitive = false,
      environment = false,
      depth = 0,
    ): void {
      if (depth > 100) {
        edit(node, JSON.stringify(SECRET_MARKER));
        return;
      }
      if (node.type === 'object') {
        const fields = entries(node);
        const descriptor = fields.some(
          ([key, , value]) =>
            ['name', 'key', 'env_name', 'secret_name'].includes(
              normalizedKey(key).toLowerCase(),
            ) &&
            value.type === 'string' &&
            (normalizedKey(key).toLowerCase() === 'secret_name' ||
              isCredentialName(String(value.value))),
        );
        const schema =
          fields.some(
            ([key, , value]) =>
              key === 'type' &&
              value.type === 'string' &&
              SCHEMA_TYPES.has(String(value.value)),
          ) &&
          fields.some(([key]) =>
            [
              'description',
              'properties',
              'items',
              'enum',
              'default',
              'const',
              'examples',
              'required',
              'format',
              'additionalProperties',
            ].includes(key),
          ) &&
          !fields.some(([key]) => key === 'value');
        for (const [key, keyNode, value] of fields) {
          const safeKey = replaceGlobal(key);
          if (safeKey !== key) edit(keyNode, JSON.stringify(safeKey));
          const childSensitive =
            isCredentialName(key) ||
            (descriptor && key === 'value') ||
            (sensitive &&
              (!schema ||
                ['default', 'const', 'enum', 'examples'].includes(key)));
          walk(
            value,
            childSensitive,
            environment ||
              ['env', 'environment_variables'].includes(
                normalizedKey(key).toLowerCase(),
              ),
            depth + 1,
          );
        }
      } else if (node.type === 'array') {
        for (const child of node.children ?? [])
          walk(child, sensitive, environment, depth + 1);
      } else if (node.type === 'string') {
        const value = String(node.value);
        if (value === SECRET_MARKER) return;
        if ((sensitive && value !== '') || (environment && known.has(value))) {
          edit(node, JSON.stringify(SECRET_MARKER));
          return;
        }
        const trimmed = value.trim();
        const embedded = trimmed.startsWith('{') || trimmed.startsWith('[');
        const result = embedded
          ? nested < 6
            ? redact(value, nested + 1)
            : SECRET_MARKER
          : plain(value);
        if (result !== value) edit(node, JSON.stringify(result));
      } else if (node.type !== 'null') {
        const raw = input.slice(node.offset, node.offset + node.length);
        if (sensitive || (environment && known.has(raw)))
          edit(node, JSON.stringify(SECRET_MARKER));
      }
    }
    walk(tree);
    let result = input;
    for (const change of edits.sort((a, b) => b.start - a.start))
      result =
        result.slice(0, change.start) + change.text + result.slice(change.end);
    return result;
  }
  return redact(text);
}
