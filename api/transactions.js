// api/transactions.js
// GET /api/transactions?limit=25 — User's transaction history

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

    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const offset = parseInt(req.query.offset) || 0;

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('id, type, amount, balance_before, balance_after, description, status, external_ref, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Count pending deposits
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

  } catch (error) {
    console.error('Transactions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
};
