import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

import serve from 'rollup-plugin-serve';
import rollupSvelte from 'rollup-plugin-svelte';
import rollupSwc from 'rollup-plugin-swc3';
import rollupCleanup from 'rollup-plugin-cleanup';

import { less } from 'svelte-preprocess-less';
import sveltePreprocess from 'svelte-preprocess';

import { transformCodeToESMPlugin, keyPEM, certificatePEM } from '@windycom/plugin-devtools';
import { existsSync, readFileSync } from 'node:fs';

const useSourceMaps = true;

// The bundled Windy dev cert has no Subject Alternative Name, so Chromium
// (Edge/Chrome) rejects it even after trusting it (ERR_CERT_COMMON_NAME_INVALID).
// If a locally-trusted cert with a SAN exists in ./certs (e.g. from mkcert),
// use it instead so windy.com can load this localhost dev server cross-origin.
//   mkcert -install
//   mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 ::1
const LOCAL_CERT = 'certs/localhost.pem';
const LOCAL_KEY = 'certs/localhost-key.pem';
const useLocalCert = existsSync(LOCAL_CERT) && existsSync(LOCAL_KEY);

const buildConfigurations = {
    src: {
        input: 'src/plugin.svelte',
        out: 'plugin',
    },
    example01: {
        input: 'examples/01-hello-world/plugin.svelte',
        out: 'example01/plugin',
    },
    example02: {
        input: 'examples/02-using-vanilla-js/plugin.svelte',
        out: 'example02/plugin',
    },
    example03: {
        input: 'examples/03-boat-tracker/plugin.svelte',
        out: 'example03/plugin',
    },
    example04: {
        input: 'examples/04-aircraft-range/plugin.svelte',
        out: 'example04/plugin',
    },
    example05: {
        input: 'examples/05-airspace-map/plugin.svelte',
        out: 'example05/plugin',
    },
    example06: {
        input: 'examples/06-foehn-chart/plugin.svelte',
        out: 'example06/plugin',
    },
    example07: {
        input: 'examples/07-meteoblue-meteograms/plugin.svelte',
        out: 'example07/plugin',
    },
};

const requiredConfig = process.env.CONFIG || 'src';
const { input, out } = buildConfigurations[requiredConfig];

export default {
    input,
    output: [
        {
            file: `dist/${out}.js`,
            format: 'module',
            sourcemap: true,
        },
        {
            file: `dist/${out}.min.js`,
            format: 'module',
            plugins: [rollupCleanup({ comments: 'none', extensions: ['ts'] }), terser()],
        },
    ],

    onwarn: () => {
        /* We disable all warning messages */
    },
    external: id => id.startsWith('@windy/'),
    watch: {
        include: ['src/**', 'examples/**'],
        exclude: 'node_modules/**',
        clearScreen: false,
    },
    plugins: [
        rollupSvelte({
            emitCss: false,
            preprocess: {
                style: less({
                    sourceMap: false,
                    math: 'always',
                }),
                script: data => {
                    const preprocessed = sveltePreprocess({ sourceMap: useSourceMaps });
                    return preprocessed.script(data);
                },
            },
        }),
        rollupSwc({
            include: ['**/*.ts', '**/*.svelte'],
            sourceMaps: useSourceMaps,
        }),
        resolve({
            browser: true,
            mainFields: ['module', 'jsnext:main', 'main'],
            preferBuiltins: false,
            dedupe: ['svelte'],
        }),
        commonjs(),
        transformCodeToESMPlugin(),
        process.env.SERVE !== 'false' &&
            serve({
                contentBase: 'dist',
                host: '0.0.0.0',
                port: 9999,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    // Allow windy.com (public HTTPS) to fetch this localhost dev
                    // server. Without this, modern Chromium/Edge block the
                    // public->private request via Private Network Access (PNA)
                    // and Windy shows a misleading "dev server not running" error.
                    'Access-Control-Allow-Private-Network': 'true',
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                },
                https: {
                    key: useLocalCert ? readFileSync(LOCAL_KEY) : keyPEM,
                    cert: useLocalCert ? readFileSync(LOCAL_CERT) : certificatePEM,
                },
            }),
    ],
};
