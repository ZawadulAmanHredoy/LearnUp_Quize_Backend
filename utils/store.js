const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Team = require('../models/Team');
const Question = require('../models/Question');
const EventState = require('../models/EventState');
const { hashPassword } = require('./auth');

const QUESTIONS_JSON_PATH = path.join(__dirname, '../data/questions.json');
const DEFAULT_ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin').toLowerCase().trim();
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function loadCodebaseQuestions() {
  try {
    if (fs.existsSync(QUESTIONS_JSON_PATH)) {
      return JSON.parse(fs.readFileSync(QUESTIONS_JSON_PATH, 'utf8'));
    }
  } catch (err) {
    console.warn('[Store] Could not read data/questions.json:', err.message);
  }
  return null;
}

// Seed Questions across all 3 rounds
const SEED_QUESTIONS = [
  // ROUND 1: BUZZER BATTLE
  {
    _id: 'q_buzzer_1',
    roundType: 'BUZZER',
    order: 1,
    questionText: 'What is the primary protocol that enables full-duplex, bi-directional real-time communication between browser and server?',
    mediaType: 'NONE',
    mediaUrl: null,
    options: [
      { label: 'A', text: 'HTTP/1.1 Short Polling' },
      { label: 'B', text: 'WebSocket Protocol' },
      { label: 'C', text: 'FTP Data Tunnel' },
      { label: 'D', text: 'SMTP Mail Socket' }
    ],
    correctOptionIndex: 1, // B
    points: 10,
    negativePoints: 5,
    timeLimitSeconds: 30,
    explanation: 'WebSockets provide persistent, low-latency, full-duplex communication over a single TCP connection.'
  },
  {
    _id: 'q_buzzer_2',
    roundType: 'BUZZER',
    order: 2,
    questionText: 'In React 18, which core architectural mechanism allows non-blocking UI rendering and state transitions?',
    mediaType: 'NONE',
    mediaUrl: null,
    options: [
      { label: 'A', text: 'Concurrent Rendering' },
      { label: 'B', text: 'Virtual DOM Freeze' },
      { label: 'C', text: 'Synchronous Fiber Loop' },
      { label: 'D', text: 'DOM Mutation Observer' }
    ],
    correctOptionIndex: 0, // A
    points: 10,
    negativePoints: 5,
    timeLimitSeconds: 30,
    explanation: 'Concurrent rendering in React 18 allows React to interrupt, pause, or abandon a render to keep the screen responsive.'
  },
  {
    _id: 'q_buzzer_3',
    roundType: 'BUZZER',
    order: 3,
    questionText: 'Which CSS property provides optimal hardware acceleration for smooth 60 FPS animations on large displays?',
    mediaType: 'NONE',
    mediaUrl: null,
    options: [
      { label: 'A', text: 'margin-left and top' },
      { label: 'B', text: 'transform: translate3d()' },
      { label: 'C', text: 'float: left with clear' },
      { label: 'D', text: 'position: absolute' }
    ],
    correctOptionIndex: 1, // B
    points: 10,
    negativePoints: 5,
    timeLimitSeconds: 30,
    explanation: 'translate3d triggers GPU compositing, bypassing costly browser repaint and reflow cycles.'
  },
  {
    _id: 'q_buzzer_4',
    roundType: 'BUZZER',
    order: 4,
    questionText: 'What is the default port number used by MongoDB service on localhost?',
    mediaType: 'NONE',
    mediaUrl: null,
    options: [
      { label: 'A', text: '3000' },
      { label: 'B', text: '5432' },
      { label: 'C', text: '27017' },
      { label: 'D', text: '8080' }
    ],
    correctOptionIndex: 2, // C
    points: 10,
    negativePoints: 5,
    timeLimitSeconds: 30,
    explanation: 'MongoDB listens on port 27017 by default.'
  },

  // ROUND 2: AUDIO-VISUAL (AV)
  {
    _id: 'q_av_1',
    roundType: 'AUDIO_VISUAL',
    order: 1,
    questionText: 'Watch the audio-visual presentation: Which foundational tech company created the JavaScript programming language in 1995?',
    mediaType: 'VIDEO',
    mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    options: [
      { label: 'A', text: 'Microsoft Corporation' },
      { label: 'B', text: 'Netscape Communications' },
      { label: 'C', text: 'Sun Microsystems' },
      { label: 'D', text: 'Bell Laboratories' }
    ],
    correctOptionIndex: 1, // B
    points: 15,
    negativePoints: 0,
    timeLimitSeconds: 45,
    explanation: 'Brendan Eich created JavaScript at Netscape in May 1995.'
  },
  {
    _id: 'q_av_2',
    roundType: 'AUDIO_VISUAL',
    order: 2,
    questionText: 'Listen to the synthesized audio track: What was the name of the first computer virus created in 1971?',
    mediaType: 'AUDIO',
    mediaUrl: 'https://actions.google.com/sounds/v1/science_fiction/alien_pulsar_beaming.ogg',
    options: [
      { label: 'A', text: 'ILOVEYOU' },
      { label: 'B', text: 'Creeper Virus' },
      { label: 'C', text: 'Morris Worm' },
      { label: 'D', text: 'Stuxnet' }
    ],
    correctOptionIndex: 1, // B
    points: 15,
    negativePoints: 0,
    timeLimitSeconds: 45,
    explanation: 'The Creeper program was written by Bob Thomas at BBN in 1971 on ARPANET.'
  },

  // ROUND 3: RAPID FIRE
  {
    _id: 'q_rf_1',
    roundType: 'RAPID_FIRE',
    order: 1,
    questionText: 'What does HTML stand for?',
    mediaType: 'NONE',
    mediaUrl: null,
    options: [
      { label: 'A', text: 'HyperText Markup Language' },
      { label: 'B', text: 'High Tech Modern Language' },
      { label: 'C', text: 'Hyper Transfer Machine Link' },
      { label: 'D', text: 'Home Tooling Mark Layer' }
    ],
    correctOptionIndex: 0,
    points: 1,
    negativePoints: 0,
    timeLimitSeconds: 10,
    explanation: 'HyperText Markup Language'
  },
  {
    _id: 'q_rf_2',
    roundType: 'RAPID_FIRE',
    order: 2,
    questionText: 'Which data structure follows the First-In First-Out (FIFO) principle?',
    mediaType: 'NONE',
    mediaUrl: null,
    options: [
      { label: 'A', text: 'Stack' },
      { label: 'B', text: 'Queue' },
      { label: 'C', text: 'Binary Tree' },
      { label: 'D', text: 'Hash Table' }
    ],
    correctOptionIndex: 1,
    points: 1,
    negativePoints: 0,
    timeLimitSeconds: 10,
    explanation: 'A Queue operates under FIFO.'
  },
  {
    _id: 'q_rf_3',
    roundType: 'RAPID_FIRE',
    order: 3,
    questionText: 'What is the time complexity of looking up a key in a well-distributed Hash Map?',
    mediaType: 'NONE',
    mediaUrl: null,
    options: [
      { label: 'A', text: 'O(1) Constant Time' },
      { label: 'B', text: 'O(log n)' },
      { label: 'C', text: 'O(n) Linear Time' },
      { label: 'D', text: 'O(n²)' }
    ],
    correctOptionIndex: 0,
    points: 1,
    negativePoints: 0,
    timeLimitSeconds: 10,
    explanation: 'Hash map lookups are average O(1).'
  },
  {
    _id: 'q_rf_4',
    roundType: 'RAPID_FIRE',
    order: 4,
    questionText: 'In Git, what command creates and switches to a new branch simultaneously?',
    mediaType: 'NONE',
    mediaUrl: null,
    options: [
      { label: 'A', text: 'git checkout -b <name>' },
      { label: 'B', text: 'git branch --new' },
      { label: 'C', text: 'git merge --switch' },
      { label: 'D', text: 'git push -u' }
    ],
    correctOptionIndex: 0,
    points: 1,
    negativePoints: 0,
    timeLimitSeconds: 10,
    explanation: 'git checkout -b creates and checks out the new branch.'
  },
  {
    _id: 'q_rf_5',
    roundType: 'RAPID_FIRE',
    order: 5,
    questionText: 'Which HTTP status code signifies "No Content" on successful deletion?',
    mediaType: 'NONE',
    mediaUrl: null,
    options: [
      { label: 'A', text: '200 OK' },
      { label: 'B', text: '201 Created' },
      { label: 'C', text: '204 No Content' },
      { label: 'D', text: '404 Not Found' }
    ],
    correctOptionIndex: 2,
    points: 1,
    negativePoints: 0,
    timeLimitSeconds: 10,
    explanation: '204 indicates the server processed the request without returning an entity-body.'
  }
];

