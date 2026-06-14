import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Replace window.storage (Claude-specific) with localStorage
window.storage = {
  get: async (key) => {
    const value = localStorage.getItem(key);
    if (value === null) throw new Error('Key not found');
    return { value };
  },
  set: async (key, value) => {
    localStorage.setItem(key, value);
    return { key, value };
  },
  delete: async (key) => {
    localStorage.removeItem(key);
    return { key, deleted: true };
  },
  list: async (prefix) => {
    const keys = Object.keys(localStorage).filter(k => !prefix || k.startsWith(prefix));
    return { keys };
  }
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
