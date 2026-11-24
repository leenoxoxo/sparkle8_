import {v2 as cloudinary} from 'cloudinary';
import {HttpError} from './errors.js';

export const cloudinaryPath = /^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\/(?:v\d+\/)?sparkle\/products\/[a-z0-9-]+\.(?:png|jpg|jpeg|webp|avif)$/i;

export function cloudImages(env) {
  const {CLOUDINARY_CLOUD_NAME:cloud_name,CLOUDINARY_API_KEY:api_key,CLOUDINARY_API_SECRET:api_secret} = env;
  return async (bytes, key, {format, existing = false, deliveryFormat} = {}) => {
    if (!cloud_name || !api_key || !api_secret) throw new HttpError(503,'images_unconfigured');
    const options = {cloud_name,api_key,api_secret,resource_type:'image',type:'upload',public_id:'sparkle/products/' + key,
      format,overwrite:false,unique_filename:false,timeout:30000};
    const result = await new Promise((resolve,reject) => {
      const stream = cloudinary.uploader.upload_stream(options,(error,response) => error ? reject(new HttpError(502,'image_upload_failed')) : resolve(response));
      stream.on('error', () => reject(new HttpError(502,'image_upload_failed')));
      stream.end(bytes);
    });
    const url = result?.secure_url || (existing && result?.existing && deliveryFormat ?
      cloudinary.url(options.public_id,{cloud_name,secure:true,format:deliveryFormat}) : '');
    if (!cloudinaryPath.test(url) || !url.startsWith('https://res.cloudinary.com/' + cloud_name + '/')) {
      throw new HttpError(502,'image_upload_failed');
    }
    if (result.existing && !existing) throw new HttpError(409,'image_id_conflict');
    return url;
  };
}
