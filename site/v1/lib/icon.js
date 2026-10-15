// ===== icon.js — the connecting app's icon, made to fit a Data Flow palette =====
//
// Data Flow shows a palette's icon in two places, and both are small:
//
//   the palette menu   a 16px glyph at the left of the entry
//   the canvas         a 28px rounded tile at the left of the node
//
// So the SDK does not hand Data Flow the app's full-size logo. It checks the
// image, then draws it at exactly twice each of those sizes (sharp on a 2x
// screen, never scaled up) and sends those two small PNGs. They travel with the
// manifest and are stored with the connection, so they have to be small: a
// whole connection lives in one Data Flow record.
//
// The rules, and why:
//   - PERFECTLY SQUARE. Both slots are squares. A non-square image would have to
//     be cropped or letterboxed, and either changes what the logo looks like.
//     Refused, not "fixed".
//   - At least ICON_MIN px a side, so neither output is ever drawn bigger than
//     the source.
//   - PNG, JPEG, WebP, GIF or SVG. An SVG must declare its own width and height
//     (a browser reports 0x0 for one that does not, and there is then nothing to
//     test squareness against).
//   - Readable by this page. A cross-origin URL must be served with CORS, or the
//     browser will not let the page read it.
//
// THE FINGERPRINT IS THE SOURCE, NOT THE COPIES. The user approves a manifest by
// its hash (manifest.js), and the icon is part of what they approved. But two
// browsers resample and encode a PNG differently, so the drawn copies are not
// byte-identical from one browser to the next — hashing them would ask the same
// user to approve again on every other browser. So the icon's part of the hash
// is `source`: the SHA-256 of the image file's own bytes, which are the same
// everywhere. The copies only travel for display.

export const ICON_SIZES = Object.freeze({ menu: 32, canvas: 56 });
export const ICON_MIN = 64;
const ICON_MAX = 4096;
const MAX_OUTPUT_BYTES = 24 * 1024;
const ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

export class IconError extends Error {
  constructor(message) { super(message); this.name = 'IconError'; }
}

/**
 * Load, check and shrink an icon.
 * `source` is a URL (http(s), relative, or data:), or a Blob/File.
 * Resolves to { menu, canvas, source, size } — two PNG data: URIs, the SHA-256
 * of the source file's bytes, and its side — or rejects with an IconError
 * saying exactly what is wrong.
 */
export async function prepareIcon(source) {
  const blob = await toBlob(source);
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  // Drawn from the very bytes that were hashed, through a same-origin blob: URL,
  // so the canvas is never tainted and what is shown is what was fingerprinted.
  const url = URL.createObjectURL(blob);
  const mime = (blob.type || '').toLowerCase();
  const revoke = () => URL.revokeObjectURL(url);
  try {
    if (mime && !ACCEPTED_MIME.includes(mime)) {
      throw new IconError(`icon must be PNG, JPEG, WebP, GIF or SVG — got ${mime}.`);
    }
    const img = await load(url);
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) {
      throw new IconError('icon has no size. An SVG icon must declare width and height on its <svg> element.');
    }
    if (w !== h) throw new IconError(`icon must be a perfect square — it is ${w}×${h} px.`);
    if (w < ICON_MIN) throw new IconError(`icon must be at least ${ICON_MIN}×${ICON_MIN} px — it is ${w}×${h} px.`);
    if (w > ICON_MAX) throw new IconError(`icon must be at most ${ICON_MAX}×${ICON_MAX} px — it is ${w}×${h} px.`);

    const menu = draw(img, w, ICON_SIZES.menu);
    const canvas = draw(img, w, ICON_SIZES.canvas);
    for (const [slot, uri] of [['menu', menu], ['canvas', canvas]]) {
      if (uri.length > MAX_OUTPUT_BYTES) {
        throw new IconError(`icon is too detailed to store: its ${slot} size came out at ${Math.round(uri.length / 1024)} KB.`);
      }
    }
    return { menu, canvas, source: hash, size: w };
  } finally {
    revoke();
  }
}

/** The icon's file as a Blob: a Blob as given, or a URL / data: URI fetched. */
async function toBlob(source) {
  if (typeof Blob !== 'undefined' && source instanceof Blob) return source;
  if (typeof source !== 'string' || !source.trim()) {
    throw new IconError('icon must be an image URL, a data: URI, or a Blob/File.');
  }
  let res;
  try { res = await fetch(source, { mode: 'cors', credentials: 'omit' }); }
  catch { throw new IconError('icon could not be loaded. Check the URL; an icon on another origin must be served with CORS headers.'); }
  if (!res.ok) throw new IconError(`icon could not be loaded (${res.status}). Check the URL.`);
  const blob = await res.blob();
  // A server that labels an SVG as text/plain still serves an SVG; trust a
  // data: URI's own type, otherwise the response's.
  const declared = (/^data:([^;,]+)/i.exec(source) || [])[1];
  return declared && declared.toLowerCase() !== blob.type ? new Blob([blob], { type: declared.toLowerCase() }) : blob;
}

function load(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new IconError('icon could not be read as an image.'));
    img.src = url;
  });
}

/**
 * Draw `img` (a `side`-px square) at `size` px and return it as a PNG data: URI.
 * Halves the image in steps rather than in one jump: one big downscale drops
 * most of the source pixels and a fine logo comes out jagged.
 */
function draw(img, side, size) {
  let src = img, cur = side;
  while (cur / 2 >= size) {
    const next = Math.round(cur / 2);
    src = paint(src, cur, next);
    cur = next;
  }
  const out = cur === size && src !== img ? src : paint(src, cur, size);
  return out.toDataURL('image/png');
}

function paint(src, from, to) {
  const c = document.createElement('canvas');
  c.width = c.height = to;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, from, from, 0, 0, to, to);
  return c;
}
