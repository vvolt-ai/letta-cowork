export async function fetchDesktopRelease(
  baseUrl: string,
  accessToken: string,
  target: { version: string; platform: string; arch: string; osVersion: string },
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const base = new URL(baseUrl);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (base.protocol !== 'https:' &&
      !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))
  )
    throw Error('A secure Vera origin is required for update checks');
  const url = new URL(base.href.replace(/\/+$/, '') + '/desktop-updates/latest');
  for (const [key, value] of Object.entries(target)) url.searchParams.set(key, value);
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok)
      throw Object.assign(new Error('Update check failed'), { status: response.status });
    if (Number(response.headers.get('content-length')) > 32768)
      throw Error('Update response too large');
    if (!response.body) throw Error('Empty update response');
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 32768) throw Error('Update response too large');
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const all = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(all));
  } finally {
    clearTimeout(timer);
  }
}
