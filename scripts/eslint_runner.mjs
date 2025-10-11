#!/usr/bin/env node
// Lightweight ESLint runner using the Node.js API (ESLint class)
// Docs: https://eslint.org/docs/latest/integrate/nodejs-api#eslint-class

import process from 'node:process';
import { ESLint } from 'eslint';

function parseArgs(argv) {
    const args = { fix: false, format: 'stylish', config: null, patterns: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--fix') args.fix = true;
        else if (a === '--format' || a === '-f') {
            if (i + 1 < argv.length) {
                args.format = String(argv[++i]);
            }
        }
        else if (a === '--config' || a === '-c') {
            if (i + 1 < argv.length) {
                args.config = String(argv[++i]);
            }
        }
        else if (a.startsWith('-')) {
            // ignore unknown flags
        }
        else {
            args.patterns.push(a);
        }
    }
    return args;
}

async function main() {
    const argv = process.argv.slice(2);
    const { fix, format, config, patterns } = parseArgs(argv);

    // Construct ESLint with optional override config file when provided
    const eslintOptions = { fix };
    if (config) {
        // eslint@8/9 supports overrideConfigFile for legacy/flat configs
        // If not supported by your version, omit --config and rely on auto-discovery
        eslintOptions.overrideConfigFile = config;
    }
    const eslint = new ESLint(eslintOptions);

    const targets = patterns.length
        ? patterns
        : ['**/*.js', '**/*.mjs', '!**/node_modules/**', '!**/__pycache__/**'];

    const results = await eslint.lintFiles(targets);
    if (fix) {
        await ESLint.outputFixes(results);
    }

    const formatter = await eslint.loadFormatter(format);
    const output = formatter.format(results);
    if (output && output.trim().length) {
        // eslint-formatters already include trailing newlines
        process.stdout.write(output);
    }

    const errorCount = results.reduce((n, r) => n + (r.errorCount || 0), 0);
    // Non-zero exit when errors exist; warnings do not fail the run by default
    process.exitCode = errorCount ? 1 : 0;
}

main().catch((err) => {
    console.error('[eslint-runner] Unhandled error:', err && err.message ? err.message : err);
    process.exitCode = 2;
});
