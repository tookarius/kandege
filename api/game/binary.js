// api/game/binary.js
// POST /api/game/binary — Execute a binary trade
// POST /api/game/binary?action=resolve — Resolve a binary trade

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

    const { action } = req.query || {};

    // ── EXECUTE TRADE ──
    if (!action || action === 'execute') {
      const { amount, direction, entryPrice } = req.body;
      if (!amount || amount < 50) return res.status(400).json({ success: false, error: 'Minimum trade KES 50' });
      if (!direction || !['up','down'].includes(direction)) return res.status(400).json({ success: false, error: 'Invalid direction' });
      if (!entryPrice) return res.status(400).json({ success: false, error: 'Entry price required' });

      const tradeAmount = Number(amount);
      const payoutRate = direction === 'up' ? 0.92 : 0.85;

      // Deduct balance
      const { data: row, error: rpcError } = await supabase.rpc('deduct_balance', {
        p_user_id: user.id,
        p_amount: tradeAmount
      });

      if (rpcError || !row || row.new_balance === null) {
        return res.status(400).json({ success: false, error: 'Insufficient balance' });
      }

      // Create trade
      const { data: trade, error: tradeError } = await supabase.from('binary_trades').insert({
        user_id: user.id,
        amount: tradeAmount,
        direction,
        entry_price: Number(entryPrice),
        status: 'active'
      }).select('id').single();

      if (tradeError) {
        await supabase.rpc('add_balance', { p_user_id: user.id, p_amount: tradeAmount });
        return res.status(500).json({ success: false, error: 'Failed to record trade' });
      }

      // Transaction record
      await supabase.from('transactions').insert({
        user_id: user.id,
        type: 'binary_bet',
        amount: -tradeAmount,
        balance_before: Number(row.new_balance) + tradeAmount,
        balance_after: Number(row.new_balance),
        description: `Binary ${direction.toUpperCase()} — KES ${tradeAmount.toLocaleString()}`,
        metadata: { tradeId: trade.id, direction, entryPrice: Number(entryPrice), payoutRate }
      });

      await supabase.rpc('increment_bets_placed', { p_user_id: user.id, p_amount: tradeAmount });

      return res.status(200).json({
        success: true,
        balance: Number(row.new_balance),
        tradeId: trade.id,
        payoutRate
      });
    }

    // ── RESOLVE TRADE ──
    if (action === 'resolve') {
      const { tradeId, exitPrice, won } = req.body;
      if (!tradeId || exitPrice === undefined || won === undefined) {
        return res.status(400).json({ success: false, error: 'Missing tradeId, exitPrice, or won' });
      }

      const { data: trade, error: tradeError } = await supabase
        .from('binary_trades')
        .select('*')
        .eq('id', tradeId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (tradeError || !trade) {
        return res.status(400).json({ success: false, error: 'Trade not found or already resolved' });
      }

      if (won) {
        const payoutRate = trade.direction === 'up' ? 0.92 : 0.85;
        const payout = Number(trade.amount) + (Number(trade.amount) * payoutRate);
        const profit = payout - Number(trade.amount);

        const { data: row } = await supabase.rpc('add_balance', {
          p_user_id: user.id,
          p_amount: payout
        });

        await supabase.from('binary_trades').update({
          status: 'won',
          exit_price: Number(exitPrice),
          payout: payout,
          profit: profit,
          resolved_at: new Date().toISOString()
        }).eq('id', tradeId);

        await supabase.from('transactions').insert({
          user_id: user.id,
          type: 'binary_win',
          amount: profit,
          balance_before: Number(row.new_balance) - payout,
          balance_after: Number(row.new_balance),
          description: `Binary WIN ${trade.direction.toUpperCase()} — +KES ${profit.toLocaleString()}`,
          metadata: { tradeId, direction: trade.direction, entryPrice: trade.entry_price, exitPrice: Number(exitPrice) }
        });

        await supabase.rpc('increment_win', {
          p_user_id: user.id,
          p_winnings: profit,
          p_multiplier: 1 + payoutRate
        });

        return res.status(200).json({ success: true, won: true, balance: Number(row.new_balance), profit });
      } else {
        await supabase.from('binary_trades').update({
          status: 'lost',
          exit_price: Number(exitPrice),
          resolved_at: new Date().toISOString()
        }).eq('id', tradeId);

        await supabase.from('transactions').insert({
          user_id: user.id,
          type: 'binary_loss',
          amount: -Number(trade.amount),
          description: `Binary LOSS ${trade.direction.toUpperCase()} — -KES ${Number(trade.amount).toLocaleString()}`,
          metadata: { tradeId, direction: trade.direction, entryPrice: trade.entry_price, exitPrice: Number(exitPrice) }
        });

        await supabase.from('profiles').update({ win_streak: 0 }).eq('id', user.id);

        return res.status(200).json({ success: true, won: false });
      }
    }

    return res.status(400).json({ success: false, error: 'Invalid action. Use ?action=execute or ?action=resolve' });

  } catch (error) {
    console.error('Binary error:', error);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
};
