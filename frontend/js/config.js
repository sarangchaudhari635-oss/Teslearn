const API_BASE = localStorage.getItem('teslearn_api') || 'http://127.0.0.1:8000';

function wsUrl(mode) {
  const base = API_BASE.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  return `${base}/api/client/ws?mode=${mode}`;
}
