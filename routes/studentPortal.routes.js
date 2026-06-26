const express = require('express');
const router = express.Router();
const M = require('../models');
const { authMiddleware } = require('../middleware/auth');
const { checkMaintenance } = require('../middleware/maintenance');

router.get('/me', authMiddleware, checkMaintenance, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });

    // ── User record
    const user = await M.User.findById(req.user._id).select('-password').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // ── Student profile — look up by username or trackId
    let student = await M.Student.findOne({ username: req.user.username }).lean();
    if (!student && req.user.trackId) {
      student = await M.Student.findOne({ trackId: req.user.trackId }).lean();
    }
    if (!student) {
      // No Student profile record at all — return user info with empty attendance so portal loads
      const academic2 = await M.Settings.findOne({ key: 'academic' });
      const minReq2 = academic2?.value?.minAttendance || 75;
      return res.json({
        user: { _id: user._id, name: user.name, username: user.username, email: user.email, lastLogin: user.lastLogin, loginCount: user.loginCount },
        student: { name: user.name, regNo: '—', deptName: '—', className: '—', year: '—', section: '—', academicYear: '—', courseType: '—', branch: '—', email: user.email || '—', bloodGroup: '—', parentContact: '—' },
        attendance: { subjects: [], totalPresent: 0, totalAbsent: 0, totalClasses: 0, overall: 0, minRequired: minReq2 },
      });
    }

    // Normalize student fields for frontend consumption
    const normalizedStudent = {
      ...student,
      name: student.fullName,
      regNo: student.registerNo,
      deptName: student.department,
      className: student.class || '—',
      academicYear: student.admissionYear || '—',
    };

    // ── Minimum attendance requirement
    const academic = await M.Settings.findOne({ key: 'academic' });
    const minRequired = academic?.value?.minAttendance || 75;

    // ── All attendance records for this student's class
    const allAttendance = await M.Attendance.find({ classId: student.classId }).lean();

    // ── Aggregate per subject
    const subjectMap = {}; // subjectId → { subjectName, teacherName, present, absent, dates[] }

    for (const rec of allAttendance) {
      const sid = String(rec.subjectId);
      if (!subjectMap[sid]) {
        subjectMap[sid] = {
          subjectId: sid,
          subjectName: rec.subjectName || 'Unknown',
          teacherName: rec.teacherName || '—',
          present: 0,
          absent: 0,
          total: 0,
          dates: [],
        };
      }
      const entry = subjectMap[sid];
      // Find this student's record in the attendance doc
      const myRecord = rec.records.find(r =>
        (r.studentId && String(r.studentId) === String(student._id)) ||
        (r.regNo && (r.regNo === student.registerNo || r.regNo === student.regNo))
      );
      if (myRecord) {
        entry.total++;
        if (myRecord.status === 'present') entry.present++;
        else entry.absent++;
        entry.dates.push({ date: rec.date, status: myRecord.status });
      }
    }

    const subjects = Object.values(subjectMap).map(s => ({
      ...s,
      percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
      dates: s.dates.sort((a, b) => a.date.localeCompare(b.date)),
    }));

    // ── Overall totals
    const totalPresent = subjects.reduce((n, s) => n + s.present, 0);
    const totalAbsent = subjects.reduce((n, s) => n + s.absent, 0);
    const totalClasses = subjects.reduce((n, s) => n + s.total, 0);
    const overall = totalClasses > 0 ? Math.round((totalPresent / totalClasses) * 100) : 0;

    res.json({
      user: { _id: user._id, name: user.name, username: user.username, email: user.email, lastLogin: user.lastLogin, loginCount: user.loginCount },
      student: normalizedStudent,
      attendance: {
        subjects,
        totalPresent,
        totalAbsent,
        totalClasses,
        overall,
        minRequired,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;