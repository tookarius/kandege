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
    let user = null;
    if (verifyToken) {
      user = await verifyToken(req);
    }

    if (user) {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('balance, total_deposits, display_name, phone')
        .eq('id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        await supabase.from('profiles').insert({
          id: user.id,
          display_name: user.email?.split('@')[0] || 'Player',
          phone: user.raw_user_meta_data?.phone || ''
        });
        return res.status(200).json({
          success: true, balance: 0, formatted: 'KES 0.00', userId: user.id,
          supabaseUrl: process.env.SUPABASE_URL || '',
          supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
        });
      }
      if (error) throw error;

      return res.status(200).json({
        success: true,
        balance: Number(profile.balance),
        formatted: `KES ${Number(profile.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        userId: user.id,
        displayName: profile.display_name,
        phone: profile.phone,
        supabaseUrl: process.env.SUPABASE_URL || '',
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
      });
    }

    // Not logged in — still return config for frontend init
    return res.status(200).json({
      success: true, balance: 0, formatted: 'KES 0.00', userId: null,
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
    });

  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch balance' });
  }
};
