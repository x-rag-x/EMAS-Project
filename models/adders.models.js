const mongoose = require('mongoose');

const DepartmentSchema = new mongoose.Schema({
  name:            { type: String, required: true, unique: true, trim: true },
  code:            { type: String, required: true, unique: true, trim: true, uppercase: true },
  number:          { type: String, default: '', trim: true },         // 3-digit register code e.g. "104"
  twoLetterCode:   { type: String, default: '', trim: true, lowercase: true }, // e.g. "cs"
  threeLetterCode: { type: String, default: '', trim: true, uppercase: true }, // e.g. "CSE"
  hodId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  hodName: { type: String, default: '' },
  courseType:   { type: String, enum: ['UG','PG'], default: 'UG' },
  branch:       { type: String, enum: ['M.E','M.TECH','B.E','B.TECH'], default: 'B.E' },
}, { timestamps: true });

const ClassSchema = new mongoose.Schema({
  classTrackId: { type: String, trim: true },
  name:     { type: String, required: true, trim: true },
  deptId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  deptName: { type: String, required: true },
  deptCode: { type: String, required: true },
  year:     { type: String, required: true },
  batch:    { type: String, required: true },
  sem:      { type: String, required: true },
  section:  { type: String, required: true },
  hallNo:   { type: String, required: true },
}, { timestamps: true });

const SubjectSchema = new mongoose.Schema({
  subjectTrackId: { type: String, trim: true },
  subjectCode:  { type: String, required: true, trim: true, unique: true, sparse: true },
  name:     { type: String, required: true, trim: true },
  code:     { type: String, required: true, trim: true },
  credits:  { type: Number, default: 3 },
  type:     { type: String, enum: ['Theory','Lab','Project'], default: 'Theory' },
  deptId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  deptName: { type: String, default: '' },
  deptCode: { type: String, default: '' },
}, { timestamps: true });

const AssignmentSchema = new mongoose.Schema({
  subjectId:   { type: String, required: true },
  subjectName: { type: String },
  classId:     { type: String, required: true },
  className:   { type: String },
  teacherId:   { type: String, required: true },
  teacherName: { type: String },
  hallNo:      { type: String },          
  deptName:    { type: String },
  deptCode:    { type: String }
}, { timestamps: true });

module.exports = {
  Department:       mongoose.model('Department',        DepartmentSchema),
  Class:            mongoose.model('Class',             ClassSchema),
  Subject:          mongoose.model('Subject',           SubjectSchema),
  Assignment:       mongoose.model('Assignment',        AssignmentSchema),
};