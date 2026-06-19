// HuaAngel Tracking Library v1.1 — with Usage Limits & Tier System
(function(){
  var K = 'ha_tracker', U = 'ha_user', S = 'ha_session', T = 'ha_tier', TL = 'ha_tier_info';

  // Track event
  window.haTrack = function(tool, action, data) {
    try {
      var events = JSON.parse(localStorage.getItem(K)) || [];
      events.push({ t: tool, a: action, d: data || {}, ts: Date.now(), v: '1.1', date: new Date().toISOString().slice(0,10), hour: new Date().getHours(), day: new Date().getDay() });
      if (events.length > 10000) events = events.slice(-10000);
      localStorage.setItem(K, JSON.stringify(events));
      // Record daily usage for tier system
      haRecordDailyUsage(tool);
    } catch(e) { console.warn('haTrack:', e); }
  };

  window.haTrackPage = function(n) { window.haTrack(n||'page','view',{url:window.location.pathname}); };

  // ===== User System =====
  window.haGetUser = function(){ try{var u=localStorage.getItem(U);return u?JSON.parse(u):null}catch(e){return null} };
  window.haIsLoggedIn = function(){ var u=window.haGetUser(); return u&&u.email&&u.token===localStorage.getItem(S); };
  window.haLogin = function(email,password){
    try{
      var users=JSON.parse(localStorage.getItem('ha_users')||'[]');
      var user=users.find(function(u){return u.email===email&&u.password===password});
      if(user){var t=Math.random().toString(36).substring(2);localStorage.setItem(S,t);localStorage.setItem(U,JSON.stringify({name:user.name,email:user.email,token:t}));window.haTrack('user','login',{email:email});return{ok:true,user:user}}
      return{ok:false,error:'邮箱或密码错误'}
    }catch(e){return{ok:false,error:e.message}}
  };
  window.haRegister = function(name,email,password){
    try{
      var users=JSON.parse(localStorage.getItem('ha_users')||'[]');
      if(users.find(function(u){return u.email===email})) return{ok:false,error:'该邮箱已注册'};
      users.push({name:name,email:email,password:password,created:Date.now(),tier:'free'});
      localStorage.setItem('ha_users',JSON.stringify(users));
      var t=Math.random().toString(36).substring(2);localStorage.setItem(S,t);localStorage.setItem(U,JSON.stringify({name:name,email:email,token:t}));
      haSetTier('free');window.haTrack('user','register',{email:email});return{ok:true,user:{name:name,email:email}}
    }catch(e){return{ok:false,error:e.message}}
  };
  window.haLogout = function(){ localStorage.removeItem(S);localStorage.removeItem(U);window.haTrack('user','logout',{}); };

  // ===== Tier & Usage System =====
  var TIER_LIMITS = {
    free:  { daily: 10, titleGen: 5, competitor: 3, csReplies: 5, analysis: 3, desc: '免费体验', badge: 'FREE' },
    pro:   { daily: 100, titleGen: 50, competitor: 20, csReplies: 50, analysis: 30, desc: '个人专业', badge: 'PRO' },
    team:  { daily: 500, titleGen: 200, competitor: 100, csReplies: 200, analysis: 100, desc: '团队版', badge: 'TEAM' },
    admin: { daily: 9999, titleGen: 9999, competitor: 9999, csReplies: 9999, analysis: 9999, desc: '管理员', badge: 'ADMIN' }
  };

  // Set user tier (admin use only)
  window.haSetTier = function(tier) { localStorage.setItem(T, tier); localStorage.setItem(TL, JSON.stringify(TIER_LIMITS[tier]||TIER_LIMITS.free)); };
  
  // Get current tier info
  window.haGetTier = function() {
    var t = localStorage.getItem(T) || 'admin'; // default to admin (you)
    return { name: t, limits: TIER_LIMITS[t] || TIER_LIMITS.free };
  };

  // Record daily usage for a tool
  function haRecordDailyUsage(tool) {
    try {
      var today = new Date().toISOString().slice(0,10);
      var usage = JSON.parse(localStorage.getItem('ha_daily_usage') || '{}');
      if (!usage[today]) usage[today] = {};
      usage[today][tool] = (usage[today][tool] || 0) + 1;
      localStorage.setItem('ha_daily_usage', JSON.stringify(usage));
    } catch(e) {}
  }

  // Get today's usage count for a tool
  window.haGetUsage = function(tool) {
    try {
      var today = new Date().toISOString().slice(0,10);
      var usage = JSON.parse(localStorage.getItem('ha_daily_usage') || '{}');
      return (usage[today] && usage[today][tool]) || 0;
    } catch(e) { return 0; }
  };

  // Check if user can use a tool (with usage limit)
  window.haCanUse = function(tool) {
    if (window.haIsLoggedIn()) return true; // logged in users have no limits in this version
    var tier = window.haGetTier();
    var limit = tier.limits[tool] || tier.limits.daily;
    var used = window.haGetUsage(tool);
    return used < limit;
  };

  // Get remaining usage for a tool
  window.haGetRemaining = function(tool) {
    var tier = window.haGetTier();
    var limit = tier.limits[tool] || tier.limits.daily;
    var used = window.haGetUsage(tool);
    return Math.max(0, limit - used);
  };

  // Auto-init: admin tier for site owner
  var savedTier = localStorage.getItem(T);
  if (!savedTier) window.haSetTier('admin');

  // Auto-track page view
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ window.haTrackPage(); });
  else window.haTrackPage();
})();