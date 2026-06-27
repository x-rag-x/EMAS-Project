const usersModels      = require('./users.models');
const addersModels     = require('./adders.models');
const attendanceModels = require('./attendance.models');
const timetableModels  = require('./timetable.models');
const manageModels     = require('./manage.models');
const featuresModels   = require('./features.models');
const adminModels      = require('./admin.models');

module.exports = {
  ...usersModels,
  ...addersModels,
  ...attendanceModels,
  ...timetableModels,
  ...manageModels,
  ...featuresModels,
  ...adminModels
};
