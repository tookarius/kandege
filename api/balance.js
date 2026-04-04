// api/balance.js
// GET /api/balance - Returns current user balance (for production-ready frontend)

require('dotenv').config();

module.exports = async (req, res) => {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // TODO: In real production, you should verify the user with JWT or session
    // For now, we'll return a demo balance. Replace this with real database logic later.

    // Example: Extract user from query or Authorization header
    const userId = req.query.userId || "demo-user";

    // === DEMO MODE (for initial testing) ===
    // You can hardcode or use a simple in-memory store for now
    const demoBalance = 12450.75;   // Change this as you test

    // === FUTURE REAL IMPLEMENTATION ===
    // const User = require('../models/User'); // if using MongoDB
    // const user = await User.findById(userId);
    // const balance = user ? user.balance : 0;

    res.status(200).json({
      success: true,
      balance: demoBalance,
      formatted: `KES ${demoBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      userId: userId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch balance'
    });
  }
};
