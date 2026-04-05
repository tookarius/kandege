// api/balance.js
// GET /api/balance — Returns real user balance from Supabase

require('dotenv').config();
const supabase = require('./lib/supabase');
const verifyToken = require('./lib/verify-token');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyToken(req);
    if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });

    // Ensure profile exists (safety net)
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('balance, total_deposits, display_name, phone')
      .eq('id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // Profile doesn't exist — create it
      await supabase.from('profiles').insert({
        id: user.id,
        display_name: user.email?.split('@')[0] || 'Player',
        phone: user.raw_user_meta_data?.phone || ''
      });
      return res.status(200).json({
        success: true,
        balance: 0,
        formatted: 'KES 0.00',
        userId: user.id
      });
    }

    if (error) throw error;

    res.status(200).json({
      success: true,
      balance: Number(profile.balance),
      formatted: `KES ${Number(profile.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      userId: user.id,
      displayName: profile.display_name,
      phone: profile.phone
    });

  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch balance' });
  }
};
