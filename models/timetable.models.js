const mongoose = require('mongoose');

const TimetableSchema = new mongoose.Schema({
  trackId:      { type: String, required: true }, //teacherId
  teacherName:  { type: String, required: true },
  classId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  className:    { type: String, required: true },
  subjectId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  subjectName:  { type: String, required: true },
  day:          { type: String, enum: ['Mon','Tue','Wed','Thu','Fri', 'Sat'], required: true },
  start:        { type: String, required: true },
  end:          { type: String, required: true },
}, { timestamps: true });

const SectionTimetableSchema = new mongoose.Schema({
  classId   : { type: mongoose.Schema.Types.ObjectId, ref:'Class', required:true, unique:true },
  className : String,
  deptId    : { type: mongoose.Schema.Types.ObjectId, ref:'Department' },
  deptName  : String,
  slots     : { type: mongoose.Schema.Types.Mixed, default:{} },
  updatedBy : String,
}, { timestamps:true });

module.exports = {
  Timetable:        mongoose.model('Timetable',         TimetableSchema),
  SectionTimetable: mongoose.model('SectionTimetable',  SectionTimetableSchema),
  };