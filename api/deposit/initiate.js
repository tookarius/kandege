// api/deposit/initiate.js
const axios = require('axios');
require('dotenv').config();

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { phone, amount } = req.body;

  if (!phone || !amount || amount < 10) {
    return res.status(400).json({ success: false, error: 'Phone number and amount (min KES 10) are required' });
  }

  // Check if credentials exist
  if (!process.env.PAYHERO_API_USERNAME || !process.env.PAYHERO_API_PASSWORD || !process.env.PAYHERO_CHANNEL_ID) {
    console.error('Missing PayHero environment variables');
    return res.status(500).json({ 
      success: false, 
      error: 'Server configuration error - missing credentials' 
    });
  }

  try {
    const authString = Buffer.from(
      `${process.env.PAYHERO_API_USERNAME}:${process.env.PAYHERO_API_PASSWORD}`
    ).toString('base64');

    const payload = {
      amount: Number(amount),
      phone_number: phone,
      channel_id: process.env.PAYHERO_CHANNEL_ID,
      provider: "m-pesa",
      external_reference: `KANDEGE-DEP-${Date.now()}`,
      customer_name: "Kandege User",
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

    console.log('PayHero success:', response.data);

    return res.status(200).json({
      success: true,
      message: 'STK Push sent successfully',
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
