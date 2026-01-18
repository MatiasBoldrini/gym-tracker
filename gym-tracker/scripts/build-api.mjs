import * as esbuild from 'esbuild';
import { readFileSync, mkdirSync } from 'fs';

// Read package.json to get all dependencies
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const external = Object.keys(pkg.dependencies || {});

// Ensure api directory exists
mkdirSync('api', { recursive: true });

await esbuild.build({
    entryPoints: ['api-src/[[...path]].ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: 'api/[[...path]].js',
    banner: {
        js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);'
    },
    external,
});

console.log('API bundled successfully');
