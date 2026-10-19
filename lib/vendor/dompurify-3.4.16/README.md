DOMPurify 3.4.16, vendored unmodified from the npm tarball (no CDN).

- Source: https://registry.npmjs.org/dompurify/-/dompurify-3.4.16.tgz
- Tarball sha1: c51b3709ea15ee9abb07e804f2ef30ea9b953128
- Tarball integrity: sha512-sqo+pNp3qRhCIpbgRi1y8Tgk27Bo2Ry7w0dC1NBeNTdZChWjz9Xb/KOoZbRP/R6pQZ80Qw8YhXw13hWWBbMRnQ==
- File: package/dist/purify.min.js (UMD). Loaded by /lib/svg-sanitize.js as a
  side-effect module import, which sets globalThis.DOMPurify.
- License: Apache-2.0 OR MPL-2.0 (see LICENSE).

To upgrade: replace this folder with a new dompurify-<version>/ folder and
update the import path and DOMPURIFY_VERSION in /lib/svg-sanitize.js on both
terp.network and permissionless.money.
