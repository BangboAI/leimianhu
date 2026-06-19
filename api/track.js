 // Vercel Serverless Function - Usage Tracking API
 // This is a stub ready for when we add a real database.
 // Currently tracking is client-side (localStorage). This API
 // exists so tools can POST events here in the future.
 
 export default async function handler(req, res) {
   // CORS
   res.setHeader('Access-Control-Allow-Origin', '*');
   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
   res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
   if (req.method === 'OPTIONS') return res.status(200).end();
 
   if (req.method === 'POST') {
     // TODO: Store event in database (Vercel KV / Supabase / etc.)
     // Event format: { tool, action, data, timestamp }
     console.log('[track]', JSON.stringify(req.body));
     return res.status(200).json({ ok: true, message: 'Event received (client-side tracking active)' });
   }
 
   if (req.method === 'GET') {
     // TODO: Return aggregated stats from database
     return res.status(200).json({
       ok: true,
       message: 'Tracking is currently client-side (localStorage). See /dashboard for live stats.',
     });
   }
 
   return res.status(405).json({ error: 'Method not allowed' });
 }
