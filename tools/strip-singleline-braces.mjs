#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable indent */
// Dependency-free codemod to remove braces around single-line blocks that contain
// only: return <expr>?;, break;, or continue; and place the statement on the same line.
//
// Examples:
//   if (cond) { return x; }     →  if (cond) return x;
//   else { break; }             →  else break;
//   while (ok) { continue; }    →  while (ok) continue;
//   for (...) { break; }        →  for (...) break;
//
// Notes/Limitations:
// - Conservative regex-based approach; operates when the entire block can be matched
//   without nested braces in the control clause condition. It intentionally avoids
//   complex multi-line/nested constructs to reduce risk.
// - Safe to run repeatedly (idempotent). Use --dry for preview; --backup to write .bak.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function usage() {
    console.log('Usage: node scripts/strip-singleline-braces.mjs [--dry] [--backup] <file...>');
}

const args = process.argv.slice(2);
let DRY = false;
let BACKUP = false;
const files = [];
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry') DRY = true;
    else if (a === '--backup') BACKUP = true;
    else if (a === '--help' || a === '-h') {
        usage();
        process.exit(0);
    }
    else files.push(a);
}

if (!files.length) {
    usage();
    process.exit(2);
}

// Build regex patterns (conservative):
// - Condition part forbids braces to avoid crossing block boundaries: [^{};]*
// - Allows whitespace/newlines around tokens.
const RE_IF_SINGLE = /\b(if\s*\([^{};]*\))\s*\{\s*(return|break|continue)\s*([^;]*?)\s*;\s*\}/g;
const RE_ELSE_SINGLE = /\b(else)\s*\{\s*(return|break|continue)\s*([^;]*?)\s*;\s*\}/g;
const RE_LOOP_SINGLE = /\b((?:while|for(?:\s+await)?)\s*\([^{};]*\))\s*\{\s*(break|continue)\s*;\s*\}/g;

function stripSingleLineBlocks(src) {
    let changed = false;
    let out = src;
    // Iterate until stable in case adjacent opportunities appear after a replacement
    for (let pass = 0; pass < 4; pass++) {
        const before = out;
        out = out
            // if (...) { return|break|continue X?; }
            .replace(RE_IF_SINGLE, (_m, head, kw, expr) => {
                const tail = expr && expr.trim() ? ' ' + expr.trim() : '';
                return `${head} ${kw}${tail};`;
            })
            // else { return|break|continue X?; }
            .replace(RE_ELSE_SINGLE, (_m, head, kw, expr) => {
                const tail = expr && expr.trim() ? ' ' + expr.trim() : '';
                return `${head} ${kw}${tail};`;
            })
            // while/for (...) { break|continue; }
            .replace(RE_LOOP_SINGLE, (_m, head, kw) => `${head} ${kw};`);
        if (out === before) break;
        else changed = true;
    }
    return { code: out, changed: changed };
}

function processOne(file) {
    const text = fs.readFileSync(file, 'utf8');
    const { code, changed } = stripSingleLineBlocks(text);
    if (!changed) return { file: file, changed: false };
    if (DRY) return { file: file, changed: true, dry: true };
    if (BACKUP) fs.writeFileSync(file + '.bak', text);
    fs.writeFileSync(file, code);
    return { file: file, changed: true };
}

let changedCount = 0;
for (const f of files) {
    try {
        const st = fs.statSync(f);
        if (!st.isFile()) {
            console.warn(`[skip] not a file: ${f}`);
            continue;
        }
        if (!/\.(m?js)$/i.test(f)) {
            console.warn(`[skip] not a JS file: ${f}`);
            continue;
        }
        const res = processOne(f);
        if (res.changed && !res.dry) changedCount++;
        const tag = res.changed ? (res.dry ? 'would-change' : 'changed') : 'no-change';
        console.log(`[${tag}] ${path.relative(process.cwd(), f)}`);
    }
    catch (e) {
        console.warn(`[error] ${f}: ${e?.message || String(e)}`);
    }
}
console.log(`Done. Files changed: ${changedCount}`);
