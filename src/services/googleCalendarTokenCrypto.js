const crypto = require('crypto');

/** @type {string | null} */
let activeEncSeed = null;

function setActiveTokenEncSeed(seed) {
  activeEncSeed = seed != null && String(seed).trim() ? String(seed).trim() : null;
}

function deriveKey() {
  const seed = activeEncSeed || 'jcms-google-calendar-dev';
  return crypto.createHash('sha256').update(seed).digest();
}

function encrypt(plain) {
  if (!plain) return '';
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(blob) {
  if (!blob) return '';
  const buf = Buffer.from(String(blob), 'base64');
  if (buf.length < 29) return '';
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const key = deriveKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

module.exports = {
  setActiveTokenEncSeed,
  encrypt,
  decrypt,
};
