import * as esbuild from 'esbuild';
import { mkdirSync } from 'fs';

// Output API to apps/web/dist/api so it works with outputDirectory
const apiOutputDir = 'apps/web/dist/api';

// Ensure api directory exists
mkdirSync(apiOutputDir, { recursive: true });

// Bundle EVERYTHING to reduce cold start time
await esbuild.build({
    entryPoints: ['api-src/[[...path]].ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs', // CommonJS is faster for cold start
    outfile: `${apiOutputDir}/[[...path]].js`,
    minify: true,
    treeShaking: true,
});

console.log('API bundled successfully');
