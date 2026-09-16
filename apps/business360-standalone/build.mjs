import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const esbuild=process.env.BUSINESS360_ESBUILD_PATH?require(process.env.BUSINESS360_ESBUILD_PATH):require('esbuild');
await esbuild.build({entryPoints:[path.join(here,'src/main.tsx')],bundle:true,minify:true,jsx:'automatic',format:'iife',target:['es2022'],outfile:path.join(here,'public/app.js'),nodePaths:[path.join(here,'node_modules'),...(process.env.BUSINESS360_BUILD_MODULES?[process.env.BUSINESS360_BUILD_MODULES]:[])],define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked'});
console.log('Built standalone interface from the shared Omniqora components.');
