// api/game/loss.js
// POST /api/game/loss — Record an aviator loss (no balance change, bet already deducted)

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

    const { betId, crashPoint } = req.body;
    if (!betId) return res.status(400).json({ success: false, error: 'Missing betId' });

    // Mark bet as lost
    const { data: bet, error: betError } = await supabase
      .from('aviator_bets')
      .select('amount, panel')
      .eq('id', betId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (!betError && bet) {
      await supabase.from('aviator_bets').update({
        status: 'lost',
        crash_point: crashPoint ? Number(crashPoint) : null,
        resolved_at: new Date().toISOString()
      }).eq('id', betId);

      // Loss transaction
      await supabase.from('transactions').insert({
        user_id: user.id,
        type: 'aviator_loss',
        amount: -Number(bet.amount),
        description: `Aviator LOSS ×${crashPoint || '?'} (Panel ${bet.panel}) — KES ${Number(bet.amount).toLocaleString()}`,
        metadata: { betId, panel: bet.panel, crashPoint }
      });

      // Reset streak, increment round count
      await supabase.from('profiles')
        .update({ win_streak: 0, aviator_rounds: supabase.raw('aviator_rounds + 1') })
        .eq('id', user.id);
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Loss recording error:', error);
    // Don't fail the request — loss recording is non-critical
    res.status(200).json({ success: true });
  }
};