// Seed Teams
const SEED_TEAMS = [
  {
    _id: 'team_1',
    teamName: 'Team Alpha (Titans)',
    teamNumber: 1,
    pin: '1001',
    score: 0,
    roundScores: { buzzer: 0, audioVisual: 0, rapidFire: 0 },
    activeSessionToken: null,
    socketId: null,
    isConnected: false
  },
  {
    _id: 'team_2',
    teamName: 'Team Beta (Vipers)',
    teamNumber: 2,
    pin: '1002',
    score: 0,
    roundScores: { buzzer: 0, audioVisual: 0, rapidFire: 0 },
    activeSessionToken: null,
    socketId: null,
    isConnected: false
  },
  {
    _id: 'team_3',
    teamName: 'Team Gamma (Hawks)',
    teamNumber: 3,
    pin: '1003',
    score: 0,
    roundScores: { buzzer: 0, audioVisual: 0, rapidFire: 0 },
    activeSessionToken: null,
    socketId: null,
    isConnected: false
  },
  {
    _id: 'team_4',
    teamName: 'Team Delta (Cyber)',
    teamNumber: 4,
    pin: '1004',
    score: 0,
    roundScores: { buzzer: 0, audioVisual: 0, rapidFire: 0 },
    activeSessionToken: null,
    socketId: null,
    isConnected: false
  },
  {
    _id: 'team_5',
    teamName: 'Team Epsilon (Quantum)',
    teamNumber: 5,
    pin: '1005',
    score: 0,
    roundScores: { buzzer: 0, audioVisual: 0, rapidFire: 0 },
    activeSessionToken: null,
    socketId: null,
    isConnected: false
  },
  {
    _id: 'team_6',
    teamName: 'Team Zeta (Falcons)',
    teamNumber: 6,
    pin: '1006',
    score: 0,
    roundScores: { buzzer: 0, audioVisual: 0, rapidFire: 0 },
    activeSessionToken: null,
    socketId: null,
    isConnected: false
  }
];

