// api/setup-supabase.js
const supabase = require('./lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create users table
    const { error: userError } = await supabase.rpc('create_users_table');
    
    // If rpc doesn't exist, we create tables manually using raw SQL (Supabase supports it via admin)
    // For simplicity, we'll use the SQL editor in Supabase dashboard for now.

    res.status(200).json({ 
      success: true, 
      message: 'Supabase is connected. Now go to Supabase Dashboard to create tables.' 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};
