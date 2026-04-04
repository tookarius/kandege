const axios = require('axios');
require('dotenv').config();

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone, amount } = req.body;

  if (!phone || !amount || amount < 10) {
    return res.status(400).json({ error: 'Invalid phone or amount (min KES 10)' });
  }

  try {
    const payload = {
      amount: Number(amount),
      phone_number: phone.replace(/\s/g, ''),
      channel_id: process.env.PAYHERO_CHANNEL_ID,
      provider: "m-pesa",
      external_reference: `KANDEGE-DEP-${Date.now()}`,
      customer_name: "Kandege User",
      callback_url: `${req.headers.origin}/api/deposit/callback`
    };

    const response = await axios.post(
      'https://backend.payhero.co.ke/api/v2/payments',
      payload,
      { headers: { 'Content-Type': 'application/json' } }
    );

    res.status(200).json({ success: true, message: 'STK Push sent', data: response.data });
  } catch (error) {
    console.error('PayHero error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to initiate deposit' });
  }
};
