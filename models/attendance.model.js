const mongoose = require('mongoose');

const ClassAttendanceSchema = new mongoose.Schema({
   batch:          { type: String, required: true },
   year:           { type: Number, required: true },
   sem:            { type: Number, required: true },
   classId:        { type: String, required: true },
   departmentCode: { type: String, required: true },
   date:           { type: Date, required: true },
   periods:        [{
        periodNumbers:  { type: [Number], required: true },
        subjectTrackId: { type: String, required: true },
        teacherTrackId: { type: String, required: true },
        markedBy:       { type: String, required: true },
        markedAt:       { type: Date, required: true },
        topic:          { type: String, default: '', trim: true },
        notes:          { type: String, default: '', trim: true },
        records: [{
            studentTrackId: { type: String, required: true },
            status:         { type: String, enum: ['P', 'AB'], required: true },
        }]
    }],
    isFinalized:    { type: Boolean, default: false },
    createdAt:      { type: Date, default: Date.now },
    updatedAt:      { type: Date, default: Date.now }
});

const StudentAttendanceSchema = new mongoose.Schema({
    studentTrackId: { type: String, required: true, unique: true },
    batch:          { type: String, required: true },
    departmentCode: { type: String, required: true },
    classId:        { type: String, required: true },
    records: [{
        subjectTrackId:   { type: String, required: true },
        sem:              { type: Number, required: true },
        classesHeld:      { type: Number, required: true },
        classesAttended:  { type: Number, required: true },
        updatedAt:        { type: Date, required: true }
    }]
});

const ExamAttendanceSchema = new mongoose.Schema({
    examTrackId:    { type: String, required: true },
    examTitle:      { type: String, default: '' },
    examType:       { type: String, default: '' },
    date:           { type: Date, required: true },
    hallNo:         { type: String, required: true, trim: true },
    teacherTrackId: { type: String, required: true },
    teacherName:    { type: String, required: true },
    markedAt:       { type: Date, required: true },

    records: [{
        studentTrackId: { type: String, required: true },
        regNo:          { type: String, required: true },
        status:         { type: String, enum: ['P', 'AB'], default: 'P' }
    }, { _id: false }],

    totalPresent: { type: Number, default: 0 },
    totalAbsent:  { type: Number, default: 0 },

    isFinalized:  { type: Boolean, default: false },
}, { timestamps: true });

ExamAttendanceSchema.index({ examTrackId: 1, hallNo: 1 }, { unique: true });

module.exports = {
    ClassAttendance:    mongoose.model('ClassAttendance',   ClassAttendanceSchema),
    StudentAttendance:  mongoose.model('StudentAttendance', StudentAttendanceSchema),
    ExamAttendance:     mongoose.model('ExamAttendance',    ExamAttendanceSchema),
};
