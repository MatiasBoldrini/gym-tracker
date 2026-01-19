import * as esbuild from 'esbuild';
import { mkdirSync } from 'fs';

// Ensure api directory exists
mkdirSync('api', { recursive: true });

// Bundle EVERYTHING for serverless function
await esbuild.build({
    entryPoints: ['api-src/[[...path]].ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: 'api/index.mjs',
    minify: true,
    treeShaking: true,
    banner: {
        js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);'
    }
});

console.log('API bundled successfully');
