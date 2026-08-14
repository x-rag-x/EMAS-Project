const mongoose = require('mongoose');
const { toIndianTime } = require('../utils/dateFormatter');

const IndianDate = { type: String, default: () => toIndianTime(new Date()) };

const editFieldHistory = new mongoose.Schema({
  editedModule : { type: String, required: true},
  editedField : { type: String, required: true},
  updatedBy : {
    role:     { type: String, required: true},
    username: { type: String, required: true},
    trackId:  { type: String, required: true},
  },
  time: IndianDate,
}, { timestamps:true });

const DataManagementSchema = new mongoose.Schema({
  key: { type: String, unique: true }, // "ADM-2025"
  value: {
    currentSem: Number,
    currentYear: Number,
    batch: String,  
  },
  updatedBy : String,
}, { timestamps:true }); 

const SettingsSchema = new mongoose.Schema({
  card:     { type: String, enum: ['Institution Details', 'Settings', 'Academic Settings',
     'Password Policy', 'System Utilities'] , required: true },
  key:   { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed },
  updatedBy: { type: String, required: true },
}, { timestamps: true });

const UndoLogSchema = new mongoose.Schema({
  collectionName: { type: String, required: true },
  action:   { type: String, default: 'delete' },
  label:    { type: String, required: true },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  deletedBy:{ type: String, default: 'admin' },
  expiresAt:{ type: String, required: true},
}, { timestamps: true });
UndoLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = {
  Settings:         mongoose.model('Settings',          SettingsSchema),
  UndoLog:          mongoose.model('UndoLog',           UndoLogSchema),
  DataManagement:   mongoose.model('DataManagement',    DataManagementSchema),
  editFieldHistory: mongoose.model('editFieldHistory',  editFieldHistory),
};
