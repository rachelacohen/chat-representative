import { useEffect, useState } from 'react';
import { api } from './api.js';

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  const run = (fn) => fn().catch((err) => setError(err.message));

  useEffect(() => {
    run(async () => setTasks(await api.listTasks()));
  }, []);

  const addTask = (e) => {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    setTitle('');
    run(async () => {
      try {
        const task = await api.createTask(value);
        setTasks((prev) => [...prev, task]);
      } catch (err) {
        setTitle(value);
        throw err;
      }
    });
  };

  const toggleTask = (task) =>
    run(async () => {
      const updated = await api.updateTask(task.id, { done: !task.done });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    });

  const deleteTask = (task) =>
    run(async () => {
      await api.deleteTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    });

  return (
    <main className="app">
      <h1>רשימת משימות</h1>

      <form onSubmit={addTask} className="add-form">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="משימה חדשה..." />
        <button type="submit">הוסף</button>
      </form>

      {error && <p className="error">{error}</p>}

      <ul className="tasks">
        {tasks.map((task) => (
          <li key={task.id} className={task.done ? 'done' : ''}>
            <label>
              <input type="checkbox" checked={task.done} onChange={() => toggleTask(task)} />
              {task.title}
            </label>
            <button onClick={() => deleteTask(task)} aria-label="מחק">✕</button>
          </li>
        ))}
        {tasks.length === 0 && <li className="empty">אין משימות עדיין</li>}
      </ul>
    </main>
  );
}
