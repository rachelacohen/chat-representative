// Placeholder identity until real auth exists; the server records it as the actor in its logs.
const USER_ID = 'demo-user';

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID, ...options.headers },
    body: options.body && JSON.stringify(options.body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

export const api = {
  ask: (question) => request('/chat', { method: 'POST', body: { question } }),
};
