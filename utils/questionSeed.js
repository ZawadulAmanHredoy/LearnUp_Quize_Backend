const fs = require('fs');
const path = require('path');
const store = require('./store');
const mediaStore = require('./mediaStore');

// Sample clips referenced by data/questions.json as "/media/<file>"
const SAMPLE_MEDIA_DIR = path.join(__dirname, '..', 'data', 'sample-media');

/**
 * Upload a bundled sample clip referenced as "/media/<file>" and return its
 * asset id, or null when there is no such sample file.
 */
async function importSampleMedia(legacyUrl) {
  if (typeof legacyUrl !== 'string' || !legacyUrl.startsWith('/media/')) return null;
  const fileName = path.basename(decodeURIComponent(legacyUrl.slice('/media/'.length)));
  const filePath = path.join(SAMPLE_MEDIA_DIR, fileName);
  if (!fs.existsSync(filePath)) return null;
  const asset = await mediaStore.importLocalFile(filePath);
  return asset._id;
}

/**
 * First start only: load the starter question bank (data/questions.json),
 * uploading its sample clips. Once questions exist, the database is the
 * source of truth and the file is never applied again.
 */
async function seedQuestionsIfEmpty() {
  const existing = await store.getQuestions();
  if (existing.length > 0) return { seeded: 0 };

  const starter = store.loadCodebaseQuestions() || store.SEED_QUESTIONS;
  let seeded = 0;
  for (const q of starter) {
    const { _id, ...doc } = q;
    if (doc.roundType === 'AUDIO_VISUAL' && !doc.mediaId && doc.mediaUrl) {
      const mediaId = await importSampleMedia(doc.mediaUrl);
      if (mediaId) {
        doc.mediaId = mediaId;
        doc.mediaUrl = null;
      }
    }
    await store.createQuestion(doc);
    seeded += 1;
  }
  console.log(`✅ [Seed] Loaded ${seeded} starter questions`);
  return { seeded };
}

/**
 * Questions created before media uploads existed point at "/media/<file>".
 * Upload the matching sample clip and switch them to mediaId.
 */
async function migrateLegacyMediaUrls() {
  const questions = await store.getQuestions({ roundType: 'AUDIO_VISUAL' });
  let migrated = 0;
  for (const q of questions) {
    if (q.mediaId || !q.mediaUrl || !q.mediaUrl.startsWith('/media/')) continue;
    const mediaId = await importSampleMedia(q.mediaUrl);
    if (mediaId) {
      await store.updateQuestion(q._id, { mediaId, mediaUrl: null });
      migrated += 1;
    } else {
      console.warn(`⚠️  [Media] AV question #${q.order} points at ${q.mediaUrl}; upload the clip again from the Question Bank`);
    }
  }
  if (migrated) console.log(`✅ [Media] Moved ${migrated} question clip(s) into the media store`);
  return { migrated };
}

module.exports = {
  seedQuestionsIfEmpty,
  migrateLegacyMediaUrls
};
