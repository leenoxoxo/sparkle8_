import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      ignored: ['**/*.{HEIC,heic,JPE,jpe,JPEG,jpeg,JPG,jpg,PNG,png,WEBP,webp}']
    }
  }
});
