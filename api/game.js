const supabase = require('./lib/supabase');
const verifyToken = require('./lib/verify-token');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const user = await verifyToken(req);
    if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { action } = req.query;
    if (action === 'bet') return handleBet(req, res, user);
    if (action === 'cashout') return handleCashout(req, res, user);
    if (action === 'loss') return handleLoss(req, res, user);
    if (action === 'binary') return handleBinary(req, res, user);

    return res.status(400).json({ success: false, error: 'Invalid action. Use ?action=bet|cashout|loss|binary' });
  } catch (error) {
    console.error('Game error:', error);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
};

// ── BET ──
async function handleBet(req, res, user) {
  const { amount, panel, roundNumber, autoCashout, serverSeedHash, clientSeed, nonce } = req.body;
  if (!amount || amount < 10) return res.status(400).json({ success: false, error: 'Minimum bet KES 10' });
  if (!panel || ![1, 2].includes(panel)) return res.status(400).json({ success: false, error: 'Invalid panel' });
  if (!roundNumber) return res.status(400).json({ success: false, error: 'Round number required' });

  const betAmount = Number(amount);

  const { data: row, error: rpcError } = await supabase.rpc('deduct_balance', { p_user_id: user.id, p_amount: betAmount });
  if (rpcError) return res.status(500).json({ success: false, error: 'Bet processing failed' });
  if (!row || row.new_balance === null) return res.status(400).json({ success: false, error: 'Insufficient balance' });

  const { data: bet, error: betError } = await supabase.from('aviator_bets').insert({
    user_id: user.id, round_number: roundNumber, panel, amount: betAmount,
    auto_cashout: autoCashout ? Number(autoCashout) : null, status: 'active'
  }).select('id').single();

  if (betError) {
    await supabase.rpc('add_balance', { p_user_id: user.id, p_amount: betAmount });
    return res.status(500).json({ success: false, error: 'Failed to record bet' });
  }

  await supabase.from('transactions').insert({
    user_id: user.id, type: 'aviator_bet', amount: -betAmount,
    balance_before: Number(row.new_balance) + betAmount, balance_after: Number(row.new_balance),
    description: `Aviator Bet ${panel} — KES ${betAmount.toLocaleString()}`,
    metadata: { betId: bet.id, panel, roundNumber }
  });

  if (serverSeedHash && clientSeed && nonce) {
    await supabase.from('aviator_rounds').upsert({
      round_number: roundNumber, crash_point: 0,
      server_seed_hash: serverSeedHash, client_seed: clientSeed, nonce
    }, { onConflict: 'round_number' });
  }

  await supabase.rpc('increment_bets_placed', { p_user_id: user.id, p_amount: betAmount });

  res.status(200).json({ success: true, balance: Number(row.new_balance), betId: bet.id });
}

// ── CASHOUT ──
async function handleCashout(req, res, user) {
  const { betId, multiplier, crashPoint } = req.body;
  if (!betId || !multiplier) return res.status(400).json({ success: false, error: 'Missing betId or multiplier' });
  const mult = Number(multiplier);
  if (mult < 1) return res.status(400).json({ success: false, error: 'Invalid multiplier' });

  const { data: bet } = await supabase.from('aviator_bets').select('*').eq('id', betId).eq('user_id', user.id).eq('status', 'active').single();
  if (!bet) return res.status(400).json({ success: false, error: 'Bet not found or already resolved' });

  const winnings = Number(bet.amount) * mult;
  const { data: row } = await supabase.rpc('add_balance', { p_user_id: user.id, p_amount: winnings });
  if (!row) return res.status(500).json({ success: false, error: 'Failed to credit winnings' });

  await supabase.from('aviator_bets').update({
    status: 'cashed_out', cashout_multiplier: mult, winnings,
    crash_point: crashPoint ? Number(crashPoint) : null, resolved_at: new Date().toISOString()
  }).eq('id', betId);

  const profit = winnings - Number(bet.amount);
  await supabase.from('transactions').insert({
    user_id: user.id, type: 'aviator_win', amount: profit,
    balance_before: Number(row.new_balance) - winnings, balance_after: Number(row.new_balance),
    description: `Aviator x${mult.toFixed(2)} (Panel ${bet.panel}) — Won KES ${winnings.toLocaleString()}`,
    metadata: { betId, panel: bet.panel, multiplier: mult, crashPoint }
  });

  await supabase.rpc('increment_win', { p_user_id: user.id, p_winnings: profit, p_multiplier: mult });

  res.status(200).json({ success: true, balance: Number(row.new_balance), winnings, profit, multiplier: mult });
}

