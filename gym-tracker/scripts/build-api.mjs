import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync, cpSync } from 'fs';

const OUTPUT_DIR = '.vercel/output';
const FUNC_DIR = `${OUTPUT_DIR}/functions/api/index.func`;

// Create Vercel Build Output structure
mkdirSync(FUNC_DIR, { recursive: true });
mkdirSync(`${OUTPUT_DIR}/static`, { recursive: true });

// Bundle the API function - using test handler for debugging
await esbuild.build({
    entryPoints: ['api-src/test-handler.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: `${FUNC_DIR}/handler.js`,
    minify: false,
    treeShaking: true,
});

// Create wrapper that exports the handler correctly for Vercel
writeFileSync(`${FUNC_DIR}/index.js`, `
const handler = require('./handler.js');
module.exports = handler.default || handler;
`);

// Create function config for Vercel Node.js
writeFileSync(`${FUNC_DIR}/.vc-config.json`, JSON.stringify({
    runtime: 'nodejs20.x',
    handler: 'index.js',
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
