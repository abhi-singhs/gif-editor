let toastId = 0;

export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const id = ++toastId;

  const colors = {
    success: 'bg-green-700/90 border-green-600 text-white',
    error: 'bg-red-700/90 border-red-600 text-white',
    info: 'bg-gray-700/90 border-gray-500 text-white',
  };

  const el = document.createElement('div');
  el.id = `toast-${id}`;
  el.className = `px-4 py-2.5 rounded-lg border text-sm shadow-lg transition-all duration-300 transform translate-x-0 opacity-100 ${colors[type] || colors.info}`;
  el.textContent = message;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');

  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('opacity-0', '-translate-x-4');
    setTimeout(() => el.remove(), 300);
  }, duration);
}
