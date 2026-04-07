// api/balance.js
require('dotenv').config();

// Safe loading — never crashes even if files or packages are missing
let supabase = null;
let verifyToken = null;
try { supabase = require('../lib/supabase'); } catch (e) { console.warn('supabase skip:', e.message); }
try { verifyToken = require('../lib/verify-token'); } catch (e) { console.warn('verify-token skip:', e.message); }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ALWAYS return these two fields — the frontend needs them to initialize
  const baseResponse = {
    success: true,
    balance: 0,
    formatted: 'KES 0.00',
    userId: null,
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
  };

  // If Supabase isn't loaded, return config only — frontend can still init auth
  if (!supabase || !verifyToken) {
    console.warn('Balance endpoint: Supabase not available, returning config only');
    return res.status(200).json(baseResponse);
  }

  try {
    const user = await verifyToken(req);

    if (user) {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('balance, display_name, phone')
        .eq('id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist — create it
        try {
          await supabase.from('profiles').insert({
            id: user.id,
            display_name: user.email?.split('@')[0] || 'Player',
            phone: user.raw_user_meta_data?.phone || ''
          });
        } catch (insertErr) {
          console.warn('Profile insert failed:', insertErr.message);
        }
        return res.status(200).json(baseResponse);
      }

      if (error) {
        console.warn('Profile fetch error:', error.message);
        return res.status(200).json(baseResponse);
      }

      return res.status(200).json({
        ...baseResponse,
        balance: Number(profile.balance),
        formatted: `KES ${Number(profile.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        userId: user.id,
        displayName: profile.display_name,
        phone: profile.phone
      });
    }

    // Not logged in — still return config
    return res.status(200).json(baseResponse);

  } catch (error) {
    console.error('Balance endpoint error:', error);
    // NEVER return 500 — always return 200 with config so frontend can init
    return res.status(200).json(baseResponse);
  }
};