// In-Memory Master Store
const memoryStore = {
  admin: {
    _id: 'admin_master',
    username: DEFAULT_ADMIN_USERNAME,
    password: hashPassword(DEFAULT_ADMIN_PASSWORD),
    role: 'SUPER_ADMIN'
  },
  teams: JSON.parse(JSON.stringify(SEED_TEAMS)),
  questions: loadCodebaseQuestions() || JSON.parse(JSON.stringify(SEED_QUESTIONS)),
  eventState: {
    eventId: 'learnup-live-event-2026',
    currentStage: 'WELCOME',
    breakConfig: {
      type: 'INTERMISSION',
      message: 'Short Intermission — The quiz will resume shortly.',
      startedAt: null,
      durationMinutes: 15
    },
    currentQuestionIndex: 0,
    activeQuestionId: 'q_buzzer_1',
    questionSubState: {
      isQuestionVisible: false,
      revealedOptions: [],
      areAllOptionsVisible: false,
      isCountdownActive: false,
      isBuzzerOpen: false,
      buzzerLockedBy: null,
      selectedOptionIndex: null,
      isAnswerLocked: false,
      isEvaluated: false,
      isCorrect: null
    },
    activeTeamId: null,
    rapidFireSubState: {
      isActive: false,
      teamId: null,
      currentQuestionIndex: 0,
      timerSecondsRemaining: 60,
      totalQuestionsAsked: 0,
      correctAnswersCount: 0,
      wrongAnswersCount: 0,
      passedAnswersCount: 0
    },
    lastUpdated: new Date()
  }
};

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

// -------------------------------------------------------------
// EVENT STATE OPERATIONS
// -------------------------------------------------------------
const EVENT_ID = 'learnup-live-event-2026';
let isEventStateHydrated = false;
let dbWriteChain = Promise.resolve();

function stripMongoMeta(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return rest;
}

/**
 * Load the persisted EventState into memory. Memory is the live copy that
 * every handler reads; MongoDB is the write-through backup (ADR-004).
 */
async function hydrateEventState() {
  if (!isDbConnected()) return memoryStore.eventState;
  try {
    const state = await EventState.findOne({ eventId: EVENT_ID }).lean();
    if (state) {
      memoryStore.eventState = {
        ...memoryStore.eventState,
        ...stripMongoMeta(state),
        questionSubState: { ...memoryStore.eventState.questionSubState, ...(state.questionSubState || {}) },
        breakConfig: { ...memoryStore.eventState.breakConfig, ...(state.breakConfig || {}) },
        rapidFireSubState: { ...memoryStore.eventState.rapidFireSubState, ...(state.rapidFireSubState || {}) }
      };
    } else {
      await EventState.create(memoryStore.eventState);
    }
    isEventStateHydrated = true;
  } catch (err) {
    console.warn('[Store] Could not load EventState from DB, using memory state:', err.message);
  }
  return memoryStore.eventState;
}

