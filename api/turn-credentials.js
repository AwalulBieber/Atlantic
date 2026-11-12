import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authorization = req.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) return res.status(401).json({ error: 'Sesi login diperlukan.' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Konfigurasi autentikasi server belum lengkap.' });
  }

  const authClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !user) return res.status(401).json({ error: 'Sesi login tidak valid.' });

  const xirsysIdent = process.env.XIRSYS_IDENT;
  const xirsysSecret = process.env.XIRSYS_SECRET;
  const xirsysChannel = process.env.XIRSYS_CHANNEL;
  const xirsysPath = process.env.XIRSYS_PATH || 'https://global.xirsys.net';

  if (!xirsysIdent || !xirsysSecret || !xirsysChannel) {
    return res.status(503).json({ error: 'Xirsys TURN belum dikonfigurasi.' });
  }

  try {
    const basicAuth = Buffer.from(`${xirsysIdent}:${xirsysSecret}`).toString('base64');
    const response = await fetch(
      `${xirsysPath.replace(/\\/$/, '')}/_turn/${encodeURIComponent(xirsysChannel)}?webrtc=1&expire=3600`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }
    );
    const payload = await response.json();
    if (!response.ok || payload.s !== 'ok' || !Array.isArray(payload.v?.iceServers)) {
      console.error('Xirsys TURN credential request failed:', response.status);
      return res.status(502).json({ error: 'Gagal membuat kredensial TURN.' });
    }

    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(200).json({ iceServers: payload.v.iceServers });
  } catch (error) {
    console.error('Xirsys TURN request error:', error);
    return res.status(502).json({ error: 'Layanan TURN sedang tidak tersedia.' });
  }
}
