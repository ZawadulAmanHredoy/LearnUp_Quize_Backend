const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
  teamName: {
    type: String,
    required: true,
    trim: true
  },
  teamNumber: {
    type: Number,
    required: true,
    unique: true
  },
  teamId: {
    type: String,
    default: ''
  },
  institution: {
    type: String,
    default: ''
  },
  teamLead: {
    type: String,
    default: ''
  },
  pin: {
    type: String,
    required: true
  },
  score: {
    type: Number,
    default: 0
  },
  roundScores: {
    buzzer: { type: Number, default: 0 },
    audioVisual: { type: Number, default: 0 },
    rapidFire: { type: Number, default: 0 }
  },
  activeSessionToken: {
    type: String,
    default: null
  },
  socketId: {
    type: String,
    default: null
  },
  isConnected: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

TeamSchema.index({ score: -1 });

module.exports = mongoose.models.Team || mongoose.model('Team', TeamSchema);
