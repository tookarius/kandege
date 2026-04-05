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

    const { action } = req.query;
    if (action === 'stats') return handleStats(req, res, user);
    if (action === 'transactions') return handleTransactions(req, res, user);
    return res.status(400).json({ success: false, error: 'Invalid action. Use ?action=stats|transactions' });
  } catch (error) {
    console.error('User API error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch data' });
  }
};

async function handleStats(req, res, user) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('balance, total_deposits, total_wagered, total_won, aviator_rounds, best_multiplier, win_streak, max_win_streak, bets_placed, bets_won')
    .eq('id', user.id)
    .single();

  if (error) throw error;

  const pnl = Number(profile.total_won) - Number(profile.total_wagered);
  const winRate = profile.bets_placed > 0 ? Math.round((profile.bets_won / profile.bets_placed) * 100) : 0;

  res.status(200).json({
    success: true,
    stats: {
      balance: Number(profile.balance),
      totalDeposits: Number(profile.total_deposits),
      totalWagered: Number(profile.total_wagered),
      totalWon: Number(profile.total_won),
      pnl, aviatorRounds: profile.aviator_rounds,
      bestMultiplier: Number(profile.best_multiplier),
      winStreak: profile.win_streak,
      maxWinStreak: profile.max_win_streak,
      betsPlaced: profile.bets_placed,
      betsWon: profile.bets_won,
      winRate
    }
  });
}

async function handleTransactions(req, res, user) {
  const limit = Math.min(parseInt(req.query.limit) || 25, 100);
  const offset = parseInt(req.query.offset) || 0;

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('id, type, amount, description, status, external_ref, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const { count: pendingCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'pending');

  res.status(200).json({
    success: true,
    transactions: transactions || [],
    pendingDeposits: pendingCount || 0,
    hasMore: transactions?.length === limit
  });
}
