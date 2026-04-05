// api/deposit/initiate.js
// POST /api/deposit/initiate — Creates pending transaction, sends PayHero STK

const axios = require('axios');
require('dotenv').config();
const supabase = require('../lib/supabase');
const verifyToken = require('../lib/verify-token');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    // 1. Verify user
    const user = await verifyToken(req);
    if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { phone, amount } = req.body;
    if (!phone || !amount || amount < 10) {
      return res.status(400).json({ success: false, error: 'Phone and amount (min KES 10) required' });
    }
    if (amount > 150000) {
      return res.status(400).json({ success: false, error: 'Maximum deposit is KES 150,000' });
    }

    // 2. Check PayHero credentials
    if (!process.env.PAYHERO_API_USERNAME || !process.env.PAYHERO_API_PASSWORD || !process.env.PAYHERO_CHANNEL_ID) {
      console.error('❌ Missing PayHero env vars');
      return res.status(500).json({ success: false, error: 'Payment system not configured' });
    }

    // 3. Generate external reference
    const externalRef = `KAN-${user.id.slice(0,8)}-${Date.now()}`;

    // 4. Create pending transaction in database
    const { data: profile } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user.id)
      .single();

    const { error: txError } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'deposit',
      amount: Number(amount),
      balance_before: Number(profile?.balance || 0),
      balance_after: Number(profile?.balance || 0), // updated on callback
      description: `M-Pesa deposit — KES ${Number(amount).toLocaleString()}`,
      status: 'pending',
      external_ref: externalRef,
      metadata: { phone, provider: 'm-pesa' }
    });

    if (txError) {
      console.error('Transaction insert error:', txError);
      return res.status(500).json({ success: false, error: 'Failed to create transaction record' });
    }

    // 5. Send PayHero STK Push
    const authString = Buffer.from(
      `${process.env.PAYHERO_API_USERNAME}:${process.env.PAYHERO_API_PASSWORD}`
    ).toString('base64');

    const payload = {
      amount: Number(amount),
      phone_number: phone,
      channel_id: process.env.PAYHERO_CHANNEL_ID,
      provider: 'm-pesa',
      external_reference: externalRef,
      customer_name: profile?.display_name || 'Kandege User',
      callback_url: `${req.headers.origin || 'https://kandege.vercel.app'}/api/deposit/callback`
    };

    const response = await axios.post(
      'https://backend.payhero.co.ke/api/v2/payments',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authString}`
        },
        timeout: 15000
      }
    );

    console.log('✅ PayHero STK sent:', externalRef);

    res.status(200).json({
      success: true,
      message: 'STK Push sent! Check your phone.',
      reference: externalRef,
      data: response.data
    });

  } catch (error) {
    console.error('PayHero Error:', error.response?.data || error.message);
    const errorMsg = error.response?.data?.error_message
      || error.response?.data?.message
      || error.message
      || 'Payment request failed';
    res.status(500).json({ success: false, error: errorMsg });
  }
};