function peekEventState() {
  return memoryStore.eventState;
}

async function getEventState() {
  if (isDbConnected() && !isEventStateHydrated) {
    await hydrateEventState();
  }
  return memoryStore.eventState;
}

/**
 * Persist the full current state. Writes are chained so they reach MongoDB
 * in the same order the changes happened.
 */
function persistEventState() {
  if (!isDbConnected()) return dbWriteChain;
  const snapshot = { ...memoryStore.eventState };
  dbWriteChain = dbWriteChain
    .then(() =>
      EventState.findOneAndUpdate({ eventId: EVENT_ID }, { $set: snapshot }, { upsert: true })
    )
    .catch((err) => {
      console.warn('[Store] DB write failed:', err.message);
    });
  return dbWriteChain;
}

/**
 * Merge updates into the live state. The in-memory merge happens
 * synchronously, so callers can rely on it before the DB write finishes.
 */
function updateEventState(updates) {
  const current = memoryStore.eventState;
  memoryStore.eventState = {
    ...current,
    ...updates,
    questionSubState: updates.questionSubState
      ? { ...current.questionSubState, ...updates.questionSubState }
      : current.questionSubState,
    breakConfig: updates.breakConfig
      ? { ...current.breakConfig, ...updates.breakConfig }
      : current.breakConfig,
    rapidFireSubState: updates.rapidFireSubState
      ? { ...current.rapidFireSubState, ...updates.rapidFireSubState }
      : current.rapidFireSubState,
    lastUpdated: new Date()
  };

  const state = memoryStore.eventState;
  return persistEventState().then(() => state);
}

async function resetEventState() {
  const freshState = {
    eventId: 'learnup-live-event-2026',
    currentStage: 'WELCOME',
    breakConfig: {
      type: 'INTERMISSION',
      message: 'Short Intermission',
      startedAt: null,
      durationMinutes: 15
    },
    currentQuestionIndex: 0,
    activeQuestionId: (await getQuestions())[0]?._id || null,
    questionSubState: {
      isQuestionVisible: false,
      revealedOptions: [],
      areAllOptionsVisible: false,
      isCountdownActive: false,
      isBuzzerOpen: false,
      buzzerLockedBy: null,
      selectedOptionIndex: null,
      isAnswerLocked: false,
      isEvaluated: false,
      isCorrect: null
    },
    activeTeamId: null,
    rapidFireSubState: {
      isActive: false,
      teamId: null,
      currentQuestionIndex: 0,
      timerSecondsRemaining: 60,
      totalQuestionsAsked: 0,
      correctAnswersCount: 0,
      wrongAnswersCount: 0,
      passedAnswersCount: 0
    },
    lastUpdated: new Date()
  };

  memoryStore.eventState = freshState;
  await persistEventState();

  return freshState;
}

// -------------------------------------------------------------
// QUESTION OPERATIONS
// -------------------------------------------------------------
async function getQuestions(filter = {}) {
  if (isDbConnected()) {
    try {
      const q = await Question.find(filter).sort({ roundType: 1, order: 1 }).lean();
      if (q && q.length > 0) return q;
    } catch (err) {
      console.warn('[Store] DB questions read failed:', err.message);
    }
  }

  let list = memoryStore.questions;
  if (filter.roundType) {
    list = list.filter((item) => item.roundType === filter.roundType);
  }
  return list.sort((a, b) => (a.order || 0) - (b.order || 0));
}

async function getQuestionById(id) {
  if (isDbConnected() && mongoose.isValidObjectId(id)) {
    try {
      const q = await Question.findById(id).lean();
      if (q) return q;
    } catch (err) {}
  }
  return memoryStore.questions.find((q) => String(q._id) === String(id)) || null;
}

