#!/usr/bin/env node
/**
 * Build script for static-only hosting (e.g. VibeHost, GitHub Pages).
 *
 * Copies everything in `public/` into `dist/`, ready to be uploaded
 * to any static host. Excludes the Node.js backend, node_modules,
 * and any other server-only files.
 *
 * Usage:  npm run build:static
 */

const fs   = require('fs');
const path = require('path');

const ROOT  = path.resolve(__dirname, '..');
const SRC   = path.join(ROOT, 'public');
const DEST  = path.join(ROOT, 'dist');

function rmrf(p) {
    if (!fs.existsSync(p)) return;
    for (const entry of fs.readdirSync(p)) {
        const full = path.join(p, entry);
        const stat = fs.lstatSync(full);
        if (stat.isDirectory()) {
            rmrf(full);
        } else if (stat.isFile()) {
            try { fs.unlinkSync(full); }
            catch (e) { /* file locked — will overwrite via copy later */ }
        } else if (stat.isSymbolicLink()) {
            try { fs.unlinkSync(full); } catch (e) {}
        }
    }
    try { fs.rmdirSync(p); } catch (e) { /* leave dir if locked */ }
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath  = path.join(src,  entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else if (entry.isFile()) {
            fs.copyFileSync(srcPath, destPath);
        }
        // Skip symlinks and other special files
    }
}

console.log('[build:static] Source :', SRC);
console.log('[build:static] Dest   :', DEST);

if (!fs.existsSync(SRC)) {
    console.error('[build:static] ✗ public/ folder not found at', SRC);
    process.exit(1);
}

rmrf(DEST);
copyDir(SRC, DEST);

// Report what was produced
let total = 0;
let count = 0;
const report = [];
function walk(dir, rel = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const r    = path.posix.join(rel, entry.name);
        if (entry.isDirectory()) walk(full, r);
        else if (entry.isFile()) {
            const size = fs.statSync(full).size;
            total += size;
            count += 1;
            report.push({ file: r, size });
        }
    }
}
walk(DEST);

console.log(`[build:static] ✓ wrote ${count} files (${(total / 1024).toFixed(1)} KB total)`);
for (const r of report) console.log(`  ${r.file.padEnd(40)} ${r.size.toString().padStart(7)} bytes`);
