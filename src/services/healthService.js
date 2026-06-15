const { getDb } = require('../config/database');
const { HttpError } = require('../config/httpError');

async function checkDatabase() {
  let sqlite;
  try {
    sqlite = getDb();
  } catch (err) {
    throw new HttpError(503, 'Database unavailable');
  }

  try {
    await sqlite.getAsync('SELECT 1 AS ok');
  } catch (err) {
    throw new HttpError(503, 'Database query failed');
  }
}

async function getHealth() {
  await checkDatabase();
  return { status: 'ok', database: 'connected' };
}

module.exports = {
  getHealth,
};
