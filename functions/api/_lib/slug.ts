/**
 * Public workflow slugs — short, opaque, URL-safe ids.
 *
 * 10 characters from a 62-symbol alphabet (`0-9A-Za-z`) gives ~59.5 bits of entropy, ample
 * for collision-free public share ids without a central counter. Bytes are drawn from the
 * CSPRNG (`crypto.getRandomValues`) and mapped with rejection sampling: a byte is only used
 * when it is < 248, the largest multiple of 62 that fits in a byte (62 * 4 = 248). Bytes in
 * [248, 256) would bias `byte % 62` toward the low digits, so they are discarded and redrawn.
 */
const ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const SLUG_LENGTH = 10
/** Largest multiple of 62 representable in a byte; bytes >= this are rejected (modulo bias). */
const REJECT_AT = 248

export function newSlug(): string {
  let out = ''
  while (out.length < SLUG_LENGTH) {
    const buf = new Uint8Array(SLUG_LENGTH - out.length)
    crypto.getRandomValues(buf)
    for (const byte of buf) {
      if (byte < REJECT_AT) out += ALPHABET[byte % ALPHABET.length]
      if (out.length === SLUG_LENGTH) break
    }
  }
  return out
}
