import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {copyFile,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';

// Copy only the public media directories and root files the storefront owns.
const mediaFolders = ['ABOUT US IMGS','CUSTOM ORDERS IMGS','HOME IMGS','SHOP IMGS','WORKSHOPS IMGS','optimized'];
const rootFiles = new Set(['DIY FIXED1.PNG','DIY FIXED2.PNG','diy.PNG','DIY welcome.jpg','The material.PNG','favicon.svg']);
async function copyMedia(source,destination,allowed) {
  await mkdir(destination,{recursive:true});
  for (const entry of await readdir(source,{withFileTypes:true})) {
    if (entry.isFile() && allowed(entry.name)) await copyFile(join(source,entry.name),join(destination,entry.name));
  }
}
function publicMedia() {
  return {
    name:'sparkle-public-media',
    apply:'build',
    async writeBundle({dir}) {
      await copyMedia('public',dir,name=>rootFiles.has(name));
      for (const folder of mediaFolders) {
        await copyMedia(join('public',folder),join(dir,folder),name=>/\.(?:jpg|jpeg|jpe|png|webp|avif)$/i.test(name));
      }
    }
  };
}

export default defineConfig({
  // Render serves this site from the domain root.
  base: '/',
  plugins: [react(),publicMedia()],
  build: {copyPublicDir:false},
  server: {
    proxy: {'/api': 'http://localhost:3001'},
    fs: {deny:['.env','.env.*','*.{crt,pem,aes}','**/.git/**','**/.audit/**','**/media-source/**']},
    watch: {
      ignored: ['**/*.{HEIC,heic,JPE,jpe,JPEG,jpeg,JPG,jpg,PNG,png,WEBP,webp}']
    }
  }
});
