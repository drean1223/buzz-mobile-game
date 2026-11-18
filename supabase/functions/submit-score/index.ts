// Daily ranking submissions. The client sends the replay of its run; we re-run
// it with the same game code and store the score we computed ourselves.
import { check } from './verify.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 60_000) return json({ ok: false, error: 'too large' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: 'bad json' }, 400);
  }
  const c = check(body);
  if (!c.ok) return json(c, 400);
  const { sub, result } = c;

  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res = await fetch(`${url}/rest/v1/rpc/submit_daily`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_day: sub.day,
      p_player: sub.player,
      p_name: sub.name,
      p_score: result.score,
      p_perfects: result.perfects,
      p_combo: result.maxCombo,
      p_idx: result.maxIdx,
      p_skin: sub.skin,
      p_replay: sub.replay,
    }),
  });
  if (!res.ok) {
    console.error('submit_daily failed', res.status, await res.text());
    return json({ ok: false, error: 'db' }, 500);
  }
  const rows = (await res.json()) as { rank: number; total: number; best: number; improved: boolean }[];
  const row = rows[0];
  return json({ ok: true, score: result.score, rank: row?.rank ?? null, total: row?.total ?? null, best: row?.best ?? result.score, improved: row?.improved ?? false });
});
