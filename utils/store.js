const crypto = require('crypto');
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
    teamId: 'T-01',
    institution: 'BUFT',
    teamLead: 'Lead Alpha',
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
    teamId: 'T-02',
    institution: 'BUFT',
    teamLead: 'Lead Beta',
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
    teamId: 'T-03',
    institution: 'BUFT',
    teamLead: 'Lead Gamma',
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
    teamId: 'T-04',
    institution: 'BUFT',
    teamLead: 'Lead Delta',
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
    teamId: 'T-05',
    institution: 'BUFT',
    teamLead: 'Lead Epsilon',
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
    teamId: 'T-06',
    institution: 'BUFT',
    teamLead: 'Lead Zeta',
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
  questions: [], // filled by seedQuestionsIfEmpty() at startup
  eventState: {
    eventId: 'learnup-live-event-2026',
    currentStage: 'WELCOME',
    welcomeConfig: {
      title: 'LearnUp Live Quiz Championship',
      subtitle: 'The grand stage battle between the finest minds.\nBuzzer Battle • Audio-Visual Challenge • Rapid Fire',
      badgeText: 'Ready to Kickoff',
      showQr: true,
      showTeams: true
    },
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
    mediaSubState: {
      isPlaying: false,
      action: 'pause',
      currentTime: 0,
      lastUpdated: Date.now()
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
        welcomeConfig: { ...memoryStore.eventState.welcomeConfig, ...(state.welcomeConfig || {}) },
        questionSubState: { ...memoryStore.eventState.questionSubState, ...(state.questionSubState || {}) },
        breakConfig: { ...memoryStore.eventState.breakConfig, ...(state.breakConfig || {}) },
        rapidFireSubState: { ...memoryStore.eventState.rapidFireSubState, ...(state.rapidFireSubState || {}) },
        mediaSubState: { ...memoryStore.eventState.mediaSubState, ...(state.mediaSubState || {}) }
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
    welcomeConfig: updates.welcomeConfig
      ? { ...current.welcomeConfig, ...updates.welcomeConfig }
      : current.welcomeConfig,
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
    welcomeConfig: {
      title: 'LearnUp Live Quiz Championship',
      subtitle: 'The grand stage battle between the finest minds.\nBuzzer Battle • Audio-Visual Challenge • Rapid Fire',
      badgeText: 'Ready to Kickoff',
      showQr: true,
      showTeams: true
    },
    breakConfig: {
      type: 'INTERMISSION',
      message: 'Short Intermission',
      startedAt: null,
      durationMinutes: null
    },
    currentQuestionIndex: 0,
    activeQuestionId: (await getQuestions({ roundType: 'BUZZER' }))[0]?._id || (await getQuestions())[0]?._id || null,
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
function sortQuestions(list) {
  const roundRank = { BUZZER: 0, AUDIO_VISUAL: 1, RAPID_FIRE: 2 };
  return [...list].sort(
    (a, b) => (roundRank[a.roundType] ?? 9) - (roundRank[b.roundType] ?? 9) || (a.order || 0) - (b.order || 0)
  );
}

// With a database, MongoDB is the only source of questions; the in-memory
// list is used only when no database is connected.
async function getQuestions(filter = {}) {
  if (isDbConnected()) {
    try {
      return sortQuestions(await Question.find(filter).lean());
    } catch (err) {
      console.warn('[Store] DB questions read failed:', err.message);
    }
  }

  let list = memoryStore.questions;
  if (filter.roundType) {
    list = list.filter((item) => item.roundType === filter.roundType);
  }
  if (filter.mediaId) {
    list = list.filter((item) => item.mediaId === filter.mediaId);
  }
  return sortQuestions(list);
}

async function getQuestionById(id) {
  if (isDbConnected()) {
    if (!mongoose.isValidObjectId(id)) return null;
    try {
      return await Question.findById(id).lean();
    } catch (err) {
      return null;
    }
  }
  return memoryStore.questions.find((q) => String(q._id) === String(id)) || null;
}

async function nextQuestionOrder(roundType) {
  const list = await getQuestions({ roundType });
  return list.reduce((max, q) => Math.max(max, q.order || 0), 0) + 1;
}

async function createQuestion(data) {
  const doc = { ...data };
  delete doc._id;
  if (!doc.order) doc.order = await nextQuestionOrder(doc.roundType);

  if (isDbConnected()) {
    const created = await Question.create(doc);
    return created.toObject();
  }

  const newQ = { _id: `q_${crypto.randomUUID().slice(0, 8)}`, ...doc, createdAt: new Date(), updatedAt: new Date() };
  memoryStore.questions.push(newQ);
  return newQ;
}

async function updateQuestion(id, updates) {
  const { _id, createdAt, updatedAt, ...safeUpdates } = updates;

  if (isDbConnected()) {
    if (!mongoose.isValidObjectId(id)) return null;
    return Question.findByIdAndUpdate(id, { $set: safeUpdates }, { new: true, runValidators: true }).lean();
  }

  const index = memoryStore.questions.findIndex((q) => String(q._id) === String(id));
  if (index === -1) return null;
  memoryStore.questions[index] = { ...memoryStore.questions[index], ...safeUpdates, updatedAt: new Date() };
  return memoryStore.questions[index];
}

async function deleteQuestion(id) {
  if (isDbConnected()) {
    if (!mongoose.isValidObjectId(id)) return false;
    return Boolean(await Question.findByIdAndDelete(id));
  }

  const before = memoryStore.questions.length;
  memoryStore.questions = memoryStore.questions.filter((q) => String(q._id) !== String(id));
  return memoryStore.questions.length !== before;
}

/**
 * Set the running order of a round to the given id sequence (1, 2, 3, ...)
 */
async function reorderQuestions(roundType, orderedIds) {
  const roundQuestions = await getQuestions({ roundType });
  const known = new Set(roundQuestions.map((q) => String(q._id)));
  const ids = orderedIds.map(String).filter((id) => known.has(id));
  // Questions missing from the list keep their relative order at the end
  roundQuestions.forEach((q) => {
    if (!ids.includes(String(q._id))) ids.push(String(q._id));
  });

  for (const [idx, id] of ids.entries()) {
    await updateQuestion(id, { order: idx + 1 });
  }
  return getQuestions({ roundType });
}

async function countQuestionsUsingMedia(mediaId) {
  if (isDbConnected()) {
    return Question.countDocuments({ mediaId });
  }
  return memoryStore.questions.filter((q) => q.mediaId === mediaId).length;
}

/**
 * Delete every question in a round; returns how many were removed
 */
async function deleteQuestionsByRound(roundType) {
  if (isDbConnected()) {
    const result = await Question.deleteMany({ roundType });
    return result.deletedCount || 0;
  }

  const before = memoryStore.questions.length;
  memoryStore.questions = memoryStore.questions.filter((q) => q.roundType !== roundType);
  return before - memoryStore.questions.length;
}

async function bulkCreateQuestions(questionsArray) {
  const created = [];
  for (const q of questionsArray) {
    created.push(await createQuestion(q));
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

async function getTeamByIdentifier(identifier) {
  if (!identifier) return null;
  const idStr = String(identifier).trim();
  const num = Number(idStr);

  if (isDbConnected()) {
    try {
      const orConditions = [
        { teamId: { $regex: new RegExp(`^${idStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
      ];
      if (Number.isInteger(num)) {
        orConditions.push({ teamNumber: num });
      }
      if (mongoose.isValidObjectId(idStr)) {
        orConditions.push({ _id: idStr });
      }
      const t = await Team.findOne({ $or: orConditions }).lean();
      if (t) return t;
    } catch (err) {}
  }

  // Fallback to memory store
  return memoryStore.teams.find((t) => {
    if (t.teamId && t.teamId.toLowerCase() === idStr.toLowerCase()) return true;
    if (Number.isInteger(num) && Number(t.teamNumber) === num) return true;
    if (String(t._id) === idStr) return true;
    return false;
  });
}

async function createTeam(data) {
  let created = null;
  const num = Number(data.teamNumber);
  const teamIdCode = data.teamId ? String(data.teamId).trim() : `T-${String(num).padStart(2, '0')}`;
  const institution = data.institution ? String(data.institution).trim() : '';
  const teamLead = data.teamLead ? String(data.teamLead).trim() : '';

  if (isDbConnected()) {
    try {
      created = await Team.create({
        teamName: data.teamName,
        teamNumber: num,
        teamId: teamIdCode,
        institution,
        teamLead,
        pin: String(data.pin)
      });
    } catch (err) {
      console.warn('[Store] DB team create failed:', err.message);
    }
  }

  const newTeam = {
    _id: created ? String(created._id) : (data._id || 'team_' + Date.now()),
    teamName: data.teamName,
    teamNumber: num,
    teamId: teamIdCode,
    institution,
    teamLead,
    pin: String(data.pin),
    score: 0,
    roundScores: { buzzer: 0, audioVisual: 0, rapidFire: 0 },
    activeSessionToken: null,
    socketId: null,
    isConnected: false,
    createdAt: new Date()
  };

  const existingIndex = memoryStore.teams.findIndex(
    (t) => String(t._id) === String(newTeam._id) || Number(t.teamNumber) === Number(newTeam.teamNumber)
  );
  if (existingIndex !== -1) {
    memoryStore.teams[existingIndex] = newTeam;
  } else {
    memoryStore.teams.push(newTeam);
  }
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
    if (process.env.ADMIN_PASSWORD) {
      // .env is the source of truth for the admin login: create the account,
      // or reset its password to match after ADMIN_PASSWORD is changed
      await Admin.findOneAndUpdate(
        { username: DEFAULT_ADMIN_USERNAME },
        { username: DEFAULT_ADMIN_USERNAME, password: hashPassword(DEFAULT_ADMIN_PASSWORD), role: 'SUPER_ADMIN' },
        { upsert: true, new: true }
      );
      console.log(`✅ [Seed] Admin account ensured from .env: ${DEFAULT_ADMIN_USERNAME}`);
    } else if ((await Admin.countDocuments()) === 0) {
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
    } else {
      // Teams created before Team IDs existed get one (T-01, T-02, ...)
      const missingIds = await Team.find({ $or: [{ teamId: { $exists: false } }, { teamId: '' }] });
      for (const t of missingIds) {
        t.teamId = `T-${String(t.teamNumber).padStart(2, '0')}`;
        await t.save();
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
  deleteQuestionsByRound,
  bulkCreateQuestions,
  reorderQuestions,
  countQuestionsUsingMedia,
  loadCodebaseQuestions,
  SEED_QUESTIONS,
  getTeams,
  getTeamById,
  getTeamByNumber,
  getTeamByIdentifier,
  createTeam,
  updateTeam,
  deleteTeam,
  adjustTeamScore,
  resetAllTeamScores,
  seedDatabaseIfEmpty
};
