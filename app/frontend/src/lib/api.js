const API_BASE = import.meta.env.VITE_API_BASE_URL || '.';

async function request(path, options = {}) {
  const normalizedPath = path.replace(/^\/+/, '');
  const normalizedBase = API_BASE.replace(/\/+$/, '');
  const response = await fetch(`${normalizedBase}/${normalizedPath}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.error || 'Die Anfrage ist fehlgeschlagen.');
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

export const api = {
  getStats: () => request('/api/stats'),
  getRecipes: (params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) searchParams.set(key, value);
    });
    const query = searchParams.toString();
    return request(`/api/recipes${query ? `?${query}` : ''}`);
  },
  getRecipe: (id) => request(`/api/recipes/${id}`),
  toggleFavorite: (id, favorite) =>
    request(`/api/recipes/${id}/favorite`, {
      method: 'PATCH',
      body: JSON.stringify({ favorite })
    }),
  createRecipe: (payload) =>
    request('/api/recipes', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateRecipe: (id, payload) =>
    request(`/api/recipes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteRecipe: (id) =>
    request(`/api/recipes/${id}`, {
      method: 'DELETE'
    }),
  getRecipeInventoryUsage: (id, portions) =>
    request(`/api/recipes/${id}/inventory-usage?portions=${encodeURIComponent(portions)}`),
  consumeRecipeInventory: (id, portions, deduct) =>
    request(`/api/recipes/${id}/consume-inventory`, {
      method: 'POST',
      body: JSON.stringify({ portions, deduct })
    }),
  getInventory: (params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) searchParams.set(key, value);
    });
    const query = searchParams.toString();
    return request(`/api/inventory${query ? `?${query}` : ''}`);
  },
  getInventorySummary: () => request('/api/inventory/summary'),
  lookupProduct: (barcode) => request(`/api/products/${encodeURIComponent(barcode)}`),
  addInventoryItem: (payload) =>
    request('/api/inventory', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateInventoryItem: (id, payload) =>
    request(`/api/inventory/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  changeInventoryQuantity: (id, payload) =>
    request(`/api/inventory/${id}/quantity`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteInventoryItem: (id) =>
    request(`/api/inventory/${id}`, {
      method: 'DELETE'
    }),
  getShoppingList: () => request('/api/shopping-list'),
  addShoppingItem: (payload) =>
    request('/api/shopping-list', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  addShoppingItems: (items) =>
    request('/api/shopping-list/bulk', {
      method: 'POST',
      body: JSON.stringify({ items })
    }),
  toggleShoppingItem: (id, checked) =>
    request(`/api/shopping-list/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ checked })
    }),
  deleteShoppingItem: (id) =>
    request(`/api/shopping-list/${id}`, {
      method: 'DELETE'
    }),
  clearCheckedShoppingItems: () =>
    request('/api/shopping-list-clear', {
      method: 'DELETE'
    }),
  getMealPlan: (start, days = 7) => request(`/api/meal-plan?start=${start}&days=${days}`),
  getTodayMealPlan: (date) => {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return request(`/api/meal-plan/today${query}`);
  },
  saveMealPlanEntry: (payload) =>
    request('/api/meal-plan', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteMealPlanEntry: (id) =>
    request(`/api/meal-plan/${id}`, {
      method: 'DELETE'
    }),
  addMealPlanToShoppingList: (id) =>
    request(`/api/meal-plan/${id}/shopping-list`, {
      method: 'POST'
    }),
  searchChefkoch: (query) => request(`/api/chefkoch/search?q=${encodeURIComponent(query)}`),
  getChefkochRecipe: (id) => request(`/api/chefkoch/recipes/${id}`),
  importChefkochRecipe: (id) =>
    request('/api/chefkoch/import', {
      method: 'POST',
      body: JSON.stringify({ id })
    })
};
