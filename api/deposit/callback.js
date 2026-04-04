require('dotenv').config();

module.exports = async (req, res) => {
  // Always return 200 quickly so PayHero stops retrying
  res.status(200).send('OK');

  try {
    const data = req.body;

    // Adjust this based on exact PayHero callback format (check their docs)
    if (data.response && data.response.ResultCode === 0) {  // Success
      const amount = data.response.Amount;
      const externalRef = data.response.ExternalReference;

      console.log(`✅ Successful deposit: KES ${amount} | Ref: ${externalRef}`);

      // TODO: Credit real user balance here
      // Example: Update database using user ID extracted from externalRef
      // await updateUserBalance(userId, amount);
    } else {
      console.log('Payment failed or cancelled:', data);
    }
  } catch (err) {
    console.error('Callback error:', err);
  }
};
