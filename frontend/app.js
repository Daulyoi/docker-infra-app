// Local (no Docker): point at the API on the host.
// Behind nginx reverse-proxy in Compose: set to '' so requests go to same-origin /api/...
const API_URL = 'http://localhost:3000';

const healthEl = document.getElementById('health');
const listEl = document.getElementById('list');
const sourceEl = document.getElementById('source');
const errorEl = document.getElementById('error');
const form = document.getElementById('add-form');

function showError(message) {
  if (!message) {
    errorEl.hidden = true;
    errorEl.textContent = '';
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = message;
}

async function checkHealth() {
  try {
    const res = await fetch(`${API_URL}/api/health`);
    const data = await res.json();
    const label = `health: ${data.status} (db ${data.db}, redis ${data.redis})`;
    healthEl.textContent = label;
    healthEl.className = data.status === 'ok' ? 'ok' : 'bad';
  } catch {
    healthEl.textContent = 'health: unreachable';
    healthEl.className = 'bad';
  }
}

function renderItems(items) {
  listEl.innerHTML = '';
  if (!items.length) {
    listEl.innerHTML = '<li><p>No notes yet.</p></li>';
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="row">
        <h2></h2>
        <button type="button" class="secondary" data-id="">Delete</button>
      </div>
      <p class="body"></p>
    `;
    li.querySelector('h2').textContent = item.title;
    li.querySelector('.body').textContent = item.body || '';
    const btn = li.querySelector('button');
    btn.dataset.id = String(item.id);
    btn.addEventListener('click', () => deleteItem(item.id));
    listEl.appendChild(li);
  }
}

async function loadItems() {
  showError('');
  try {
    const res = await fetch(`${API_URL}/api/items`);
    if (!res.ok) throw new Error(`List failed (${res.status})`);
    const data = await res.json();
    sourceEl.textContent =
      data.source === 'cache'
        ? 'List served from Redis cache'
        : 'List served from Postgres';
    renderItems(data.items || []);
  } catch (err) {
    showError(err.message || 'Failed to load items');
  }
}

async function deleteItem(id) {
  showError('');
  try {
    const res = await fetch(`${API_URL}/api/items/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      throw new Error(`Delete failed (${res.status})`);
    }
    await loadItems();
  } catch (err) {
    showError(err.message || 'Failed to delete');
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('title').value.trim();
  const body = document.getElementById('body').value;
  if (!title) return;

  showError('');
  try {
    const res = await fetch(`${API_URL}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Create failed (${res.status})`);
    }
    form.reset();
    await loadItems();
  } catch (err) {
    showError(err.message || 'Failed to create');
  }
});

checkHealth();
loadItems();
setInterval(checkHealth, 10000);
