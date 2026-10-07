const mongoose = require('mongoose');

const EventStateSchema = new mongoose.Schema({
  eventId: {
    type: String,
    default: 'learnup-live-event-2026',
    unique: true
  },
  currentStage: {
    type: String,
    enum: [
      'PRE_EVENT',
      'WELCOME',
      'BREAK',
      'ROUND_BUZZER',
      'ROUND_AV',
      'ROUND_RAPID_FIRE',
      'LEADERBOARD',
      'FINAL_WINNER'
    ],
    default: 'WELCOME'
  },
  welcomeConfig: {
    title: { type: String, default: 'LearnUp Live Quiz Championship' },
    subtitle: {
      type: String,
      default: 'The grand stage battle between the finest minds.\nBuzzer Battle • Audio-Visual Challenge • Rapid Fire'
    },
    badgeText: { type: String, default: 'Ready to Kickoff' },
    showQr: { type: Boolean, default: true },
    showTeams: { type: Boolean, default: true }
  },
  breakConfig: {
    type: {
      type: String,
      enum: ['PRAYER', 'LUNCH', 'INTERMISSION', 'CUSTOM'],
      default: 'INTERMISSION'
    },
    message: { type: String, default: 'Short Intermission' },
    startedAt: { type: Date, default: null },
    durationMinutes: { type: Number, default: 15 }
  },
  currentQuestionIndex: {
    type: Number,
    default: 0
  },
  activeQuestionId: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  questionSubState: {
    isQuestionVisible: { type: Boolean, default: false },
    revealedOptions: [{ type: Number }], // e.g. [0, 1] means A & B are revealed
    areAllOptionsVisible: { type: Boolean, default: false },
    isCountdownActive: { type: Boolean, default: false },
    hasCountdownStarted: { type: Boolean, default: false },
    isCountdownDone: { type: Boolean, default: false },
    isBuzzerOpen: { type: Boolean, default: false },
    buzzerLockedBy: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    selectedOptionIndex: { type: Number, default: null },
    isAnswerLocked: { type: Boolean, default: false },
    isEvaluated: { type: Boolean, default: false },
    isCorrect: { type: Boolean, default: null }
  },
  activeTeamId: {
    type: String,
    default: null
  },
  rapidFireSubState: {
    isActive: { type: Boolean, default: false },
    teamId: { type: String, default: null },
    currentQuestionIndex: { type: Number, default: 0 },
    timerSecondsRemaining: { type: Number, default: 60 },
    totalQuestionsAsked: { type: Number, default: 0 },
    correctAnswersCount: { type: Number, default: 0 },
    wrongAnswersCount: { type: Number, default: 0 },
    passedAnswersCount: { type: Number, default: 0 }
  },
  mediaSubState: {
    isPlaying: { type: Boolean, default: false },
    action: { type: String, default: 'pause' },
    currentTime: { type: Number, default: 0 },
    lastUpdated: { type: Number, default: Date.now }
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.models.EventState || mongoose.model('EventState', EventStateSchema);
