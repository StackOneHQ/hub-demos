#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const demos = [
    { name: 'vanilla', kind: 'static' },
    { name: 'vue', kind: 'vite' },
    { name: 'svelte', kind: 'vite' },
    { name: 'react', kind: 'vite' },
    { name: 'angular', kind: 'angular', outputDir: 'dist/stackone-hub-angular-demo/browser' },
];

const run = (cmd, cwd) => {
    console.log(`\n$ ${cmd}  (in ${path.relative(root, cwd) || '.'})`);
    execSync(cmd, { cwd, stdio: 'inherit' });
};

const ensureClean = (target) => {
    if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true });
    }
    mkdirSync(target, { recursive: true });
};

console.log(`Building hub-demos → ${dist}`);
ensureClean(dist);

for (const demo of demos) {
    const demoDir = path.join(root, demo.name);
    const targetDir = path.join(dist, demo.name);

    if (demo.kind === 'static') {
        console.log(`\n— ${demo.name} (static, no build)`);
        cpSync(demoDir, targetDir, {
            recursive: true,
            filter: (src) => !src.includes('node_modules'),
        });
        continue;
    }

    console.log(`\n— ${demo.name} (${demo.kind})`);
    run('npm ci --include=dev --no-audit --no-fund', demoDir);
    run('npm run build', demoDir);

    const srcOut =
        demo.kind === 'angular'
            ? path.join(demoDir, demo.outputDir)
            : path.join(demoDir, 'dist');

    if (!existsSync(srcOut)) {
        throw new Error(`${demo.name}: expected build output at ${srcOut}, not found`);
    }
    cpSync(srcOut, targetDir, { recursive: true });
}

// Landing page
cpSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));

console.log(`\n✓ Built ${demos.length} demos → ${path.relative(root, dist)}/`);
