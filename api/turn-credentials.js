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

  const turnKeyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const turnKeySecret = process.env.CLOUDFLARE_TURN_KEY_SECRET;
  if (!turnKeyId || !turnKeySecret) {
    return res.status(503).json({ error: 'Cloudflare TURN belum dikonfigurasi.' });
  }

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(turnKeyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${turnKeySecret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ttl: 86400 })
      }
    );
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload.iceServers)) {
      console.error('Cloudflare TURN credential request failed:', response.status);
      return res.status(502).json({ error: 'Gagal membuat kredensial TURN.' });
    }
    const iceServers = payload.iceServers.map(server => ({
      ...server,
      urls: Array.isArray(server.urls)
        ? server.urls.filter(url => !String(url).includes(':53'))
        : server.urls
    }));
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(200).json({ iceServers });
  } catch (error) {
    console.error('Cloudflare TURN request error:', error);
    return res.status(502).json({ error: 'Layanan TURN sedang tidak tersedia.' });
  }
}
