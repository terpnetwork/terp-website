#!/usr/bin/env node
// Thin wrapper: public/graphs/js-deps.json comes from the reusable scraper in
// terp-rs (tools/gen-tools/js-deps/gen-js-deps.mjs; see its README). This calls
// it with the site's output path and passes every other argument through.
//   node scripts/gen-js-deps.mjs [--root id=PATH] [--only a,b] [--no-dev]
//   TERP_RS_DIR=/path/to/terp-rs node scripts/gen-js-deps.mjs
// Equivalent: (cd crates/terp-rs/tools/gen-tools && just gen-js-deps <site>/public/graphs/js-deps.json)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const terpRs = path.resolve(process.env.TERP_RS_DIR || path.join(site, '../../crates/terp-rs'));
const tool = path.join(terpRs, 'tools/gen-tools/js-deps/gen-js-deps.mjs');
if (!fs.existsSync(tool)) { console.error(`gen-js-deps.mjs not found at ${tool} (set TERP_RS_DIR)`); process.exit(1); }
execFileSync(process.execPath, [tool, '--out', path.join(site, 'public/graphs/js-deps.json'), ...process.argv.slice(2)], { stdio: 'inherit' });
