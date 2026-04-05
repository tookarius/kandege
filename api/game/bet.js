// api/game/bet.js
// POST /api/game/bet — Place an aviator bet (deducts balance atomically)

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

    const { amount, panel, roundNumber, autoCashout, serverSeedHash, clientSeed, nonce } = req.body;

    if (!amount || amount < 10) return res.status(400).json({ success: false, error: 'Minimum bet KES 10' });
    if (!panel || ![1,2].includes(panel)) return res.status(400).json({ success: false, error: 'Invalid panel' });
    if (!roundNumber) return res.status(400).json({ success: false, error: 'Round number required' });

    const betAmount = Number(amount);

    // Atomic balance deduction: only succeeds if balance >= amount
    const { data: row, error: rpcError } = await supabase.rpc('deduct_balance', {
      p_user_id: user.id,
      p_amount: betAmount
    });

    if (rpcError) {
      console.error('RPC error:', rpcError);
      return res.status(500).json({ success: false, error: 'Bet processing failed' });
    }

    if (!row || row.new_balance === null) {
      return res.status(400).json({ success: false, error: 'Insufficient balance' });
    }

    // Create aviator bet record
    const { data: bet, error: betError } = await supabase.from('aviator_bets').insert({
      user_id: user.id,
      round_number: roundNumber,
      panel: panel,
      amount: betAmount,
      auto_cashout: autoCashout ? Number(autoCashout) : null,
      status: 'active'
    }).select('id').single();

    if (betError) {
      // Refund balance if bet record fails
      await supabase.rpc('add_balance', { p_user_id: user.id, p_amount: betAmount });
      console.error('Bet insert error:', betError);
      return res.status(500).json({ success: false, error: 'Failed to record bet' });
    }

    // Create transaction record
    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'aviator_bet',
      amount: -betAmount,
      balance_before: Number(row.new_balance) + betAmount,
      balance_after: Number(row.new_balance),
      description: `Aviator Bet ${panel} — KES ${betAmount.toLocaleString()}`,
      metadata: { betId: bet.id, panel, roundNumber }
    });

    // Record round for provably fair
    if (serverSeedHash && clientSeed && nonce) {
      await supabase.from('aviator_rounds').upsert({
        round_number: roundNumber,
        crash_point: 0, // updated on crash
        server_seed_hash: serverSeedHash,
        client_seed: clientSeed,
        nonce: nonce
      }, { onConflict: 'round_number' });
    }

    // Update profile wagered count
    await supabase.rpc('increment_bets_placed', { p_user_id: user.id, p_amount: betAmount });

    res.status(200).json({
      success: true,
      balance: Number(row.new_balance),
      betId: bet.id
    });

  } catch (error) {
    console.error('Bet error:', error);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
};
