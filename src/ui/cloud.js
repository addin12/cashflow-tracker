// Talking to the app on Cloudflare instead of Google: plain fetch to /api/<method> on the page's own address.
// The Worker answers each call in a small share of CPU, so the big start-up and the home screen are fetched as several requests and put together here.

const post = async (name, payload) => {
  const res = await fetch(`/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}), credentials: 'same-origin' });
  const r = await res.json().catch(() => ({ error: `the server answered ${res.status}` }));
  if (!res.ok || r.error) { const e = new Error(r.error || `the server answered ${res.status}`); e.retry = res.status === 503; throw e; }
  return r.data;
};

/** The home screen's three parts (see DASHBOARD_PARTS in core/api.js), fetched together and joined. */
const dashboard = async (payload) => Object.assign({}, ...(await Promise.all(['main', 'insights', 'bills'].map((part) => post('dashboard', { ...payload, part })))));

/** What the whole-page "init" of the Google version holds, from separate calls. */
const init = async () => {
  const [boot, review, home, incoming] = await Promise.all([post('bootstrap', {}), post('review', {}), dashboard({}), post('incoming', {})]);
  return { at: new Date().toISOString(), boot, review, dashboard: home, incoming };
};

export function callCloud(name, payload = {}) {
  if (name === 'init') return init();
  if (name === 'dashboard' && !payload.part) return dashboard(payload);
  return post(name, payload);
}
