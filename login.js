(() => {
  const USER_KEY = 'wdmUserName';
  const SESSION_KEY = 'wdmSessionActive';
  const screen = document.getElementById('loginScreen');
  const form = document.getElementById('loginForm');
  const input = document.getElementById('loginName');
  const error = document.getElementById('loginError');
  const avatar = document.getElementById('loginAvatar');
  const menuUser = document.getElementById('menuUserName');
  const menuAvatar = document.getElementById('menuUserAvatar');
  const logout = document.getElementById('logoutBtn');
  const reset = document.getElementById('resetUserBtn');
  const loginTime = document.getElementById('loginTime');
  const loginDate = document.getElementById('loginDate');

  function initials(name){
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if(!parts.length) return 'W';
    return (parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function applyUser(name){
    const clean = name.trim();
    const letters = initials(clean);
    if(menuUser) menuUser.textContent = clean;
    if(menuAvatar) menuAvatar.textContent = letters;
    if(avatar) avatar.textContent = letters;
  }

  function showLogin(){
    const saved = localStorage.getItem(USER_KEY) || '';
    if(input) input.value = saved;
    applyUser(saved || 'WDM Apps');
    screen?.classList.remove('hidden');
    setTimeout(() => input?.focus(), 80);
  }

  function enter(name){
    const clean = name.trim().replace(/\s+/g,' ');
    if(clean.length < 2){
      if(error) error.textContent = 'Digite um nome com pelo menos 2 caracteres.';
      input?.focus();
      return;
    }
    if(clean.length > 28){
      if(error) error.textContent = 'Use um nome com até 28 caracteres.';
      input?.focus();
      return;
    }
    localStorage.setItem(USER_KEY, clean);
    sessionStorage.setItem(SESSION_KEY, '1');
    applyUser(clean);
    if(error) error.textContent = '';
    screen?.classList.add('hidden');
  }

  form?.addEventListener('submit', e => {
    e.preventDefault();
    enter(input?.value || '');
  });

  input?.addEventListener('input', () => {
    if(error) error.textContent = '';
    avatar.textContent = initials(input.value || 'W');
  });

  logout?.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    document.getElementById('startMenu')?.classList.remove('show');
    showLogin();
  });

  reset?.addEventListener('click', () => {
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    if(input) input.value = '';
    if(avatar) avatar.textContent = 'W';
    if(menuUser) menuUser.textContent = 'WDM Apps';
    if(menuAvatar) menuAvatar.textContent = 'W';
    input?.focus();
  });

  function updateLoginClock(){
    const d = new Date();
    if(loginTime) loginTime.textContent = d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    if(loginDate) loginDate.textContent = d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
  }
  updateLoginClock();
  setInterval(updateLoginClock, 30000);

  const saved = localStorage.getItem(USER_KEY) || '';
  applyUser(saved || 'WDM Apps');
  if(sessionStorage.getItem(SESSION_KEY) === '1' && saved){
    screen?.classList.add('hidden');
  } else {
    showLogin();
  }
})();
