/**
 * Minimal .zip reader (stored and deflated entries), with no dependencies,
 * so `npm run update` works on servers without `unzip`.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/**
 * Entries of a zip file: [{ name, dir, mode, size, read() }].
 * @param {string} file
 */
export function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || off === 0xffffffff) throw new Error('ZIP64 archives are not supported');
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== CENTRAL) throw new Error('Damaged zip file (central directory)');
    const method = buf.readUInt16LE(off + 10);
    const compressed = buf.readUInt32LE(off + 20);
    const size = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const external = buf.readUInt32LE(off + 38);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    off += 46 + nameLen + extraLen + commentLen;
    const unixMode = external >>> 16;
    const type = unixMode & 0o170000;
    entries.push({
      name,
      dir: name.endsWith('/') || type === 0o040000,
      link: type === 0o120000,
      mode: unixMode & 0o777,
      size,
      read() {
        if (buf.readUInt32LE(local) !== LOCAL) throw new Error(`Damaged zip file (${name})`);
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const raw = buf.subarray(start, start + compressed);
        if (method === 0) return Buffer.from(raw);
        if (method === 8) return zlib.inflateRawSync(raw);
        throw new Error(`Unsupported compression in ${name}`);
      },
    });
  }
  return entries;
}

/**
 * Extract a zip into `dest` (created). Refuses paths that would land
 * outside it. Symbolic links are skipped.
 * @returns {number} files written
 */
export function extractZip(file, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const root = path.resolve(dest);
  let files = 0;
  for (const entry of readZip(file)) {
    const target = path.resolve(root, entry.name);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`Unsafe path in zip: ${entry.name}`);
    if (entry.link) continue;
    if (entry.dir) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.read(), { mode: entry.mode || 0o644 });
    files += 1;
  }
  return files;
}
