/**
 * Minimal .tar.gz writer and reader (POSIX ustar), with no dependencies.
 *
 * Only what backups need: regular files and folders, names up to 255
 * characters, sizes up to 8 GB. The archives open with any `tar` too
 * (`tar -xzf backup.tar.gz`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';

const BLOCK = 512;

/** Split a path into ustar's name (100) + prefix (155) fields. */
function splitName(name) {
  if (Buffer.byteLength(name) <= 100) return { name, prefix: '' };
  for (let i = name.lastIndexOf('/'); i > 0; i = name.lastIndexOf('/', i - 1)) {
    const prefix = name.slice(0, i);
    const rest = name.slice(i + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(rest) <= 100) return { name: rest, prefix };
  }
  return null; // needs a GNU long-name entry
}

const octal = (n, width) => `${n.toString(8).padStart(width - 1, '0')}\0`;

/** Header block(s) for one entry: a GNU long-name entry first when needed. */
function header(entry) {
  if (splitName(entry.name)) return headerBlock(entry);
  const longName = Buffer.from(`${entry.name}\0`);
  const padLen = (BLOCK - (longName.length % BLOCK)) % BLOCK;
  return Buffer.concat([
    headerBlock({ name: '././@LongLink', size: longName.length, mode: 0o644, mtime: 0, type: 'L' }),
    longName,
    Buffer.alloc(padLen),
    headerBlock({ ...entry, name: entry.name.slice(0, 100), short: true }),
  ]);
}

function headerBlock({ name, size, mode, mtime, type, short }) {
  const buf = Buffer.alloc(BLOCK);
  const parts = short ? { name, prefix: '' } : splitName(name);
  buf.write(parts.name, 0, 100);
  buf.write(octal(mode & 0o7777, 8), 100);
  buf.write(octal(0, 8), 108); // uid
  buf.write(octal(0, 8), 116); // gid
  buf.write(octal(size, 12), 124);
  buf.write(octal(Math.floor(mtime / 1000), 12), 136);
  buf.write('        ', 148); // checksum placeholder (8 spaces)
  buf.write(type, 156);
  buf.write('ustar\0', 257);
  buf.write('00', 263);
  buf.write(parts.prefix, 345, 155);
  let sum = 0;
  for (const byte of buf) sum += byte;
  buf.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return buf;
}

/**
 * Every file and folder under `root` (relative paths, folders first),
 * skipping anything for which `skip(relativePath)` is true.
 */
function walk(root, skip, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (skip(relPath)) continue;
    if (entry.isDirectory()) out.push({ rel: relPath, dir: true }, ...walk(root, skip, relPath));
    else if (entry.isFile()) out.push({ rel: relPath, dir: false });
  }
  return out;
}

/**
 * Write `root`'s contents as a gzipped tarball, every path under `base/`.
 * @param {string} root folder to archive
 * @param {string} file output .tar.gz
 * `extra` adds generated files (e.g. a manifest) at the top of the archive.
 * @param {{ base?: string, skip?: (rel: string) => boolean, mode?: number, extra?: { name: string, data: Buffer | string }[] }} [options]
 * @returns {Promise<{ files: number, bytes: number }>}
 */
export async function createTarGz(root, file, { base = 'data', skip = () => false, mode = 0o600, extra = [] } = {}) {
  const entries = walk(root, skip);
  let files = 0;
  let bytes = 0;
  async function* blocks() {
    yield header({ name: `${base}/`, size: 0, mode: 0o700, mtime: Date.now(), type: '5' });
    for (const item of extra) {
      const data = Buffer.from(item.data);
      yield header({ name: `${base}/${item.name}`, size: data.length, mode: 0o600, mtime: Date.now(), type: '0' });
      yield data;
      const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
      if (pad) yield Buffer.alloc(pad);
    }
    for (const { rel, dir } of entries) {
      const full = path.join(root, rel);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue; // removed while backing up
      }
      if (dir) {
        yield header({ name: `${base}/${rel}/`, size: 0, mode: st.mode, mtime: st.mtimeMs, type: '5' });
        continue;
      }
      // Read the whole file first, so a file that changes size mid-backup
      // can't corrupt the archive. (Data files are small; uploads ≤ 10 MB.)
      let data;
      try {
        data = fs.readFileSync(full);
      } catch {
        continue;
      }
      yield header({ name: `${base}/${rel}`, size: data.length, mode: st.mode, mtime: st.mtimeMs, type: '0' });
      yield data;
      const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
      if (pad) yield Buffer.alloc(pad);
      files += 1;
      bytes += data.length;
    }
    yield Buffer.alloc(BLOCK * 2); // end-of-archive marker
  }
  const tmp = `${file}.partial`;
  try {
    await pipeline(Readable.from(blocks()), zlib.createGzip({ level: 6 }), fs.createWriteStream(tmp, { mode }));
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  return { files, bytes };
}

const readString = (buf, start, len) => {
  const end = buf.indexOf(0, start);
  return buf.toString('utf8', start, end === -1 || end > start + len ? start + len : end);
};

/**
 * List a .tar.gz's entries: [{ name, type: 'file' | 'dir', size, mode, data }].
 * Refuses archives with unsafe paths (absolute, `..`, links).
 * @param {string} file
 */
export function readTarGz(file) {
  const buf = zlib.gunzipSync(fs.readFileSync(file));
  const entries = [];
  let longName = null;
  for (let off = 0; off + BLOCK <= buf.length; ) {
    const head = buf.subarray(off, off + BLOCK);
    if (head.every((b) => b === 0)) break;
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : head[i];
    if (sum !== parseInt(readString(head, 148, 8).trim(), 8)) throw new Error('Not a valid backup archive (checksum mismatch)');
    const size = parseInt(readString(head, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(head[156] || 48);
    const prefix = readString(head, 345, 155);
    let name = longName || (prefix ? `${prefix}/${readString(head, 0, 100)}` : readString(head, 0, 100));
    longName = null;
    const data = buf.subarray(off + BLOCK, off + BLOCK + size);
    off += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    if (type === 'L') {
      longName = data.toString('utf8').replace(/\0+$/, ''); // GNU long name (other tar tools)
      continue;
    }
    if (type === 'x' || type === 'g') continue; // pax headers: ignore
    name = name.replace(/^\.\//, '');
    if (!name || name.startsWith('/') || name.split('/').includes('..')) throw new Error(`Unsafe path in archive: ${name}`);
    if (type === '5') entries.push({ name: name.replace(/\/$/, ''), type: 'dir', size: 0, mode: parseInt(readString(head, 100, 8), 8) || 0o700 });
    else if (type === '0' || type === '\0' || type === '7') entries.push({ name, type: 'file', size, mode: parseInt(readString(head, 100, 8), 8) || 0o600, data });
    else throw new Error(`Unsupported entry in archive (links aren't allowed): ${name}`);
  }
  return entries;
}
