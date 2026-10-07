const mongoose = require('mongoose');

// Metadata for an uploaded clip. The bytes live in the GridFS bucket "media"
// under the same _id. The _id is derived from the file's SHA-256, so the same
// file uploaded twice is stored once and a URL never changes content.
const MediaAssetSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  originalName: { type: String, required: true, trim: true },
  mediaType: { type: String, enum: ['VIDEO', 'AUDIO', 'IMAGE'], required: true },
  contentType: { type: String, required: true },
  ext: { type: String, required: true },
  size: { type: Number, required: true },
  sha256: { type: String, required: true },
  uploadedBy: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.MediaAsset || mongoose.model('MediaAsset', MediaAssetSchema);
