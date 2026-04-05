// api/deposit/initiate.js
const axios = require('axios');
require('dotenv').config();

// Try to load these — graceful fallback if files/tables don't exist yet
let supabase = null;
let verifyToken = null;
try { supabase = require('../lib/supabase'); } catch (e) { console.warn('supabase lib not loaded:', e.message); }
try { verifyToken = require('../lib/verify-token'); } catch (e) { console.warn('verify-token lib not loaded:', e.message); }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    // 1. Verify user (skip if verify-token not available)
    let user = null;
    if (verifyToken) {
      user = await verifyToken(req);
      if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { phone, amount } = req.body;
    if (!phone || !amount || amount < 10) {
      return res.status(400).json({ success: false, error: 'Phone and amount (min KES 10) required' });
    }
    if (amount > 150000) {
      return res.status(400).json({ success: false, error: 'Maximum deposit is KES 150,000' });
    }

    if (!process.env.PAYHERO_API_USERNAME || !process.env.PAYHERO_API_PASSWORD || !process.env.PAYHERO_CHANNEL_ID) {
      console.error('Missing PayHero env vars');
      return res.status(500).json({ success: false, error: 'Payment system not configured' });
    }

    // 2. Generate reference
    const userId = user ? user.id : 'guest';
    const externalRef = `KAN-${userId.slice(0, 8)}-${Date.now()}`;

    // 3. Try to record pending transaction (non-blocking — don't fail PayHero if this breaks)
    if (supabase && user) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', user.id)
          .single();

        await supabase.from('transactions').insert({
          user_id: user.id,
          type: 'deposit',
          amount: Number(amount),
          balance_before: Number(profile?.balance || 0),
          balance_after: Number(profile?.balance || 0),
          description: `M-Pesa deposit — KES ${Number(amount).toLocaleString()}`,
          status: 'pending',
          external_ref: externalRef,
          metadata: { phone, provider: 'm-pesa' }
        });
      } catch (dbErr) {
        console.warn('DB transaction record failed (non-critical):', dbErr.message);
        // Continue anyway — PayHero call is more important
      }
    }

    // 4. Send PayHero STK Push (this is the critical part)
    const authString = Buffer.from(
      `${process.env.PAYHERO_API_USERNAME}:${process.env.PAYHERO_API_PASSWORD}`
    ).toString('base64');

    const payload = {
      amount: Number(amount),
      phone_number: phone,
      channel_id: process.env.PAYHERO_CHANNEL_ID,
      provider: 'm-pesa',
      external_reference: externalRef,
      customer_name: 'Kandege User',
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

    console.log('PayHero success:', externalRef);

    return res.status(200).json({
      success: true,
      message: 'STK Push sent! Check your phone.',
      reference: externalRef,
      data: response.data
    });

  } catch (error) {
    console.error('PayHero Error Details:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Message:', error.message);

    const errorMsg = error.response?.data?.error_message
      || error.response?.data?.message
      || error.message
      || 'Unknown error from PayHero';

    return res.status(500).json({
      success: false,
      error: errorMsg
    });
  }
};
