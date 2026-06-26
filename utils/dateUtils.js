// Helper: compute day-of-week string from "YYYY-MM-DD"
function dateToDow(dateStr) {
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(dateStr + 'T00:00:00').getDay()];
}

// Helper: returns 1-based ordinal of a Saturday within its month (1st Sat, 2nd Sat…)
function satOrdinal(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (d.getDay() !== 6) return 0;
  let count = 0;
  for (let day = 1; day <= d.getDate(); day++) {
    const nd = new Date(d.getFullYear(), d.getMonth(), day);
    if (nd.getDay() === 6) count++;
  }
  return count; // 1, 2, 3…
}

module.exports = { dateToDow, satOrdinal };