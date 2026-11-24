import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Render serves this site from the domain root.
  base: '/',
  plugins: [react()],
  server: {
    proxy: {'/api': 'http://localhost:3001'},
    watch: {
      ignored: ['**/*.{HEIC,heic,JPE,jpe,JPEG,jpeg,JPG,jpg,PNG,png,WEBP,webp}']
    }
  }
});
