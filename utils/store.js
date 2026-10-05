const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Team = require('../models/Team');
const Question = require('../models/Question');
const EventState = require('../models/EventState');
const { hashPassword } = require('./auth');

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
    username: 'admin',
    password: hashPassword('admin123'),
    role: 'SUPER_ADMIN'
  },
  teams: JSON.parse(JSON.stringify(SEED_TEAMS)),
  questions: JSON.parse(JSON.stringify(SEED_QUESTIONS)),
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
async function getEventState() {
  if (isDbConnected()) {
    try {
      let state = await EventState.findOne({ eventId: 'learnup-live-event-2026' }).lean();
      if (!state) {
        state = await EventState.create(memoryStore.eventState);
      }
      return state;
    } catch (err) {
      console.warn('[Store] DB read failed, using memory state:', err.message);
    }
  }
  return memoryStore.eventState;
}

async function updateEventState(updates) {
  const mergedQuestionSubState = updates.questionSubState
    ? { ...memoryStore.eventState.questionSubState, ...updates.questionSubState }
    : memoryStore.eventState.questionSubState;

  const mergedBreakConfig = updates.breakConfig
    ? { ...memoryStore.eventState.breakConfig, ...updates.breakConfig }
    : memoryStore.eventState.breakConfig;

  const mergedRapidFireSubState = updates.rapidFireSubState
    ? { ...memoryStore.eventState.rapidFireSubState, ...updates.rapidFireSubState }
    : memoryStore.eventState.rapidFireSubState;

  memoryStore.eventState = {
    ...memoryStore.eventState,
    ...updates,
    questionSubState: mergedQuestionSubState,
    breakConfig: mergedBreakConfig,
    rapidFireSubState: mergedRapidFireSubState,
    lastUpdated: new Date()
  };

  if (isDbConnected()) {
    try {
      const dbUpdates = {
        ...updates,
        ...(updates.questionSubState ? { questionSubState: mergedQuestionSubState } : {}),
        ...(updates.breakConfig ? { breakConfig: mergedBreakConfig } : {}),
        ...(updates.rapidFireSubState ? { rapidFireSubState: mergedRapidFireSubState } : {}),
        lastUpdated: new Date()
      };
      await EventState.findOneAndUpdate(
        { eventId: 'learnup-live-event-2026' },
        { $set: dbUpdates },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.warn('[Store] DB write failed:', err.message);
    }
  }

  return memoryStore.eventState;
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
    activeQuestionId: memoryStore.questions[0]?._id || null,
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
      timerSecondsRemaining: 60,
      totalQuestionsAsked: 0,
      correctAnswersCount: 0,
      wrongAnswersCount: 0,
      passedAnswersCount: 0
    },
    lastUpdated: new Date()
  };

  memoryStore.eventState = freshState;

  if (isDbConnected()) {
    try {
      await EventState.findOneAndUpdate(
        { eventId: 'learnup-live-event-2026' },
        { $set: freshState },
        { upsert: true }
      );
    } catch (err) {
      console.warn('[Store] DB reset failed:', err.message);
    }
  }

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

async function adjustTeamScore(teamId, pointsChange, roundType = 'buzzer') {
  const team = await getTeamById(teamId);
  if (!team) return null;

  const newScore = Math.max(0, (team.score || 0) + pointsChange);
  const roundScores = { ...(team.roundScores || { buzzer: 0, audioVisual: 0, rapidFire: 0 }) };

  if (roundType === 'ROUND_BUZZER' || roundType === 'BUZZER' || roundType === 'buzzer') {
    roundScores.buzzer = Math.max(0, (roundScores.buzzer || 0) + pointsChange);
  } else if (roundType === 'ROUND_AV' || roundType === 'AUDIO_VISUAL' || roundType === 'audioVisual') {
    roundScores.audioVisual = Math.max(0, (roundScores.audioVisual || 0) + pointsChange);
  } else if (roundType === 'ROUND_RAPID_FIRE' || roundType === 'RAPID_FIRE' || roundType === 'rapidFire') {
    roundScores.rapidFire = Math.max(0, (roundScores.rapidFire || 0) + pointsChange);
  }

  return await updateTeam(team._id, { score: newScore, roundScores });
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
        username: 'admin',
        password: hashPassword('admin123'),
        role: 'SUPER_ADMIN'
      });
      console.log('✅ [Seed] Default Admin created: admin / admin123');
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
    const jsonPath = path.join(__dirname, '../data/questions.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const fileQuestions = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
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

    const stateCount = await EventState.countDocuments();
    if (stateCount === 0) {
      const firstQ = await Question.findOne();
      const stateToSeed = {
        ...memoryStore.eventState,
        activeQuestionId: firstQ ? String(firstQ._id) : null
      };
      await EventState.create(stateToSeed);
      console.log('✅ [Seed] Initial EventState created in MongoDB Atlas');
    }
  } catch (err) {
    console.warn('[Store] DB seed notice:', err.message);
  }
}

// Listen to mongoose connected event to seed, or run immediately if already connected
if (mongoose.connection.readyState === 1) {
  seedDatabaseIfEmpty();
}
mongoose.connection.on('connected', () => {
  seedDatabaseIfEmpty();
});

module.exports = {
  isDbConnected,
  memoryStore,
  getEventState,
  updateEventState,
  resetEventState,
  getQuestions,
  getQuestionById,
  createQuestion,
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
