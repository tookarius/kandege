// api/lib/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false   // Required for Vercel Postgres
  }
});

module.exports = pool;
