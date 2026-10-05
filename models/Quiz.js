const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Question text is required'],
    trim: true
  },
  options: [{
    type: String,
    required: true,
    trim: true
  }],
  correctOptionIndex: {
    type: Number,
    required: true,
    min: 0
  },
  points: {
    type: Number,
    default: 100
  },
  timeLimitSeconds: {
    type: Number,
    default: 30
  }
});

const quizSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Quiz title is required'],
      trim: true,
      maxlength: 120
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500
    },
    code: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
      sparse: true
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'completed'],
      default: 'draft'
    },
    questions: [questionSchema]
  },
  {
    timestamps: true
  }
);

quizSchema.index({ status: 1 });

const Quiz = mongoose.model('Quiz', quizSchema);

module.exports = Quiz;
