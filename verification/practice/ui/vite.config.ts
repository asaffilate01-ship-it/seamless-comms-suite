import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({root,plugins:[{name:'practice-fixture',enforce:'pre',resolveId(id){if(id==='@tanstack/react-start'||id==='@tanstack/react-router'||id==='@/components/app/shell'||id.endsWith('workspace.functions')||id.endsWith('client-services.functions')||id.endsWith('module-management.functions')||id==='./functions'||id.endsWith('files.functions'))return path.join(root,'mocks.tsx');}},react(),tailwind()],resolve:{alias:{'@':path.resolve(root,'../../../src')}},server:{host:'127.0.0.1',port:4178,fs:{allow:[path.resolve(root,'../../..')]}}});
