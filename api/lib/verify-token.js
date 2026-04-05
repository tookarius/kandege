// api/lib/verify-token.js
// Verifies a Supabase JWT from the Authorization header
// Returns { id, email, ... } user object or null

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Create a single anon client for token verification
const anonClient = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

module.exports = async function verifyToken(req) {
  if (!anonClient) return null;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const { data: { user }, error } = await anonClient.auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch (err) {
    console.error('Token verification error:', err.message);
    return null;
  }
};
