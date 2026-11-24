import {createApp} from './app.js';

const port = Number(process.env.PORT || 3001);
if (process.env.NODE_ENV === 'production') {
  if (!process.env.APP_ORIGIN && process.env.RENDER === 'true' && process.env.RENDER_EXTERNAL_URL) {
    process.env.APP_ORIGIN = process.env.RENDER_EXTERNAL_URL;
  }
  const keys = ['DATABASE_URL','APP_ORIGIN','SESSION_SECRET','CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET'];
  const missing = keys.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error('Missing production environment variables: ' + missing.join(', '));
  const origin = URL.parse(process.env.APP_ORIGIN);
  if (origin?.protocol !== 'https:' || origin.origin !== process.env.APP_ORIGIN) throw new Error('APP_ORIGIN must be an exact HTTPS origin without a trailing slash.');
  if (process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
  if (process.env.MIGRATION_DATABASE_URL) throw new Error('Keep MIGRATION_DATABASE_URL out of the production service.');
  if (URL.parse(process.env.DATABASE_URL)?.username !== 'sparkle_web') throw new Error('Production requires the restricted sparkle_web database connection.');
}
createApp().listen(port, '0.0.0.0', () => console.log(`Sparkle listening on port ${port}`));
