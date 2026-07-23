const API = process.env.API_BASE || 'https://api.linkerses.com/api';

const results = [];
let token = '';

function summarize(json) {
  if (!json) return null;
  if (json.data && Array.isArray(json.data)) {
    return {
      count: json.data.length,
      firstKeys: json.data[0] ? Object.keys(json.data[0]).slice(0, 8) : null,
    };
  }
  if (json.data && typeof json.data === 'object') {
    return {
      keys: Object.keys(json.data).slice(0, 10),
      cid: json.data.cid,
      nickname: json.data.nickname,
      total_score: json.data.total_score,
    };
  }
  return json;
}

async function call(name, method, path, options = {}) {
  const started = Date.now();
  const headers = { 'Content-Type': 'application/json' };
  if (options.auth && token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }

    const result = {
      name,
      method,
      path,
      status: res.status,
      ok: res.ok,
      ms: Date.now() - started,
      sample: summarize(json),
    };
    results.push(result);
    return { res, json };
  } catch (error) {
    results.push({
      name,
      method,
      path,
      status: 'ERR',
      ok: false,
      ms: Date.now() - started,
      error: error.message,
    });
    return { error };
  }
}

async function main() {
  await call('health', 'GET', '/health');

  const login = await call('dev login', 'POST', '/auth/wechat-login', {
    body: { code: 'dev_mode' },
  });
  token = login.json?.data?.token || '';

  await call('agent me', 'GET', '/agents/me', { auth: true });

  const services = await call('services list', 'GET', '/services');
  const firstServiceId = services.json?.data?.[0]?.id;
  if (firstServiceId) {
    await call('service detail', 'GET', `/services/${firstServiceId}`);
  }

  await call('skills definitions', 'GET', '/skills/definitions');
  await call('skills mine', 'GET', '/skills/mine', { auth: true });
  await call('trust my score', 'GET', '/trust/my-score', { auth: true });
  await call('trust network', 'GET', '/trust/network/mine', { auth: true });
  await call('transactions mine', 'GET', '/transactions/mine', { auth: true });
  await call('recommendations', 'POST', '/pre-enact/recommend', {
    auth: true,
    body: { limit: 3 },
  });

  console.table(results.map(({ name, status, ok, ms }) => ({ name, status, ok, ms })));
  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.error(`Smoke test failed: ${failed.length}/${results.length} checks failed.`);
    process.exit(1);
  }

  console.log(`Smoke test passed: ${results.length}/${results.length} checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
