const mongoose = require('mongoose');

const OptionSchema = new mongoose.Schema({
  label: { type: String, required: true }, // 'A', 'B', 'C', 'D'
  text: { type: String, required: true }
}, { _id: false });

const QuestionSchema = new mongoose.Schema({
  roundType: {
    type: String,
    enum: ['BUZZER', 'AUDIO_VISUAL', 'RAPID_FIRE'],
    required: true
  },
  order: {
    type: Number,
    default: 0
  },
  questionText: {
    type: String,
    required: true
  },
  mediaType: {
    type: String,
    enum: ['NONE', 'IMAGE', 'AUDIO', 'VIDEO'],
    default: 'NONE'
  },
  mediaUrl: {
    type: String,
    default: null
  },
  options: [OptionSchema],
  correctOptionIndex: {
    type: Number,
    required: true // 0 for A, 1 for B, 2 for C, 3 for D
  },
  points: {
    type: Number,
    default: 10
  },
  negativePoints: {
    type: Number,
    default: 5
  },
  timeLimitSeconds: {
    type: Number,
    default: 30
  },
  explanation: {
    type: String,
    default: ''
  }
}, { timestamps: true });

QuestionSchema.index({ roundType: 1, order: 1 });

module.exports = mongoose.models.Question || mongoose.model('Question', QuestionSchema);
