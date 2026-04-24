#!/usr/bin/env node
// Encrypt a case-study HTML fragment with a password, using AES-GCM + PBKDF2.
// Output is compatible with the browser's Web Crypto API decrypt path.
//
// Usage:  node scripts/encrypt-case.mjs <case-slug> <password>
//         e.g.  node scripts/encrypt-case.mjs ef 'night-edition-26'
//
// Reads: scripts/cases/<slug>.plain.html  (the raw HTML you want to lock)
// Writes: prints a JS object { iv, salt, ciphertext } to stdout which you
//         paste into case-study.html's LOCKED map.

import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const [, , slug, password] = process.argv;
if (!slug || !password) {
  console.error('usage: node scripts/encrypt-case.mjs <slug> <password>');
  process.exit(1);
}

const plaintext = readFileSync(`scripts/cases/${slug}.plain.html`, 'utf8');

const enc = new TextEncoder();
const salt = webcrypto.getRandomValues(new Uint8Array(16));
const iv = webcrypto.getRandomValues(new Uint8Array(12));

const baseKey = await webcrypto.subtle.importKey(
  'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'],
);
const key = await webcrypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
  baseKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt'],
);
const ciphertext = new Uint8Array(await webcrypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  key,
  enc.encode(plaintext),
));

const toB64 = (u8) => Buffer.from(u8).toString('base64');

console.log(`// paste into LOCKED.${slug} in case-study.html:`);
console.log(JSON.stringify({
  iv: toB64(iv),
  salt: toB64(salt),
  ciphertext: toB64(ciphertext),
}, null, 2));
