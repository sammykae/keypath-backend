/**
 * Login as admin, get JWT, call demo seed API
 * Usage: npx ts-node scripts/run-demo-seed.ts
 */
const BASE = process.env.BACKEND_URL || 'http://localhost:3001';

async function main() {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@keypath.io', password: 'admin123' }),
  });
  if (!loginRes.ok) {
    const txt = await loginRes.text();
    throw new Error(`Login failed ${loginRes.status}: ${txt}`);
  }
  const json = await loginRes.json();
  const token = json.token ?? json.data?.token;
  if (!token) throw new Error('No token in login response: ' + JSON.stringify(json));

  const seedRes = await fetch(`${BASE}/api/admin/demo/seed`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!seedRes.ok) {
    const txt = await seedRes.text();
    throw new Error(`Demo seed failed ${seedRes.status}: ${txt}`);
  }
  const data = await seedRes.json();
  console.log('✅ Demo seed done:', JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
