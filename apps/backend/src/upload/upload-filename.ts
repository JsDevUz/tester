/**
 * Recovers a UTF-8 filename that multipart parsing mangled into latin-1.
 *
 * `multipart/form-data` has no way to declare the encoding of a filename, so Busboy (via
 * Multer) decodes it as latin-1. An ASCII name survives that untouched, but anything else --
 * Cyrillic, Uzbek's oʻ/gʻ, an emoji -- arrives as mojibake: "Замет" turns up as "Ð—Ð°Ð¼ÐµÑ‚".
 * Re-encoding those code points as bytes and reading them back as UTF-8 restores the original.
 *
 * A name that is already correct is returned unchanged: re-encoding it either fails to
 * round-trip or produces replacement characters, and both cases fall back to the input.
 */
export function decodeUploadFilename(name: string): string {
  if (!name) return name;

  // Pure ASCII cannot have been mangled, so there is nothing to undo.
  if (!/[-ÿ]/.test(name)) return name;

  const decoded = Buffer.from(name, 'latin1').toString('utf8');

  // U+FFFD means the bytes were not valid UTF-8 after all -- the name was genuinely latin-1,
  // not mangled UTF-8, so keep what we were given.
  if (decoded.includes('�')) return name;

  return decoded;
}
