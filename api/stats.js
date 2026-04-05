// api/stats.js
// GET /api/stats — User's aggregated game stats

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

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('balance, total_deposits, total_wagered, total_won, aviator_rounds, best_multiplier, win_streak, max_win_streak, bets_placed, bets_won')
      .eq('id', user.id)
      .single();

    if (error) throw error;

    const pnl = Number(profile.total_won) - Number(profile.total_wagered);
    const winRate = profile.bets_placed > 0
      ? Math.round((profile.bets_won / profile.bets_placed) * 100)
      : 0;

    res.status(200).json({
      success: true,
      stats: {
        balance: Number(profile.balance),
        totalDeposits: Number(profile.total_deposits),
        totalWagered: Number(profile.total_wagered),
        totalWon: Number(profile.total_won),
        pnl: pnl,
        aviatorRounds: profile.aviator_rounds,
        bestMultiplier: Number(profile.best_multiplier),
        winStreak: profile.win_streak,
        maxWinStreak: profile.max_win_streak,
        betsPlaced: profile.bets_placed,
        betsWon: profile.bets_won,
        winRate: winRate
      }
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
};
