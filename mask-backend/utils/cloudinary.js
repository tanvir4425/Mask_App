// mask-backend/utils/cloudinary.js
const cloudinary = require("cloudinary").v2;

// Easiest: provide CLOUDINARY_URL env var (recommended by Cloudinary)
// Example: cloudinary://<key>:<secret>@<cloud_name>
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ secure: true }); // parses CLOUDINARY_URL automatically
}

const FOLDER = process.env.CLOUDINARY_FOLDER || "mask";

function uploadBuffer(buffer, folder = "uploads") {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ resource_type: "image", folder: `${FOLDER}/${folder}` }, (err, result) => {
        if (err) return reject(err);
        resolve(result); // { secure_url, public_id, ... }
      })
      .end(buffer);
  });
}

module.exports = {
  isEnabled: !!process.env.CLOUDINARY_URL,
  client: cloudinary,
  uploadBuffer,
};
