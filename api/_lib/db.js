const postgres = require('postgres');

let sqlInstance = null;

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured. Provision Postgres and set DATABASE_URL before using the live ops dashboard.');
  }

  if (!sqlInstance) {
    const sslMode = String(process.env.DATABASE_SSL || 'require').toLowerCase();
    sqlInstance = postgres(databaseUrl, {
      max: Number(process.env.DATABASE_MAX_CONNECTIONS || 1),
      idle_timeout: Number(process.env.DATABASE_IDLE_TIMEOUT_SECONDS || 20),
      connect_timeout: Number(process.env.DATABASE_CONNECT_TIMEOUT_SECONDS || 15),
      prepare: false,
      ssl: sslMode === 'disable' ? false : 'require',
      transform: {
        undefined: null
      }
    });
  }

  return sqlInstance;
}

async function closeSql() {
  if (sqlInstance) {
    await sqlInstance.end({ timeout: 5 });
    sqlInstance = null;
  }
}

module.exports = {
  getSql,
  closeSql
};
