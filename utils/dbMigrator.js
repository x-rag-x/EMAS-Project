const mongoose = require('mongoose');

function parseIndianTimeString(str) {
  if (!str) return null;
  if (str instanceof Date) return str;
  if (typeof str !== 'string') return new Date(str);

  // String format could be: "26/6/2026, 9:45:49 am" or "27/6/2026, 6:55:55 pm"
  const match = str.match(/^(\d+)\/(\d+)\/(\d+),\s*(\d+):(\d+):(\d+)\s*(am|pm)$/i);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // 0-indexed month
    const year = parseInt(match[3], 10);
    let hour = parseInt(match[4], 10);
    const min = parseInt(match[5], 10);
    const sec = parseInt(match[6], 10);
    const ampm = match[7].toLowerCase();

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    const date = new Date(year, month, day, hour, min, sec);
    if (!isNaN(date.getTime())) return date;
  }

  // Fallback to standard parsing
  const date = new Date(str);
  if (!isNaN(date.getTime())) return date;
  return null;
}

async function migrateDateFields() {
  console.log('> Running database date format migrations...');
  const db = mongoose.connection.db;
  if (!db) {
    console.error('[EAMS Migrator] Error: Database connection not established.');
    return;
  }

  try {
    // 1. Migrate loginhistories
    const loginHistoriesCol = db.collection('loginhistories');
    const docs = await loginHistoriesCol.find({}).toArray();
    
    for (const doc of docs) {
      let updated = false;
      const updateFields = {};

      if (typeof doc.firstLogin === 'string') {
        const parsed = parseIndianTimeString(doc.firstLogin);
        if (parsed) {
          updateFields.firstLogin = parsed;
          updated = true;
        }
      }
      if (typeof doc.lastLogin === 'string') {
        const parsed = parseIndianTimeString(doc.lastLogin);
        if (parsed) {
          updateFields.lastLogin = parsed;
          updated = true;
        }
      }
      if (typeof doc.lockedUntil === 'string') {
        const parsed = parseIndianTimeString(doc.lockedUntil);
        if (parsed) {
          updateFields.lockedUntil = parsed;
          updated = true;
        }
      }

      if (Array.isArray(doc.history)) {
        let historyUpdated = false;
        const newHistory = doc.history.map(item => {
          let itemUpdated = false;
          const newItem = { ...item };

          const dateFields = ['time', 'loginTime', 'logoutTime', 'createdAt', 'expiresAt', 'lastActivity'];
          dateFields.forEach(field => {
            if (typeof newItem[field] === 'string') {
              const parsed = parseIndianTimeString(newItem[field]);
              if (parsed) {
                newItem[field] = parsed;
                itemUpdated = true;
                historyUpdated = true;
              }
            }
          });

          return newItem;
        });

        if (historyUpdated) {
          updateFields.history = newHistory;
          updated = true;
        }
      }

      if (updated) {
        await loginHistoriesCol.updateOne({ _id: doc._id }, { $set: updateFields });
      }
    }

    // 2. Migrate notifications
    const notificationsCol = db.collection('notifications');
    const notifyDocs = await notificationsCol.find({}).toArray();
    for (const doc of notifyDocs) {
      const updateFields = {};
      let updated = false;

      const dateFields = ['solvedAt', 'cancelledAt', 'time'];
      dateFields.forEach(field => {
        if (typeof doc[field] === 'string') {
          const parsed = parseIndianTimeString(doc[field]);
          if (parsed) {
            updateFields[field] = parsed;
            updated = true;
          }
        }
      });

      if (updated) {
        await notificationsCol.updateOne({ _id: doc._id }, { $set: updateFields });
      }
    }

    // 3. Migrate grievances
    const grievancesCol = db.collection('grievances');
    const grievanceDocs = await grievancesCol.find({}).toArray();
    for (const doc of grievanceDocs) {
      const updateFields = {};
      let updated = false;

      const dateFields = ['resolvedAt', 'cancelledAt'];
      dateFields.forEach(field => {
        if (typeof doc[field] === 'string') {
          const parsed = parseIndianTimeString(doc[field]);
          if (parsed) {
            updateFields[field] = parsed;
            updated = true;
          }
        }
      });

      if (updated) {
        await grievancesCol.updateOne({ _id: doc._id }, { $set: updateFields });
      }
    }

    // 4. Migrate logs
    const logsCol = db.collection('logs');
    const logDocs = await logsCol.find({}).toArray();
    for (const doc of logDocs) {
      const updateFields = {};
      let updated = false;

      if (typeof doc.time === 'string') {
        const parsed = parseIndianTimeString(doc.time);
        if (parsed) {
          updateFields.time = parsed;
          updated = true;
        }
      }

      if (updated) {
        await logsCol.updateOne({ _id: doc._id }, { $set: updateFields });
      }
    }

    // 5. Migrate livesessions
    const liveSessionsCol = db.collection('livesessions');
    const liveDocs = await liveSessionsCol.find({}).toArray();
    for (const doc of liveDocs) {
      let updated = false;
      const updateFields = {};

      if (Array.isArray(doc.markedStudents)) {
        let markedUpdated = false;
        const newMarked = doc.markedStudents.map(item => {
          const newItem = { ...item };
          if (typeof newItem.time === 'string') {
            const parsed = parseIndianTimeString(newItem.time);
            if (parsed) {
              newItem.time = parsed;
              markedUpdated = true;
            }
          }
          return newItem;
        });

        if (markedUpdated) {
          updateFields.markedStudents = newMarked;
          updated = true;
        }
      }

      if (updated) {
        await liveSessionsCol.updateOne({ _id: doc._id }, { $set: updateFields });
      }
    }

    console.log('[EAMS Migrator] Database date format migrations completed successfully!');
  } catch (err) {
    console.error('[EAMS Migrator] Error during migration:', err);
  }
}

module.exports = { migrateDateFields };
