const AppError = require('./appError');

const ROUND_TYPES = ['BUZZER', 'AUDIO_VISUAL', 'RAPID_FIRE'];
const MEDIA_TYPES = ['NONE', 'VIDEO', 'AUDIO', 'IMAGE'];
const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

// Scoring defaults per round (Rules.md §2.3, §3.2, §4.2)
const ROUND_DEFAULTS = {
  BUZZER: { points: 10, negativePoints: 5, timeLimitSeconds: 30 },
  AUDIO_VISUAL: { points: 15, negativePoints: 0, timeLimitSeconds: 30 },
  RAPID_FIRE: { points: 1, negativePoints: 0, timeLimitSeconds: 10 }
};

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Validate and normalise a question coming from the admin.
 * `input` may be partial when `existing` is given (an update); the result is
 * always a complete question document. Throws a 400 listing every problem.
 */
function normalizeQuestion(input = {}, existing = null) {
  const merged = { ...(existing || {}), ...input };
  const errors = [];

  const roundType = String(merged.roundType || '').toUpperCase();
  if (!ROUND_TYPES.includes(roundType)) {
    errors.push(`roundType must be one of ${ROUND_TYPES.join(', ')}`);
  }
  const defaults = ROUND_DEFAULTS[roundType] || ROUND_DEFAULTS.BUZZER;

  const questionText = String(merged.questionText ?? '').trim();
  if (!questionText) errors.push('Question text is required');
  if (questionText.length > 1000) errors.push('Question text must be 1000 characters or fewer');

  const rawOptions = Array.isArray(merged.options) ? merged.options : [];
  const optionTexts = rawOptions.map((opt) => String(typeof opt === 'string' ? opt : opt?.text ?? '').trim());
  if (optionTexts.length < MIN_OPTIONS || optionTexts.length > MAX_OPTIONS) {
    errors.push(`Provide between ${MIN_OPTIONS} and ${MAX_OPTIONS} options`);
  }
  if (optionTexts.some((text) => !text)) errors.push('Options cannot be empty');
  if (optionTexts.some((text) => text.length > 300)) errors.push('Options must be 300 characters or fewer');
  const options = optionTexts.map((text, idx) => ({ label: OPTION_LABELS[idx] || String(idx + 1), text }));

  const correctOptionIndex = toNumber(merged.correctOptionIndex, NaN);
  if (!Number.isInteger(correctOptionIndex) || correctOptionIndex < 0 || correctOptionIndex >= options.length) {
    errors.push('Choose which option is correct');
  }

  const points = toNumber(merged.points, defaults.points);
  const negativePoints = Math.abs(toNumber(merged.negativePoints, defaults.negativePoints));
  const timeLimitSeconds = toNumber(merged.timeLimitSeconds, defaults.timeLimitSeconds);
  if (!Number.isFinite(points) || points < 0 || points > 1000) errors.push('Points must be between 0 and 1000');
  if (!Number.isFinite(negativePoints) || negativePoints > 1000) errors.push('Penalty must be between 0 and 1000');
  if (!Number.isFinite(timeLimitSeconds) || timeLimitSeconds < 5 || timeLimitSeconds > 600) {
    errors.push('Time limit must be between 5 and 600 seconds');
  }

  const order = toNumber(merged.order, 0);
  if (!Number.isFinite(order)) errors.push('Order must be a number');

  const explanation = String(merged.explanation ?? '').trim().slice(0, 2000);

  // Media belongs to the audio-visual round only
  let mediaType = 'NONE';
  let mediaId = null;
  let mediaUrl = null;
  if (roundType === 'AUDIO_VISUAL') {
    mediaType = String(merged.mediaType || 'NONE').toUpperCase();
    mediaId = merged.mediaId ? String(merged.mediaId) : null;
    mediaUrl = merged.mediaUrl ? String(merged.mediaUrl).trim() : null;
    if (mediaId) mediaUrl = null;

    if (!MEDIA_TYPES.includes(mediaType) || mediaType === 'NONE') {
      errors.push('Audio-visual questions need a media type: VIDEO, AUDIO or IMAGE');
    }
    if (!mediaId && !mediaUrl) {
      errors.push('Audio-visual questions need an uploaded media file');
    }
    if (mediaUrl && !/^https:\/\//i.test(mediaUrl)) {
      errors.push('External media links must start with https://');
    }
  }

  if (errors.length > 0) {
    const err = new AppError(errors.join('. '), 400);
    err.details = errors;
    throw err;
  }

  return {
    roundType,
    order,
    questionText,
    options,
    correctOptionIndex,
    points,
    negativePoints,
    timeLimitSeconds,
    explanation,
    mediaType,
    mediaId,
    mediaUrl
  };
}

module.exports = {
  ROUND_TYPES,
  ROUND_DEFAULTS,
  MIN_OPTIONS,
  MAX_OPTIONS,
  normalizeQuestion
};
