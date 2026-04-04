// api/setup-db.js
const pool = require('./lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        ident TEXT UNIQUE NOT NULL,
        balance NUMERIC DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create transactions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        type TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        details TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    res.status(200).json({ 
      success: true, 
      message: '✅ Database tables created successfully!' 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
