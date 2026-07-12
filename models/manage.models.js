const mongoose = require('mongoose');
const { toIndianTime } = require('../utils/dateFormatter');

// Reusable date type definitions for Indian timezone formatting
const IndianDate = { type: String, default: () => toIndianTime(new Date()) };
const NullableIndianDate = { type: String, default: null };

// ── CALENDAR DAY Schema ───────────────────────────────
const CalendarDaySchema = new mongoose.Schema({
  CalendarTrackId    : { type: String, required: true, unique: true},
  date         : { type: Date, required: true, unique: true },
  month        : { type: String, default: '' },
  year         : { type: String, default: '' },
  day          : { type: String, 
    enum: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], 
    required: true },
  details: [{
    year     : { type: String, enum: ['I', 'II', 'III', 'IV'] },
    dayType  : { type: String, enum: ['working','holiday','exam','half-day'], default: 'working'},
    comments : { type: String, default: '', trim: true },
    timing   : { start : { type: String, default: '08:30' }, end: { type: String, default: '16:30' }},
  }],
  createdBy    : { type: String, default: '' },
  createdAt    : { type: Date, default: Date.now },
  history: [{
    updatedBy    : { type: String, default: '' },
    updatedAt    : { type: Date, default: null},
    field        : { type: String, default: '' },
    oldValue     : { type: String, default: '' },
    newValue     : { type: String, default: '' },
  }],
  isFinalized   : { type: Boolean, default: false },
  finalizedBy   : { type: String, default: null },
  finalizedAt   : { type: Date, default: null },
});

// ── EXAM Schema ───────────────────────────────────────
const ExamSchema = new mongoose.Schema({
  ExamTrackId      : { type: String, required: true, unique: true},
  batch        : { type: String, required: true },
  academicYear : { type: String, default: '' },
  semester     : { type: String, enum: ['I','II','III','IV', 'V', 'VI', 'VII', 'VIII'], required: true },
  deptName     : { type: String, default: '' },
  examType     : { type: String, enum: ['Internal 1','Internal 2','Practicals','Semester'], required: true },
  title        : { type: String, required: true, trim: true },
  Dates        : { type: [String], required: true },
  timing       : { start : { type: String, default: '09:30' }, end: { type: String, default: '12:30' } },
  notes        : { type: String, default: '' },
  status       : { type: String, enum: ['upcoming','ongoing','completed','cancelled'], default: 'upcoming' },
  createdBy    : { type: String, default: '' },
  createdAt    : { type: Date, default: Date.now },
  history: [{
    updatedBy    : { type: String, default: '' },
    updatedAt    : { type: Date, default: null},
    field        : { type: String, default: '' },
    oldValue     : { type: String, default: '' },
    newValue     : { type: String, default: '' },  
  }],
  isFinalized  : { type: Boolean, default: false },
  finalizedBy  : { type: String, default: null },
  finalizedAt  : { type: Date, default: null },
});

// ── MANAGE ADMIN Schema ───────────────────────────────
const ManageAdminSchema = new mongoose.Schema({
  trackId    : { type: String, required: true, unique: true},
  role       : { type: String, enum: ['admin','teacher']},
  permissions: { type: [String], default: ['calendar','exam','attendance'] },
  addedBy    : { type: String, required: true },
  createdAt  : { type: Date, default: Date.now },
  status     : { type: String, enum: ['active','inactive'], default: 'active' },
});

// ── YEAR Schema ───────────────────────────────────────
const YearSchema = new mongoose.Schema({
  academicYear : { type: String, required: true, unique: true, trim: true },
  batches: [{
    batchTrackId : { type: String, required: true, trim: true },
    batch        : { type: String, required: true, trim: true },
    currentYear  : { type: String, enum: ['I', 'II', 'III', 'IV'], required: true },
    currentSem   : { type: String, enum: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'], required: true }
  }],
  createdBy    : { type: String, default: '' },
  createdAt    : { type: Date, default: Date.now },
  history: [{
    field        : { type: String, default: '' },
    oldValue     : { type: String, default: '' },
    newValue     : { type: String, default: '' },
    updatedBy    : { type: String, default: '' },
    updatedAt    : { type: Date, default: null }
  }],
  isCurrent    : { type: Boolean, default: false }
});

module.exports = {
  CalendarDay:   mongoose.model('CalendarDay',   CalendarDaySchema),
  Exam:          mongoose.model('Exam',          ExamSchema),
  ManageAdmin:   mongoose.model('ManageAdmin',   ManageAdminSchema),
  Year:          mongoose.model('Year',          YearSchema),
};