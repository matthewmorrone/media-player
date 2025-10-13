import { defineConfig } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
    {
        files: ['**/*.{js,mjs}'],
        ignores: ['node_modules/**', 'dist/**', 'build/**'],

        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
            },
        },

        // plugins: {}, // No curlyPlugin needed, using base rule only.

        rules: {
            // Indentation: 4 spaces; keep case labels flush with switch (SwitchCase: 0)
            // and allow control-flow statements to align with the case label instead of the case body.
            // We ignore break/return/continue/throw under a SwitchCase so ESLint doesn't force an extra indent.
            indent: ['error', 4, { SwitchCase: 0, ignoredNodes: [
                'SwitchCase > BreakStatement',
                'SwitchCase > ReturnStatement',
                'SwitchCase > ContinueStatement',
                'SwitchCase > ThrowStatement',
            ] }],
            'max-len': 'off',
            semi: ['warn', 'always'],
            quotes: ['warn', 'single', { avoidEscape: true }],
            'no-trailing-spaces': 'warn',
            'eol-last': ['error', 'always'],
            // 'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            // Allow multiple statements per line in this codebase to reduce friction
            'max-statements-per-line': 'off',
            // Prefer Stroustrup so `else`/`catch` start on the next line
            'brace-style': ['error', 'stroustrup', { allowSingleLine: false }],
            // Do not enforce blank lines before returns/if/statements
            'padding-line-between-statements': 'off',
            'newline-before-return': 'off',
            'comma-dangle': ['error', 'always-multiline'],
            'arrow-parens': ['warn', 'always'],
            'arrow-body-style': ['error', 'as-needed'],
            'no-empty': 'off',
            'no-undef': 'warn',
            'no-func-assign': 'warn',
            'no-redeclare': 'warn',
            'no-useless-catch': 'warn',
            'no-useless-escape': 'warn',
            'no-case-declarations': 'warn',
            'space-in-parens': ['error', 'never'],
            'space-before-blocks': ['error', 'always'],
            // 'space-before-function-paren': ['error', 'always'],
            'space-infix-ops': ['error'],
            'keyword-spacing': ['error', { before: true, after: true }],
            'one-var': ['error', 'never'],
            // 'padding-line-between-statements': [
            //     'error',
            //     { blankLine: 'always', prev: '*', next: 'function' },
            //     { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
            //     { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
            // ],
            'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }],
            'linebreak-style': ['error', 'unix'],
            'comma-style': ['error', 'last'],
            // Prefer shorthand when it reads better, but do not fail CI
            'object-shorthand': ['warn', 'consistent-as-needed'],
            'quote-props': ['error', 'as-needed'],
            'dot-notation': ['error', { allowKeywords: true }],
            'no-extra-semi': ['error'],
            'comma-spacing': ['error', { before: false, after: true }],
            'operator-linebreak': ['error', 'none'],
            'semi-spacing': ['error', { before: false, after: true }],
            'array-bracket-newline': ['error', 'consistent'],
            'array-element-newline': ['error', 'consistent'],
            'computed-property-spacing': ['error', 'never'],
            'func-call-spacing': ['error', 'never'],
            'key-spacing': ['error', { beforeColon: false, afterColon: true }],
            'lines-around-comment': ['error', { beforeBlockComment: true, afterBlockComment: false }],
            'no-multi-spaces': ['error'],
            // Allow some shorthand coercions; surface as warnings only
            'no-implicit-coercion': ['warn'],
            'template-curly-spacing': ['error', 'never'],
            // 'object-curly-spacing': ['error', 'always'],
            'object-curly-newline': ['error', { consistent: true }],
            'space-unary-ops': ['error', { words: true, nonwords: false }],
            'newline-per-chained-call': ['error', { ignoreChainWithDepth: 2 }],
            'wrap-iife': ['error', 'inside'],
            'prefer-arrow-callback': ['error'],
            'arrow-spacing': ['error', { before: true, after: true }],
        },

        linterOptions: {
            reportUnusedInlineConfigs: 'warn',
        },
    },
]);
