/**
 * Remove private metadata from uploaded images, without re-encoding them.
 *
 * Photos straight from a phone carry EXIF data: GPS coordinates of where the
 * picture was taken, the device, the date, sometimes the owner's name. Once
 * an image is on a public page anyone can download it and read that. This
 * module drops those blocks:
 *
 *   JPEG  APP1 (EXIF, XMP), APP13 (Photoshop/IPTC), comment segments and
 *         the multi-picture index (APP2 "MPF"). Anything after the main
 *         image's end marker is dropped too: some cameras append extra
 *         images there (depth maps, previews), each with its own EXIF.
 *         The orientation flag is kept (as a tiny new EXIF block), so
 *         portrait photos don't turn sideways.
 *   PNG   eXIf, tEXt, zTXt, iTXt and tIME chunks (a missing IEND is added).
 *   WebP  EXIF and XMP chunks (and their flags in the VP8X header).
 *
 * Colour profiles (JPEG APP2 / PNG iCCP) are kept so colours stay correct.
 * GIF, AVIF and ICO files are stored unchanged (GIF has no location data;
 * AVIF metadata stripping would need a full ISO-BMFF parser).
 * If a file can't be parsed it is returned unchanged.
 */

/* -------------------------------- JPEG -------------------------------- */

/** Read the EXIF orientation (1–8) from an APP1 payload, or 1. */
function exifOrientation(app1) {
  if (app1.length < 14 || app1.toString('latin1', 0, 6) !== 'Exif\0\0') return 1;
  const tiff = app1.subarray(6);
  const le = tiff.toString('latin1', 0, 2) === 'II';
  const u16 = (o) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  try {
    const ifd = u32(4);
    const count = u16(ifd);
    for (let i = 0; i < count; i += 1) {
      const entry = ifd + 2 + i * 12;
      if (u16(entry) === 0x0112) {
        const value = u16(entry + 8);
        return value >= 1 && value <= 8 ? value : 1;
      }
    }
  } catch {
    /* malformed: treat as upright */
  }
  return 1;
}

/** A minimal APP1 segment containing only the orientation tag. */
function orientationSegment(orientation) {
  const tiff = Buffer.alloc(26);
  tiff.write('MM', 0, 'latin1');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4); // IFD0 offset
  tiff.writeUInt16BE(1, 8); // one entry
  tiff.writeUInt16BE(0x0112, 10); // Orientation
  tiff.writeUInt16BE(3, 12); // SHORT
  tiff.writeUInt32BE(1, 14); // count
  tiff.writeUInt16BE(orientation, 18); // value (left-justified)
  tiff.writeUInt32BE(0, 22); // no next IFD
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

/**
 * Offset just past the main image's EOI marker (FF D9), scanning from the
 * first SOS. Inside compressed data a real 0xFF byte is written as FF 00 and
 * restart markers are FF D0–D7, so the first other "FF D9" is the end.
 * Returns buf.length if there's no end marker (truncated file).
 */
function endOfImage(buf, from) {
  for (let i = from + 2; i < buf.length - 1; i += 1) {
    if (buf[i] !== 0xff) continue;
    const next = buf[i + 1];
    if (next === 0xd9) return i + 2;
  }
  return buf.length;
}

function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)]; // SOI
  let orientation = 1;
  let pos = 2;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) return buf; // not where a marker should be: give up
    const marker = buf[pos + 1];
    if (marker === 0xff) {
      pos += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(buf.subarray(pos, pos + 2)); // markers without a length
      pos += 2;
      continue;
    }
    const length = buf.readUInt16BE(pos + 2);
    if (length < 2 || pos + 2 + length > buf.length) return buf;
    const segment = buf.subarray(pos, pos + 2 + length);
    if (marker === 0xda) {
      // Start of scan: copy the compressed image (and any further scans of a
      // progressive JPEG) up to the main image's end marker, and drop
      // whatever follows it.
      if (orientation !== 1) out.splice(1, 0, orientationSegment(orientation));
      out.push(buf.subarray(pos, endOfImage(buf, pos)));
      return Buffer.concat(out);
    }
    if (marker === 0xe1) {
      const found = exifOrientation(segment.subarray(4));
      if (found !== 1) orientation = found; // dropped, but remember the rotation
    } else if (marker === 0xe2 && segment.toString('latin1', 4, 8) === 'MPF\0') {
      // Multi-picture index: points at the appended images we drop.
    } else if (marker !== 0xed && marker !== 0xfe) {
      out.push(segment); // keep everything else (tables, colour profile, frame header…)
    }
    pos += 2 + length;
  }
  return buf;
}

/* --------------------------------- PNG -------------------------------- */

const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(buf) {
  const out = [buf.subarray(0, 8)];
  let pos = 8;
  while (pos + 12 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const end = pos + 12 + length;
    if (end > buf.length) return buf;
    if (!PNG_DROP.has(type)) out.push(buf.subarray(pos, end));
    pos = end;
    if (type === 'IEND') return Buffer.concat(out);
  }
  // No IEND (truncated file that still decodes): keep what we parsed, minus
  // the metadata, and close it properly.
  out.push(Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]));
  return Buffer.concat(out);
}

/* -------------------------------- WebP -------------------------------- */

function stripWebp(buf) {
  const chunks = [];
  let pos = 12;
  while (pos + 8 <= buf.length) {
    const type = buf.toString('latin1', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const end = pos + 8 + size + (size % 2); // chunks are padded to even sizes
    if (end > buf.length + 1) return buf;
    if (type !== 'EXIF' && type !== 'XMP ') {
      let chunk = Buffer.from(buf.subarray(pos, Math.min(end, buf.length)));
      if (type === 'VP8X' && chunk.length > 8) chunk[8] &= ~(0x08 | 0x04); // clear EXIF and XMP flags
      chunks.push(chunk);
    }
    pos = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.from('RIFF\0\0\0\0WEBP', 'latin1');
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
}

/**
 * Return the image without private metadata.
 * @param {Buffer} buf
 * @param {string} ext  sniffed type: jpg, png, gif, webp, avif or ico
 */
export function stripImageMetadata(buf, ext) {
  try {
    if (ext === 'jpg') return stripJpeg(buf);
    if (ext === 'png') return stripPng(buf);
    if (ext === 'webp') return stripWebp(buf);
  } catch {
    /* fall through: keep the original */
  }
  return buf;
}
