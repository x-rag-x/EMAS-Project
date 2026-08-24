const M = require('../models');
const { checkStudentPortalGuard, checkAttendanceMarkGuard, checkModuleGuard } = require('../middleware/portalGuard');

console.log('🧪 Starting Offline Unit & Schema Verification...\n');

// 1. Check Model Schemas
console.log('1. Verifying SettingsSchema & History Schemas:');
if (!M.Settings) throw new Error('Settings model not registered');
if (!M.SettingHistory) throw new Error('SettingHistory model not registered');
if (!M.BroadcastHistory) throw new Error('BroadcastHistory model not registered');
console.log('   ✅ Settings, SettingHistory, and BroadcastHistory models properly loaded');

// 2. Check Teacher adminRights enum
const rightsPath = M.Teacher.schema.path('adminRights');
const rightsEnum = rightsPath.options?.type?.[0]?.enum || rightsPath.options?.enum || [];
if (!rightsEnum.includes('settingsPage')) {
  throw new Error('Teacher adminRights enum missing settingsPage');
}
console.log('   ✅ Teacher adminRights enum includes: ' + rightsEnum.join(', '));

// 3. Check Teacher preferences enum
const statusEnum = M.Teacher.schema.path('preferences.defaultAttendanceStatus').enumValues;
if (!statusEnum.includes('Present') || !statusEnum.includes('Absent') || !statusEnum.includes('Unmarked')) {
  throw new Error('Teacher defaultAttendanceStatus enum invalid');
}
console.log('   ✅ Teacher defaultAttendanceStatus enum contains: ' + statusEnum.join(', '));

// 4. Test Portal Guard middleware functions
console.log('\n2. Testing Portal Guards & Middleware:');
if (typeof checkStudentPortalGuard !== 'function') throw new Error('checkStudentPortalGuard not a function');
if (typeof checkAttendanceMarkGuard !== 'function') throw new Error('checkAttendanceMarkGuard not a function');
if (typeof checkModuleGuard !== 'function') throw new Error('checkModuleGuard not a function');
console.log('   ✅ All portal and module guard middlewares exported properly');

// 5. Test Route registration
console.log('\n3. Testing Route Layers:');
const settingsRoutes = require('../routes/settings.routes');
const systemRoutes = require('../routes/system.routes');
const authRoutes = require('../routes/auth.routes');
const profileRoutes = require('../routes/profile.routes');

if (!settingsRoutes.stack || settingsRoutes.stack.length === 0) throw new Error('settings.routes has no handlers');
if (!systemRoutes.stack || systemRoutes.stack.length === 0) throw new Error('system.routes has no handlers');
if (!authRoutes.stack || authRoutes.stack.length === 0) throw new Error('auth.routes has no handlers');
if (!profileRoutes.stack || profileRoutes.stack.length === 0) throw new Error('profile.routes has no handlers');

const settingsPaths = settingsRoutes.stack.map(s => s.route?.path).filter(Boolean);
console.log('   ✅ Settings route paths registered: ' + settingsPaths.join(', '));

const systemPaths = systemRoutes.stack.map(s => s.route?.path).filter(Boolean);
console.log('   ✅ System broadcast route paths registered: ' + systemPaths.filter(p => p.includes('broadcast')).join(', '));

console.log('\n🎉 ALL OFFLINE SCHEMAS, MODELS, MIDDLEWARES, AND ROUTE TESTS PASSED 100%!');