// ── LOSS ──
async function handleLoss(req, res, user) {
  const { betId, crashPoint } = req.body;
  if (!betId) return res.status(200).json({ success: true });

  const { data: bet } = await supabase.from('aviator_bets').select('amount, panel').eq('id', betId).eq('user_id', user.id).eq('status', 'active').single();
  if (bet) {
    await supabase.from('aviator_bets').update({
      status: 'lost', crash_point: crashPoint ? Number(crashPoint) : null, resolved_at: new Date().toISOString()
    }).eq('id', betId);

    await supabase.from('transactions').insert({
      user_id: user.id, type: 'aviator_loss', amount: -Number(bet.amount),
      description: `Aviator LOSS x${crashPoint || '?'} (Panel ${bet.panel})`,
      metadata: { betId, panel: bet.panel, crashPoint }
    });

    await supabase.from('profiles').update({ win_streak: 0 }).eq('id', user.id);
  }

  res.status(200).json({ success: true });
}

// ── BINARY ──
async function handleBinary(req, res, user) {
  const { action: binaryAction } = req.body;

  // EXECUTE
  if (!binaryAction || binaryAction === 'execute') {
    const { amount, direction, entryPrice } = req.body;
    if (!amount || amount < 50) return res.status(400).json({ success: false, error: 'Minimum trade KES 50' });
    if (!direction || !['up', 'down'].includes(direction)) return res.status(400).json({ success: false, error: 'Invalid direction' });
    if (!entryPrice) return res.status(400).json({ success: false, error: 'Entry price required' });

    const tradeAmount = Number(amount);
    const { data: row, error: rpcError } = await supabase.rpc('deduct_balance', { p_user_id: user.id, p_amount: tradeAmount });
    if (rpcError || !row || row.new_balance === null) return res.status(400).json({ success: false, error: 'Insufficient balance' });

    const { data: trade, error: tradeError } = await supabase.from('binary_trades').insert({
      user_id: user.id, amount: tradeAmount, direction, entry_price: Number(entryPrice), status: 'active'
    }).select('id').single();

    if (tradeError) {
      await supabase.rpc('add_balance', { p_user_id: user.id, p_amount: tradeAmount });
      return res.status(500).json({ success: false, error: 'Failed to record trade' });
    }

    await supabase.from('transactions').insert({
      user_id: user.id, type: 'binary_bet', amount: -tradeAmount,
      balance_before: Number(row.new_balance) + tradeAmount, balance_after: Number(row.new_balance),
      description: `Binary ${direction.toUpperCase()} — KES ${tradeAmount.toLocaleString()}`,
      metadata: { tradeId: trade.id, direction, entryPrice: Number(entryPrice), payoutRate: direction === 'up' ? 0.92 : 0.85 }
    });

    await supabase.rpc('increment_bets_placed', { p_user_id: user.id, p_amount: tradeAmount });

    return res.status(200).json({ success: true, balance: Number(row.new_balance), tradeId: trade.id, payoutRate: direction === 'up' ? 0.92 : 0.85 });
  }

  // RESOLVE
  if (binaryAction === 'resolve') {
    const { tradeId, exitPrice, won } = req.body;
    if (!tradeId || exitPrice === undefined || won === undefined) return res.status(400).json({ success: false, error: 'Missing fields' });

    const { data: trade } = await supabase.from('binary_trades').select('*').eq('id', tradeId).eq('user_id', user.id).eq('status', 'active').single();
    if (!trade) return res.status(400).json({ success: false, error: 'Trade not found or already resolved' });

    if (won) {
      const payoutRate = trade.direction === 'up' ? 0.92 : 0.85;
      const payout = Number(trade.amount) + (Number(trade.amount) * payoutRate);
      const profit = payout - Number(trade.amount);

      const { data: row } = await supabase.rpc('add_balance', { p_user_id: user.id, p_amount: payout });

      await supabase.from('binary_trades').update({
        status: 'won', exit_price: Number(exitPrice), payout, profit, resolved_at: new Date().toISOString()
      }).eq('id', tradeId);

      await supabase.from('transactions').insert({
        user_id: user.id, type: 'binary_win', amount: profit,
        balance_before: Number(row.new_balance) - payout, balance_after: Number(row.new_balance),
        description: `Binary WIN ${trade.direction.toUpperCase()} — +KES ${profit.toLocaleString()}`,
        metadata: { tradeId, direction: trade.direction, entryPrice: trade.entry_price, exitPrice: Number(exitPrice) }
      });

      await supabase.rpc('increment_win', { p_user_id: user.id, p_winnings: profit, p_multiplier: 1 + payoutRate });

      return res.status(200).json({ success: true, won: true, balance: Number(row.new_balance), profit });
    } else {
      await supabase.from('binary_trades').update({ status: 'lost', exit_price: Number(exitPrice), resolved_at: new Date().toISOString() }).eq('id', tradeId);

      await supabase.from('transactions').insert({
        user_id: user.id, type: 'binary_loss', amount: -Number(trade.amount),
        description: `Binary LOSS ${trade.direction.toUpperCase()}`,
        metadata: { tradeId, direction: trade.direction, entryPrice: trade.entry_price, exitPrice: Number(exitPrice) }
      });

      await supabase.from('profiles').update({ win_streak: 0 }).eq('id', user.id);

      return res.status(200).json({ success: true, won: false });
    }
  }

  return res.status(400).json({ success: false, error: 'Invalid binary action. Use body.action = execute|resolve' });
}
