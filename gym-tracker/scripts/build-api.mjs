import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync, cpSync } from 'fs';

const OUTPUT_DIR = '.vercel/output';

// Create Vercel Build Output structure
mkdirSync(`${OUTPUT_DIR}/functions/api`, { recursive: true });
mkdirSync(`${OUTPUT_DIR}/static`, { recursive: true });

// Bundle the API function
await esbuild.build({
    entryPoints: ['api-src/[[...path]].ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: `${OUTPUT_DIR}/functions/api/index.func/index.js`,
    minify: false, // Disable minify for debugging
    treeShaking: true,
});

// Create function config - using web handler for Hono
writeFileSync(`${OUTPUT_DIR}/functions/api/index.func/.vc-config.json`, JSON.stringify({
    runtime: 'nodejs20.x',
    handler: 'index.default',
    launcherType: 'Nodejs'
}));

// Create output config with routes
writeFileSync(`${OUTPUT_DIR}/config.json`, JSON.stringify({
    version: 3,
    routes: [
        { src: '/api/(.*)', dest: '/api/index' },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/$1' }
    ]
}));

console.log('API bundled successfully');
