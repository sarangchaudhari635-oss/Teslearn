const API_BASE = localStorage.getItem('teslearn_api') || 'https://turkey-glad-collie.ngrok-free.app';

function wsUrl(mode) {
  const base = API_BASE.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  return `${base}/api/client/ws?mode=${mode}`;
}
