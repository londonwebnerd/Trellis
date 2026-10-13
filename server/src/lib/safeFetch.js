/**
 * Outbound HTTP for live feeds, hardened against SSRF.
 *
 * Feeds are fetched from addresses that come (indirectly) from the page:
 * a Mastodon handle names any server, blog feeds may redirect. Without care,
 * someone with editor access could point a card at the server's own network
 * (127.0.0.1, 10.x, cloud metadata at 169.254.169.254…). This helper:
 *
 *   - only speaks https,
 *   - resolves the host itself and refuses private, loopback, link-local,
 *     multicast and other non-public addresses, and connects to exactly the
 *     address it checked (no DNS-rebinding window),
 *   - follows at most a few redirects, re-checking every hop,
 *   - caps the response size and the total time.
 */
import dns from 'node:dns';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';

/** Address ranges that must never be reached from a feed request. */
const BLOCKED = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (cloud metadata)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
]) {
  BLOCKED.addSubnet(addr, prefix, 'ipv4');
}
for (const [addr, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['::', 96], // deprecated IPv4-compatible (::a.b.c.d)
  ['64:ff9b::', 96], // NAT64
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['2001::', 32], // Teredo (can tunnel to any IPv4 address)
  ['2002::', 16], // 6to4 (embeds an IPv4 address, private ones included)
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
]) {
  BLOCKED.addSubnet(addr, prefix, 'ipv6');
}

/**
 * True if an IP address is on the public internet. (IPv4-mapped IPv6
 * addresses are unwrapped and checked as IPv4: a ::ffff:0:0/96 rule in the
 * BlockList would also match every plain IPv4 address.)
 */
export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return !BLOCKED.check(address, 'ipv4');
  if (family === 6) {
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return isPublicAddress(mapped[1]);
    return !BLOCKED.check(address, 'ipv6');
  }
  return false;
}

/** dns.lookup replacement that only ever returns public addresses. */
function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const allowed = addresses.filter((a) => isPublicAddress(a.address));
    if (!allowed.length) {
      return callback(Object.assign(new Error(`Refusing to connect to a private address for ${hostname}`), { code: 'EBLOCKED' }));
    }
    if (options?.all) return callback(null, allowed);
    return callback(null, allowed[0].address, allowed[0].family);
  });
}

function decoder(encoding) {
  switch ((encoding || '').toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return zlib.createGunzip();
    case 'deflate':
      return zlib.createInflate();
    case 'br':
      return zlib.createBrotliDecompress();
    default:
      return null;
  }
}

/** One request, no redirects. Resolves { status, headers, body } (body capped). */
function requestOnce(url, { method = 'GET', body, headers, maxBytes, signal }) {
  return new Promise((resolve, reject) => {
    const allHeaders = { 'Accept-Encoding': 'gzip, deflate, br', ...headers };
    if (body !== undefined) allHeaders['Content-Length'] = Buffer.byteLength(body);
    const req = https.request(url, { method, headers: allHeaders, lookup: publicLookup, signal }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400) {
        res.resume();
        return resolve({ status, headers: res.headers, body: '' });
      }
      const declared = Number(res.headers['content-length']);
      if (declared && declared > maxBytes) {
        res.destroy();
        return reject(new Error(`Response from ${url.host} is too large`));
      }
      const unzip = decoder(res.headers['content-encoding']);
      const stream = unzip ? res.pipe(unzip) : res;
      const chunks = [];
      let size = 0;
      stream.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          stream.destroy();
          res.destroy();
          reject(new Error(`Response from ${url.host} is too large`));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.end(body);
  });
}

/**
 * Request an https URL safely (GET by default). Requests with a body
 * (`method: 'POST'`, newsletter sign-ups) never follow redirects.
 * @param {string} input
 * @param {{ method?: string, body?: string, headers?: Record<string,string>, timeoutMs?: number, maxBytes?: number, maxRedirects?: number }} [options]
 * @returns {Promise<{ status: number, ok: boolean, url: string, body: string }>}
 */
export async function safeFetch(input, { method = 'GET', body, headers = {}, timeoutMs = 8000, maxBytes = 2_000_000, maxRedirects = 3 } = {}) {
  if (body !== undefined) maxRedirects = 0;
  const signal = AbortSignal.timeout(timeoutMs);
  let url = new URL(input);
  for (let hop = 0; ; hop += 1) {
    if (url.protocol !== 'https:') throw new Error('Only https feeds are allowed');
    if (url.username || url.password) throw new Error('URLs with credentials are not allowed');
    if (url.port && url.port !== '443') throw new Error('Only the standard https port is allowed');
    // IP literals never go through the DNS lookup, so check them here.
    const literal = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(literal) && !isPublicAddress(literal)) throw new Error(`Refusing to connect to a private address (${literal})`);
    const res = await requestOnce(url, { method, body, headers, maxBytes, signal });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      if (hop >= maxRedirects) throw new Error(`Too many redirects from ${url.host}`);
      url = new URL(res.headers.location, url);
      continue;
    }
    return { status: res.status, ok: res.status >= 200 && res.status < 300, url: url.href, body: res.body };
  }
}

/** GET JSON safely; throws on non-2xx or invalid JSON. */
export async function safeFetchJson(url, options = {}) {
  const res = await safeFetch(url, { ...options, headers: { Accept: 'application/json', ...options.headers } });
  if (!res.ok) throw new Error(`Upstream ${res.status} for ${new URL(url).host}`);
  try {
    return JSON.parse(res.body);
  } catch {
    throw new Error(`Invalid JSON from ${new URL(url).host}`);
  }
}