async function createQuestion(data) {
  const newQ = {
    _id: data._id || 'q_' + Date.now(),
    ...data,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  memoryStore.questions.push(newQ);

  if (isDbConnected()) {
    try {
      return await Question.create(data);
    } catch (err) {
      console.warn('[Store] DB question create failed:', err.message);
    }
  }

  return newQ;
}

async function updateQuestion(id, updates) {
  const { _id, createdAt, ...safeUpdates } = updates;
  const index = memoryStore.questions.findIndex((q) => String(q._id) === String(id));
  if (index !== -1) {
    memoryStore.questions[index] = {
      ...memoryStore.questions[index],
      ...safeUpdates,
      updatedAt: new Date()
    };
  }

  if (isDbConnected() && mongoose.isValidObjectId(id)) {
    try {
      const updated = await Question.findByIdAndUpdate(
        id,
        { $set: safeUpdates },
        { new: true, runValidators: true }
      ).lean();
      if (updated) return updated;
    } catch (err) {
      console.warn('[Store] DB question update failed:', err.message);
      throw err;
    }
  }

  return index !== -1 ? memoryStore.questions[index] : null;
}

async function deleteQuestion(id) {
  const before = memoryStore.questions.length;
  memoryStore.questions = memoryStore.questions.filter((q) => String(q._id) !== String(id));
  let deleted = memoryStore.questions.length !== before;

  if (isDbConnected() && mongoose.isValidObjectId(id)) {
    try {
      const result = await Question.findByIdAndDelete(id);
      deleted = deleted || Boolean(result);
    } catch (err) {
      console.warn('[Store] DB question delete failed:', err.message);
    }
  }
  return deleted;
}

async function bulkCreateQuestions(questionsArray) {
  const created = [];
  for (const q of questionsArray) {
    const item = await createQuestion(q);
    created.push(item);
  }
  return created;
}

// -------------------------------------------------------------
// TEAM OPERATIONS
// -------------------------------------------------------------
async function getTeams() {
  if (isDbConnected()) {
    try {
      const list = await Team.find().sort({ score: -1, teamNumber: 1 }).lean();
      if (list && list.length > 0) return list;
    } catch (err) {
      console.warn('[Store] DB teams read failed:', err.message);
    }
  }

  return [...memoryStore.teams].sort((a, b) => b.score - a.score || a.teamNumber - b.teamNumber);
}

async function getTeamById(id) {
  if (isDbConnected() && mongoose.isValidObjectId(id)) {
    try {
      const t = await Team.findById(id).lean();
      if (t) return t;
    } catch (err) {}
  }
  return memoryStore.teams.find((t) => String(t._id) === String(id) || String(t.teamNumber) === String(id));
}

async function getTeamByNumber(teamNumber) {
  if (isDbConnected()) {
    try {
      const t = await Team.findOne({ teamNumber: Number(teamNumber) }).lean();
      if (t) return t;
    } catch (err) {}
  }
  return memoryStore.teams.find((t) => Number(t.teamNumber) === Number(teamNumber));
}

async function createTeam(data) {
  let created = null;
  if (isDbConnected()) {
    try {
      created = await Team.create({
        teamName: data.teamName,
        teamNumber: Number(data.teamNumber),
        pin: String(data.pin)
      });
    } catch (err) {
      console.warn('[Store] DB team create failed:', err.message);
    }
  }

  const newTeam = {
    _id: created ? String(created._id) : (data._id || 'team_' + Date.now()),
    teamName: data.teamName,
    teamNumber: Number(data.teamNumber),
    pin: String(data.pin),
    score: 0,
    roundScores: { buzzer: 0, audioVisual: 0, rapidFire: 0 },
    activeSessionToken: null,
    socketId: null,
    isConnected: false,
    createdAt: new Date()
  };

  memoryStore.teams.push(newTeam);
  return created ? created.toObject() : newTeam;
}

async function deleteTeam(id) {
  memoryStore.teams = memoryStore.teams.filter(
    (t) => String(t._id) !== String(id) && String(t.teamNumber) !== String(id)
  );

  if (isDbConnected()) {
    try {
      if (mongoose.isValidObjectId(id)) {
        await Team.findByIdAndDelete(id);
      } else {
        await Team.deleteOne({ teamNumber: Number(id) });
      }
    } catch (err) {
      console.warn('[Store] DB team delete failed:', err.message);
    }
  }
  return true;
}

async function updateTeam(id, updates) {
  const teamIndex = memoryStore.teams.findIndex(
    (t) => String(t._id) === String(id) || String(t.teamNumber) === String(id)
  );

  if (teamIndex !== -1) {
    memoryStore.teams[teamIndex] = {
      ...memoryStore.teams[teamIndex],
      ...updates
    };
  }

  if (isDbConnected() && mongoose.isValidObjectId(id)) {
    try {
      return await Team.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
    } catch (err) {
      console.warn('[Store] DB team update failed:', err.message);
    }
  }

  return memoryStore.teams[teamIndex];
}

const ROUND_SCORE_KEYS = {
  ROUND_BUZZER: 'buzzer',
  BUZZER: 'buzzer',
  buzzer: 'buzzer',
  ROUND_AV: 'audioVisual',
  AUDIO_VISUAL: 'audioVisual',
  audioVisual: 'audioVisual',
  ROUND_RAPID_FIRE: 'rapidFire',
  RAPID_FIRE: 'rapidFire',
  rapidFire: 'rapidFire'
};

/**
 * Add (or subtract) points from a team. Totals may go negative so the
 * negative-marking penalty always applies (Rules.md §2.3).
 * Uses $inc so rapid consecutive updates can't overwrite each other.
 */
async function adjustTeamScore(teamId, pointsChange, roundType = 'buzzer') {
  const roundKey = ROUND_SCORE_KEYS[roundType];
  const memTeam = memoryStore.teams.find(
    (t) => String(t._id) === String(teamId) || String(t.teamNumber) === String(teamId)
  );
  if (memTeam) {
    memTeam.score = (memTeam.score || 0) + pointsChange;
    memTeam.roundScores = { buzzer: 0, audioVisual: 0, rapidFire: 0, ...(memTeam.roundScores || {}) };
    if (roundKey) memTeam.roundScores[roundKey] += pointsChange;
  }

  if (isDbConnected() && mongoose.isValidObjectId(teamId)) {
    try {
      const inc = { score: pointsChange };
      if (roundKey) inc[`roundScores.${roundKey}`] = pointsChange;
      const updated = await Team.findByIdAndUpdate(teamId, { $inc: inc }, { new: true }).lean();
      if (updated) return updated;
    } catch (err) {
      console.warn('[Store] DB score update failed:', err.message);
    }
  }

  return memTeam || null;
}

async function resetAllTeamScores() {
  memoryStore.teams.forEach((t) => {
    t.score = 0;
    t.roundScores = { buzzer: 0, audioVisual: 0, rapidFire: 0 };
  });

  if (isDbConnected()) {
    try {
      await Team.updateMany({}, {
        $set: {
          score: 0,
          roundScores: { buzzer: 0, audioVisual: 0, rapidFire: 0 }
        }
      });
    } catch (err) {
      console.warn('[Store] DB score reset failed:', err.message);
    }
  }

  return memoryStore.teams;
}

// -------------------------------------------------------------
// SEEDING INITIAL DATA INTO DB
// -------------------------------------------------------------
async function seedDatabaseIfEmpty() {
  if (!isDbConnected()) return;

  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      await Admin.create({
        username: DEFAULT_ADMIN_USERNAME,
        password: hashPassword(DEFAULT_ADMIN_PASSWORD),
        role: 'SUPER_ADMIN'
      });
      console.log(`✅ [Seed] Default Admin created: ${DEFAULT_ADMIN_USERNAME}`);
    }

    const teamCount = await Team.countDocuments();
    if (teamCount === 0) {
      for (const t of SEED_TEAMS) {
        const { _id, ...teamDoc } = t;
        await Team.create(teamDoc);
      }
      console.log('✅ [Seed] Default Teams created (Alpha to Zeta)');
    }

    // Synchronize questions from codebase questions.json
    const fileQuestions = loadCodebaseQuestions();
    if (fileQuestions) {
      try {
        for (const q of fileQuestions) {
          const { _id, ...qDoc } = q;
          await Question.findOneAndUpdate(
            { roundType: q.roundType, order: q.order },
            { $set: qDoc },
            { upsert: true, new: true }
          );
        }
        console.log('✅ [Seed] Questions synchronized with codebase questions.json');
      } catch (err) {
        console.warn('[Seed] Could not sync questions from file:', err.message);
      }
    } else {
      const questionCount = await Question.countDocuments();
      if (questionCount === 0) {
        for (const q of SEED_QUESTIONS) {
          const { _id, ...qDoc } = q;
          await Question.create(qDoc);
        }
        console.log('✅ [Seed] Default Questions created across all rounds');
      }
    }

    await hydrateEventState();
  } catch (err) {
    console.warn('[Store] DB seed notice:', err.message);
  }
}


module.exports = {
  isDbConnected,
  memoryStore,
  getEventState,
  peekEventState,
  hydrateEventState,
  updateEventState,
  resetEventState,
  getQuestions,
  getQuestionById,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  bulkCreateQuestions,
  getTeams,
  getTeamById,
  getTeamByNumber,
  createTeam,
  updateTeam,
  deleteTeam,
  adjustTeamScore,
  resetAllTeamScores,
  seedDatabaseIfEmpty
};
