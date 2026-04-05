// api/game/cashout.js
// POST /api/game/cashout — Cash out an aviator bet (credits winnings)

const supabase = require('../lib/supabase');
const verifyToken = require('../lib/verify-token');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyToken(req);
    if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { betId, multiplier, crashPoint } = req.body;
    if (!betId || !multiplier) return res.status(400).json({ success: false, error: 'Missing betId or multiplier' });

    const mult = Number(multiplier);
    if (mult < 1) return res.status(400).json({ success: false, error: 'Invalid multiplier' });

    // Fetch the bet (must belong to this user and be active)
    const { data: bet, error: betError } = await supabase
      .from('aviator_bets')
      .select('*')
      .eq('id', betId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (betError || !bet) {
      return res.status(400).json({ success: false, error: 'Bet not found or already resolved' });
    }

    const winnings = Number(bet.amount) * mult;

    // Credit balance atomically
    const { data: row, error: rpcError } = await supabase.rpc('add_balance', {
      p_user_id: user.id,
      p_amount: winnings
    });

    if (rpcError) {
      console.error('RPC error:', rpcError);
      return res.status(500).json({ success: false, error: 'Failed to credit winnings' });
    }

    // Mark bet as cashed out
    await supabase.from('aviator_bets').update({
      status: 'cashed_out',
      cashout_multiplier: mult,
      winnings: winnings,
      crash_point: crashPoint ? Number(crashPoint) : null,
      resolved_at: new Date().toISOString()
    }).eq('id', betId);

    // Create transaction
    const profit = winnings - Number(bet.amount);
    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'aviator_win',
      amount: profit,
      balance_before: Number(row.new_balance) - winnings,
      balance_after: Number(row.new_balance),
      description: `Aviator ×${mult.toFixed(2)} (Panel ${bet.panel}) — Won KES ${winnings.toLocaleString()}`,
      metadata: { betId, panel: bet.panel, multiplier: mult, crashPoint }
    });

    // Update profile stats
    await supabase.rpc('increment_win', {
      p_user_id: user.id,
      p_winnings: winnings,
      p_multiplier: mult
    });

    res.status(200).json({
      success: true,
      balance: Number(row.new_balance),
      winnings: winnings,
      profit: profit,
      multiplier: mult
    });

  } catch (error) {
    console.error('Cashout error:', error);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
};
