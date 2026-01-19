import * as esbuild from 'esbuild';
import { mkdirSync } from 'fs';

// Ensure api directory exists
mkdirSync('api', { recursive: true });

// Bundle EVERYTHING to reduce cold start time
await esbuild.build({
    entryPoints: ['api-src/[[...path]].ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs', // CommonJS is faster for cold start
    outfile: 'api/[[...path]].js',
    minify: true,
    treeShaking: true,
});

console.log('API bundled successfully');
