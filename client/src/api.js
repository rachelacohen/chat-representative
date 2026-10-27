// Placeholder identity until real auth exists; the server records it as the audit actor.
const USER_ID = 'demo-user';

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID, ...options.headers },
    body: options.body && JSON.stringify(options.body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.status === 204 ? null : res.json();
}

export const api = {
  listTasks: () => request('/tasks'),
  createTask: (title) => request('/tasks', { method: 'POST', body: { title } }),
  updateTask: (id, patch) => request(`/tasks/${id}`, { method: 'PATCH', body: patch }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
};
