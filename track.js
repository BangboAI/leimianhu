// HuaAngel Shared Tracking Library v1.0
(function(){
  var K = 'ha_tracker', U = 'ha_user', S = 'ha_session';
  var TRACKING_VERSION = '1.0';
  
  // Track an event
  window.haTrack = function(tool, action, data) {
    try {
      var events = JSON.parse(localStorage.getItem(K)) || [];
      events.push({
        t: tool, a: action, d: data || {},
        ts: Date.now(),
        v: TRACKING_VERSION,
        date: new Date().toISOString().slice(0,10),
        hour: new Date().getHours(),
        day: new Date().getDay()
      });
      if (events.length > 10000) events = events.slice(-10000);
      localStorage.setItem(K, JSON.stringify(events));
    } catch(e) { console.warn('haTrack error:', e); }
  };
  
  // Track page view
  window.haTrackPage = function(toolName) {
    window.haTrack(toolName || 'page', 'view', {
      url: window.location.pathname,
      referrer: document.referrer || '',
      screen: screen.width + 'x' + screen.height,
      lang: navigator.language
    });
  };
  
  // Get current user
  window.haGetUser = function() {
    try { var u = localStorage.getItem(U); return u ? JSON.parse(u) : null; } catch(e) { return null; }
  };
  
  // Check if user is logged in
  window.haIsLoggedIn = function() {
    var user = window.haGetUser();
    return user && user.email && user.token === localStorage.getItem(S);
  };
  
  // Login user
  window.haLogin = function(email, password) {
    try {
      var users = JSON.parse(localStorage.getItem('ha_users') || '[]');
      var user = users.find(function(u) { return u.email === email && u.password === password; });
      if (user) {
        var token = Math.random().toString(36).substring(2);
        localStorage.setItem(S, token);
        localStorage.setItem(U, JSON.stringify({ name: user.name, email: user.email, token: token }));
        window.haTrack('user', 'login', { email: email });
        return { ok: true, user: user };
      }
      return { ok: false, error: '邮箱或密码错误' };
    } catch(e) { return { ok: false, error: e.message }; }
  };
  
  // Register user
  window.haRegister = function(name, email, password) {
    try {
      var users = JSON.parse(localStorage.getItem('ha_users') || '[]');
      if (users.find(function(u) { return u.email === email; })) {
        return { ok: false, error: '该邮箱已注册' };
      }
      var user = { name: name, email: email, password: password, created: Date.now() };
      users.push(user);
      localStorage.setItem('ha_users', JSON.stringify(users));
      // Auto-login
      var token = Math.random().toString(36).substring(2);
      localStorage.setItem(S, token);
      localStorage.setItem(U, JSON.stringify({ name: name, email: email, token: token }));
      window.haTrack('user', 'register', { email: email });
      return { ok: true, user: user };
    } catch(e) { return { ok: false, error: e.message }; }
  };
  
  // Logout
  window.haLogout = function() {
    localStorage.removeItem(S);
    localStorage.removeItem(U);
    window.haTrack('user', 'logout', {});
  };
  
  // Auto-track page view on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      window.haTrackPage();
    });
  } else {
    window.haTrackPage();
  }
})();