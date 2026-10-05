const fs = require('fs');
const path = require('path');

// Clips for the audio-visual round live here and are served at /media/<file>
const MEDIA_DIR = path.join(__dirname, '..', 'public', 'media');
const MEDIA_URL_PREFIX = '/media/';

const MEDIA_EXTENSIONS = {
  VIDEO: ['.mp4', '.webm', '.ogv', '.mov', '.m4v'],
  AUDIO: ['.mp3', '.wav', '.ogg', '.m4a', '.aac'],
  IMAGE: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
};

/**
 * Absolute path for a /media/... URL, or null for external URLs and paths
 * that would escape the media folder
 */
function resolveLocalMediaPath(mediaUrl) {
  if (typeof mediaUrl !== 'string' || !mediaUrl.startsWith(MEDIA_URL_PREFIX)) return null;
  const relative = decodeURIComponent(mediaUrl.slice(MEDIA_URL_PREFIX.length).split(/[?#]/)[0]);
  const resolved = path.resolve(MEDIA_DIR, relative);
  if (!resolved.startsWith(MEDIA_DIR + path.sep)) return null;
  return resolved;
}

function listMediaFiles() {
  try {
    return fs
      .readdirSync(MEDIA_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map((entry) => {
        const ext = path.extname(entry.name).toLowerCase();
        const type = Object.keys(MEDIA_EXTENSIONS).find((t) => MEDIA_EXTENSIONS[t].includes(ext)) || 'OTHER';
        const { size } = fs.statSync(path.join(MEDIA_DIR, entry.name));
        return { file: entry.name, url: `${MEDIA_URL_PREFIX}${encodeURIComponent(entry.name)}`, type, size };
      })
      .sort((a, b) => a.file.localeCompare(b.file));
  } catch (err) {
    return [];
  }
}

/**
 * Questions whose media is a local /media file that isn't on disk
 */
function findMissingMedia(questions) {
  return questions
    .filter((q) => q.mediaType && q.mediaType !== 'NONE' && q.mediaUrl)
    .filter((q) => {
      const filePath = resolveLocalMediaPath(q.mediaUrl);
      return filePath !== null && !fs.existsSync(filePath);
    })
    .map((q) => ({
      questionId: String(q._id),
      roundType: q.roundType,
      order: q.order,
      mediaUrl: q.mediaUrl
    }));
}

module.exports = {
  MEDIA_DIR,
  listMediaFiles,
  findMissingMedia,
  resolveLocalMediaPath
};
