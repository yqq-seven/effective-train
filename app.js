function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
let today = localDate();
const accounts = [
  { username: 'yqq', password: '20030908' },
  { username: 'ybb', password: '20020901' },
  { username: 'zck', password: '20040707' }
];
const actionsByType = {
  '无氧': ['肩背', '腰腹', '胸部', '臀腿'],
  '有氧': ['爬坡', '爬楼', '椭圆机', '游泳']
};
const colors = ['#9a7898', '#9aaa9b', '#8d91ad'];
let activeUsername = sessionStorage.getItem('lianban-user') || '';
let state = activeUsername ? loadState(activeUsername) : null;
let currentPage = 'home';
let reportDate = today;
let reportMonth = today.slice(0, 7);
let uploadedPhoto = '';
let editingCheckinId = null;
let confirmHandler = null;
let planDate = today;
let dietDate = today;
let imageBusy = false;
let pendingPlanId = null;
let checkinReturnPage = 'home';
let modalReturnFocus = null;

function freshState(username) {
  return {
    user: { username, name: username, avatar: '', weight: null, streak: 0, score: 0 },
    checkins: [], weights: [], feed: [], plans: [], meals: [], templateOverrides: {},
    activePlan: { name: '尚未设置计划', type: '无氧', detail: '从训练模板中选择或创建计划', duration: 0, progress: 0 },
    friends: accounts.filter(a => a.username !== username).map((a, i) => ({ id: i + 1, username: a.username, name: a.username, initial: a.username[0].toUpperCase(), color: colors[i + 1], score: 0, streak: 0 }))
  };
}
function loadState(username) {
  try {
    const stored = JSON.parse(localStorage.getItem(`lianban-v3-${username}`));
    if (!stored) return freshState(username);
    const result = { ...freshState(username), ...stored };
    if (!Array.isArray(stored.plans)) {
      const p = stored.activePlan;
      result.plans = p?.duration > 0 ? [{ ...p, id:'legacy-plan', date:today, done:p.progress===100 }] : [];
    }
    result.weights = [...new Map(result.weights.filter(w=>w?.date && Number.isFinite(w.value)).map(w=>[w.date,w])).values()].sort((a,b)=>a.date.localeCompare(b.date));
    return result;
  }
  catch { return freshState(username); }
}
function save() {
  if (!activeUsername) return;
  recalculateStats(state);
  try { localStorage.setItem(`lianban-v3-${activeUsername}`, JSON.stringify(state)); }
  catch { state=loadState(activeUsername); throw new Error('浏览器存储空间不足，未保存。请减少照片大小后重试。'); }
}
function esc(v = '') { return String(v).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
function dateText(date = new Date()) { return new Intl.DateTimeFormat('zh-CN', { month:'long', day:'numeric', weekday:'long' }).format(date); }
function hasToday() { return state.checkins.some(c => c.date === today); }
function avatarHTML(user, cls = 'small-avatar') {
  return user.avatar ? `<div class="${cls} avatar-image" style="background-image:url('${user.avatar}')"></div>` : `<div class="${cls}" style="background:${user.color || '#d9c7d8'}">${esc((user.name || user.username || '?')[0].toUpperCase())}</div>`;
}
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => el.classList.remove('show'), 1800); }

function guard(handler) { return async e => { try { await handler(e); } catch(error) { toast(error.message || '操作失败，请重试'); } }; }
document.addEventListener('click', guard(handleClick));
document.addEventListener('submit', guard(handleSubmit));
document.addEventListener('change', guard(handleChange));

function handleClick(e) {
  const nav = e.target.closest('[data-page]');
  if (nav) return navigate(nav.dataset.page);
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'go-checkin') navigate('checkin');
  if (action === 'go-profile') navigate('profile');
  if (action === 'close-modal') closeModal();
  if (action === 'confirm') { const fn = confirmHandler; closeModal(); if (fn) fn(); }
  if (action === 'logout') logout();
  if (action === 'edit-profile') showProfileEditor();
  if (action === 'weight') showWeightModal();
  if (action === 'edit-weight') showWeightModal(el.dataset.date);
  if (action === 'create-plan') showPlanModal();
  if (action === 'edit-plan') showPlanModal(el.dataset.id);
  if (action === 'delete-plan') confirmDeletePlan(el.dataset.id);
  if (action === 'edit-template') showTemplateModal(Number(el.dataset.index));
  if (action === 'start-plan') startPlanCheckin(el.dataset.id);
  if (action === 'reveal-delete') el.closest('.swipe-row').classList.toggle('revealed');
  if (action === 'add-meal') showMealModal();
  if (action === 'edit-meal') showMealModal(el.dataset.id);
  if (action === 'delete-meal') showConfirm('删除饮食记录？','删除后无法恢复。',()=>{state.meals=state.meals.filter(m=>m.id!==el.dataset.id); save(); render();});
  if (action === 'change-day') { const d = shiftDate(el.dataset.kind==='plan'?planDate:dietDate,Number(el.dataset.delta)); if(el.dataset.kind==='plan') planDate=d; else dietDate=d; render(); }
  if (action === 'use-template') { const t=getTemplates()[Number(el.dataset.index)]; useTemplate(t.name,t.type,t.detail,t.duration,t.exercise); }
  if (action === 'nudge') toast(`已提醒 ${el.dataset.name} 来打卡`);
  if (action === 'report-day') { reportDate = el.dataset.date; render(); }
  if (action === 'report-month') changeReportMonth(Number(el.dataset.delta));
  if (action === 'edit-record') startEditRecord(Number(el.dataset.id));
  if (action === 'delete-record') confirmDeleteRecord(Number(el.dataset.id));
}

function handleSubmit(e) {
  e.preventDefault();
  if (imageBusy) return toast('照片正在处理，请稍后保存');
  const data = new FormData(e.target);
  const formId=e.target.getAttribute('id');
  if (formId === 'loginForm') login(data);
  if (formId === 'checkinForm') submitCheckin(data);
  if (formId === 'profileForm') updateProfile(data);
  if (formId === 'weightForm') updateWeight(data);
  if (formId === 'planForm') { if(data.get('kind')==='template') updateTemplate(data); else updatePlan(data); }
  if (formId === 'mealForm') updateMeal(data);
}

async function handleChange(e) {
  if (e.target.id === 'planDate') { planDate=e.target.value || today; render(); }
  if (e.target.id === 'dietDate') { dietDate=e.target.value || today; render(); }
  if (e.target.matches('[data-plan-check]')) {
    const item=state.plans.find(p=>p.id===e.target.dataset.planCheck);
    if(item) {
      if(e.target.checked) { e.target.checked=false; startPlanCheckin(item.id); }
      else { e.target.checked=true; showConfirm('撤销这项训练？','关联的打卡记录将一并撤销，时长与积分会重新计算。',()=>{state.checkins=state.checkins.filter(c=>c.planId!==item.id);item.done=false;save();render();},'确认撤销'); }
    }
  }
  if(e.target.matches('[data-plan-type]')) {
    const select=e.target.form.querySelector('[name="exercise"]'); select.innerHTML=actionsByType[e.target.value].map(x=>`<option>${x}</option>`).join('');
  }
  if (e.target.id === 'type') updateActionOptions(e.target.value);
  if (e.target.id === 'reportDate') { reportDate = e.target.value; reportMonth = reportDate.slice(0, 7); render(); }
  if (['photo','avatarFile','mealPhoto'].includes(e.target.id)) {
    const file = e.target.files?.[0]; if (!file) return;
    imageBusy=true;
    try {
      const picture=await compressPhoto(file);
      if(e.target.id==='photo') { uploadedPhoto=picture; document.querySelector('#photoPreview').innerHTML=`<img src="${picture}" alt="训练照片预览">`; }
      if(e.target.id==='avatarFile') { const preview=document.querySelector('#avatarPreview'); if(preview){preview.textContent='';preview.style.backgroundImage=`url('${picture}')`;document.querySelector('#avatarData').value=picture;} }
      if(e.target.id==='mealPhoto' && document.querySelector('#mealPhotoData')) {document.querySelector('#mealPhotoData').value=picture;document.querySelector('#mealImagePreview').innerHTML=`<img src="${picture}" alt="饮食照片预览">`;}
    } finally { imageBusy=false; }
  }
}

function login(data) {
  const username = data.get('username').trim().toLowerCase();
  const account = accounts.find(a => a.username === username && a.password === data.get('password'));
  if (!account) return toast('用户名或密码不正确');
  activeUsername = username; sessionStorage.setItem('lianban-user', username); state = loadState(username);
  currentPage = 'home'; document.body.classList.remove('login-mode'); renderApp(); toast(`欢迎回来，${state.user.name}`);
}
function logout() { sessionStorage.removeItem('lianban-user'); activeUsername = ''; state = null; currentPage = 'home'; renderApp(); }

function renderApp() {
  if (!activeUsername) {
    document.body.classList.add('login-mode');
    document.querySelector('#app').innerHTML = loginView();
    document.querySelector('#pageTitle').textContent = '练伴';
    return;
  }
  document.body.classList.remove('login-mode');
  recalculateStats(state);
  document.querySelector('#todayText').textContent = dateText();
  document.querySelector('.avatar-button').innerHTML = state.user.avatar ? `<span class="header-avatar" style="background-image:url('${state.user.avatar}')"></span><i class="online-dot"></i>` : `<span>${esc(state.user.name[0].toUpperCase())}</span><i class="online-dot"></i>`;
  navigate(currentPage, false);
}
function navigate(page, scroll = true) {
  currentPage = page;
  if (page !== 'checkin') { editingCheckinId = null; uploadedPhoto = ''; pendingPlanId=null; }
  const titles = { home: hasToday() ? `今天也很棒，${state.user.name}` : `你好，${state.user.name}`, checkin:'记录今日训练', plans:'我的训练计划', diet:'饮食日记', ranking:'好友排行榜', profile:'个人中心' };
  document.querySelector('#pageTitle').textContent = titles[page];
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === (page==='ranking'?'profile':page)));
  render(); if (scroll) window.scrollTo({ top:0, behavior:'smooth' });
}
function render() { if(state) recalculateStats(state); document.querySelector('#app').innerHTML = ({ home:homeView, checkin:checkinView, plans:plansView, diet:dietView, ranking:rankingView, profile:profileView })[currentPage](); }

function loginView() {
  return `<section class="login-screen"><div class="brand-mark">练</div><p class="eyebrow">和朋友一起坚持</p><h1>登录练伴</h1><p class="login-tip">记录每一次训练，看见每一天进步</p><form id="loginForm" class="form-card login-card"><div class="field"><label>用户名</label><input name="username" autocomplete="username" placeholder="请输入用户名" required></div><div class="field"><label>密码</label><input name="password" type="password" autocomplete="current-password" placeholder="请输入密码" required></div><button class="primary-btn solid">登录</button></form></section>`;
}

function homeView() {
  const checked = hasToday();
  return `<section class="hero-card"><div class="hero-top"><span class="status-pill">${checked ? '✓ 今日已完成' : '○ 今日待完成'}</span><span>连续 ${state.user.streak} 天 🔥</span></div><h2>${checked ? '今天已经完成打卡' : '今天也要动起来呀'}</h2><p>${checked ? '保持节奏，积累看得见的改变。' : '完成一次训练，获得 10 积分'}</p><button class="primary-btn" data-action="go-checkin">${checked ? '再记一项训练' : '立即打卡'}</button></section>
  <section class="section"><div class="section-head"><h2>今日训练</h2><button data-page="plans">管理计划</button></div>${planChecklist(today)}</section>
  <section class="section"><div class="section-head"><h2>最近记录</h2><button data-page="profile">查看报表</button></div>${state.checkins.length ? `<div class="feed-list">${state.checkins.slice(0,3).map(recordCard).join('')}</div>` : '<div class="empty">还没有训练记录<br><small>完成第一次打卡后会显示在这里</small></div>'}</section>`;
}
function planCard(plan) { return `<article class="plan-card"><div class="plan-icon">${plan.type === '有氧' ? '🏃' : '🏋️'}</div><div class="plan-content"><div class="row-between"><h3>${esc(plan.name)}</h3><strong>${plan.duration || 0}′</strong></div><p>${esc(plan.detail)}</p><div class="progress"><i style="width:${plan.progress || 0}%"></i></div></div></article>`; }
function recordCard(c) { return `<article class="feed-card"><div class="row-between"><div><h3>${c.type} · ${c.exercise}</h3><p class="record-date">${c.date}${c.date === today ? ' · 今天' : ''}</p></div><span class="tag">${c.duration} 分钟</span></div><div class="feed-stats"><span class="mini-chip">${c.sets ? `${c.sets} 组 × ${c.reps || '-'} 次` : '持续训练'}</span><span class="mini-chip">${c.calories || 0} 千卡</span></div>${c.note ? `<p class="feed-text">${esc(c.note)}</p>` : ''}<div class="record-actions"><button data-action="edit-record" data-id="${c.createdAt}">编辑</button><button class="danger-text" data-action="delete-record" data-id="${c.createdAt}">删除</button></div></article>`; }

function checkinView() {
  const editing = state.checkins.find(c => c.createdAt === editingCheckinId);
  const plan = state.plans.find(p=>p.id===pendingPlanId);
  const source=editing || (plan?{date:plan.date,type:plan.type,exercise:plan.exercise||guessExercise(plan),duration:plan.duration,note:plan.detail}:null);
  const value = (key, fallback = '') => esc(source?.[key] ?? fallback);
  const type = source?.type || '无氧';
  return `<div class="date-mode"><button class="active">${editing ? '编辑记录' : '今日打卡'}</button><button type="button" onclick="document.querySelector('#checkDate').focus()">历史补签</button></div><form id="checkinForm" class="form-card"><div class="form-grid">
    <input name="recordId" type="hidden" value="${editingCheckinId || ''}">
    <input name="planId" type="hidden" value="${esc(editing?.planId || pendingPlanId || '')}">
    ${plan?`<p class="field full linked-plan-note">来自计划：${esc(plan.name)}。请确认实际时长，保存后自动完成计划。</p>`:''}
    <div class="field full"><label>训练日期</label><input id="checkDate" name="date" type="date" max="${today}" value="${value('date', today)}" required></div>
    <div class="field full"><label>运动类型</label><div class="select-wrap"><select id="type" name="type" required><option value="无氧" ${type==='无氧'?'selected':''}>无氧</option><option value="有氧" ${type==='有氧'?'selected':''}>有氧</option></select></div></div>
    <div class="field full"><label>训练动作</label><div class="select-wrap"><select id="exercise" name="exercise" required>${actionsByType[type].map(x => `<option ${source?.exercise===x?'selected':''}>${x}</option>`).join('')}</select></div><small class="field-help">动作会根据运动类型自动切换</small></div>
    <div class="field strength-field ${type==='有氧'?'hidden-field':''}"><label>组数</label><input name="sets" type="number" min="1" placeholder="3" value="${value('sets')}"></div><div class="field strength-field ${type==='有氧'?'hidden-field':''}"><label>每组次数</label><input name="reps" type="number" min="1" placeholder="12" value="${value('reps')}"></div>
    <div class="field"><label>时长（分钟）</label><input name="duration" type="number" min="1" placeholder="30" value="${value('duration')}" required></div><div class="field"><label>消耗（千卡）</label><input name="calories" type="number" min="0" placeholder="180" value="${value('calories')}"></div>
    <div class="field full"><label>训练照片（可选）</label><div class="upload-box" id="photoPreview">${editing?.photo?`<img src="${editing.photo}" alt="已有训练照片">`:'<span>＋ 添加训练照片</span>'}<input id="photo" type="file" accept="image/*"></div></div>
    <div class="field full"><label>备注</label><textarea name="note" placeholder="记录今天的状态或小突破…">${value('note')}</textarea></div><div class="field full"><label>谁可以看</label><div class="select-wrap"><select name="visibility"><option value="public" ${editing?.visibility!=='private'?'selected':''}>好友可见</option><option value="private" ${editing?.visibility==='private'?'selected':''}>仅自己可见</option></select></div></div>
  </div><button class="primary-btn solid">${editing ? '保存修改' : '完成打卡 · +10 积分'}</button></form>`;
}
function updateActionOptions(type) {
  document.querySelector('#exercise').innerHTML = actionsByType[type].map(x => `<option>${x}</option>`).join('');
  document.querySelectorAll('.strength-field').forEach(el => el.classList.toggle('hidden-field', type === '有氧'));
}

const templates = [
  { name:'肩背力量训练', type:'无氧', detail:'肩背 · 4 组 × 12 次', duration:35, icon:'🏋️' },
  { name:'核心腰腹训练', type:'无氧', detail:'腰腹 · 4 组 × 15 次', duration:25, icon:'◉' },
  { name:'臀腿强化训练', type:'无氧', detail:'臀腿 · 5 组 × 12 次', duration:40, icon:'🦵' },
  { name:'椭圆机燃脂', type:'有氧', detail:'椭圆机 · 中等强度', duration:35, icon:'🏃' },
  { name:'游泳耐力训练', type:'有氧', detail:'游泳 · 持续训练', duration:45, icon:'🏊' }
];
function guessExercise(p) { return actionsByType[p.type]?.find(x=>(p.name+' '+p.detail).includes(x)) || actionsByType[p.type]?.[0] || '肩背'; }
function getTemplates() { return templates.map((t,i)=>({...t,exercise:guessExercise(t),...state.templateOverrides?.[i]})); }
function plansView() {
  return `${dayPicker('plan',planDate)}<section class="section"><div class="section-head"><h2>今日健身计划</h2><button data-action="create-plan">＋ 新增计划</button></div><p class="subtle plan-subtitle">循序渐进 · 每完成一项，离目标更近一步</p>${planChecklist(planDate)}</section><section class="section"><div class="section-head"><h2>训练模板</h2><span>添加到所选日期</span></div><div class="template-list">${getTemplates().map((t,index) => `<article class="template-card"><div class="template-icon">${t.icon}</div><div><h3>${esc(t.name)}</h3><p>${esc(t.detail)}</p><span class="tag">${t.type} · ${t.duration} 分钟</span></div><div class="template-tools"><button class="icon-btn" aria-label="添加模板" data-action="use-template" data-index="${index}">＋</button><button class="task-edit" data-action="edit-template" data-index="${index}">编辑</button></div></article>`).join('')}</div></section>`;
}
function planChecklist(date) {
  const plans=state.plans.filter(p=>p.date===date), done=plans.filter(p=>p.done).length;
  if(!plans.length) return '<div class="empty">这一天还没有计划<br><small>新增计划或从模板开始</small></div>';
  return `<div class="plan-checklist"><div class="row-between subtle"><span>已完成 ${done} / ${plans.length} 项</span><span>计划 ${plans.reduce((n,p)=>n+Number(p.duration),0)} 分钟</span></div><div class="progress"><i style="width:${done/plans.length*100}%"></i></div><p class="swipe-hint">右滑卡片可删除 · 勾选后确认实际训练</p>${plans.map(p=>swipeRow('plan',p.id,`<article class="plan-task ${p.done?'is-done':''}"><label class="task-check"><input type="checkbox" data-plan-check="${esc(p.id)}" ${p.done?'checked':''} aria-label="完成${esc(p.name)}"><span class="task-content"><strong>${esc(p.name)} <small>${p.duration} 分钟</small></strong><span>${esc(p.detail)}</span></span></label><div class="task-tools"><button class="task-edit" data-action="edit-plan" data-id="${esc(p.id)}" aria-label="编辑${esc(p.name)}">编辑</button><button class="task-edit" data-action="reveal-delete" aria-label="显示删除${esc(p.name)}">更多</button></div></article>`)).join('')}</div>`;
}

function rankingView() {
  const monday=shiftDate(today,-((new Date(today+'T12:00:00').getDay()+6)%7));
  const all = accounts.map((a,i)=>{const data=a.username===activeUsername?state:loadState(a.username);recalculateStats(data);return {...data.user,score:scoreFor(data,monday),id:a.username===activeUsername?0:i+1,color:colors[i],name:data.user.name+(a.username===activeUsername?'（我）':'')};}).sort((a,b) => b.score-a.score);
  return `<div class="row-between"><span class="status-pill report-pill">本周综合积分</span><span class="subtle">${monday} 起</span></div><p class="field-help">仅统计此浏览器保存的数据，跨设备同步待开通。</p><section class="rank-list section">${all.map((p,i) => `<article class="rank-row ${p.id===0?'me':''}"><span class="rank-number">${i+1}</span>${avatarHTML(p)}<div><strong>${esc(p.name)}</strong><div class="subtle">连续 ${p.streak} 天</div></div><div class="rank-score"><strong>${p.score}</strong><span>综合积分</span></div></article>`).join('')}</section><section class="section"><div class="form-card rule-copy">当日记录 +10，补签 +5<br>连续打卡日 +2（每天一次，补签不计入连续）<br>关联计划的当日打卡 +5（每项计划一次）<br>修改、删除记录后自动重新计算积分</div></section>`;
}

function profileView() {
  const minutes = state.checkins.reduce((n,c) => n + Number(c.duration || 0), 0);
  const calories = state.checkins.reduce((n,c) => n + Number(c.calories || 0), 0);
  return `<section class="profile-card"><div class="profile-main">${avatarHTML(state.user, 'profile-big-avatar')}<div class="profile-copy"><h2>${esc(state.user.name)}</h2><p>@${state.user.username} · 和朋友一起坚持运动</p></div><button class="secondary-btn" data-action="edit-profile">编辑</button></div><div class="metric-row"><div><strong>${state.user.streak}</strong><span>连续天数</span></div><div><strong>${state.user.score}</strong><span>综合积分</span></div><div><strong>${state.friends.length}</strong><span>练伴好友</span></div></div></section>
  <button class="profile-link" data-page="ranking"><span>♕ 好友排行榜</span><span>查看排行 ›</span></button>
  <section class="section"><div class="section-head"><h2>训练统计报表</h2><span>按日期下钻</span></div>${reportView()}</section>
  <section class="section"><div class="section-head"><h2>全部训练记录</h2><span>${state.checkins.length} 条</span></div>${state.checkins.length ? `<div class="feed-list">${state.checkins.map(recordCard).join('')}</div>` : '<div class="empty">暂无训练记录</div>'}</section>
  <section class="section"><div class="section-head"><h2>累计数据</h2></div><div class="stats-grid"><div class="stat-card"><span>训练时长</span><strong>${minutes}<small> 分钟</small></strong></div><div class="stat-card"><span>消耗热量</span><strong>${calories}<small> 千卡</small></strong></div></div></section>
  <section class="section"><div class="section-head"><h2>体重趋势</h2><button data-action="weight">＋ 记录体重</button></div><div class="profile-card">${weightChart()}${weightHistory()}</div></section>
  <button class="logout-btn" data-action="logout">退出当前账号</button>`;
}
function reportView() {
  const [year, month] = reportMonth.split('-').map(Number);
  const days = new Date(year, month, 0).getDate();
  const leading = new Date(year, month - 1, 1).getDay();
  if (!reportDate.startsWith(reportMonth)) reportDate = `${reportMonth}-01`;
  const items = state.checkins.filter(c => c.date === reportDate);
  const monthItems = state.checkins.filter(c => c.date.startsWith(reportMonth));
  const grouped = {};
  items.forEach(c => { grouped[c.type] ||= {}; grouped[c.type][c.exercise] = (grouped[c.type][c.exercise] || 0) + Number(c.duration); });
  const total = items.reduce((n,c) => n + Number(c.duration), 0);
  const monthMinutes = monthItems.reduce((n,c)=>n+Number(c.duration),0);
  const cells = Array(leading).fill('<span class="calendar-blank"></span>').concat(Array.from({length:days},(_,i)=>{ const day=String(i+1).padStart(2,'0'), date=`${reportMonth}-${day}`, mins=state.checkins.filter(c=>c.date===date).reduce((n,c)=>n+Number(c.duration),0); return `<button data-action="report-day" data-date="${date}" class="calendar-day ${date===reportDate?'active':''} ${mins?'has-data':''}"><span>${i+1}</span>${mins?`<i>${mins}′</i>`:'<i></i>'}</button>`; }));
  return `<div class="report-card"><div class="month-nav"><button data-action="report-month" data-delta="-1">‹</button><strong>${year} 年 ${month} 月</strong><button data-action="report-month" data-delta="1" ${reportMonth>=today.slice(0,7)?'disabled':''}>›</button></div><div class="month-summary"><span>本月累计</span><strong>${monthMinutes} 分钟</strong></div><div class="calendar-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div class="month-grid">${cells.join('')}</div><div class="selected-day"><span>${reportDate} 训练明细</span></div>${total ? `<div class="report-total"><span>当日总时长</span><strong>${total} 分钟</strong></div><div class="drill-list">${Object.entries(grouped).map(([type, actions]) => { const typeTotal=Object.values(actions).reduce((a,b)=>a+b,0); return `<details open><summary><span>${type === '有氧' ? '🏃' : '🏋️'} ${type}</span><strong>${typeTotal} 分钟</strong></summary>${Object.entries(actions).map(([name,value]) => `<div class="drill-row"><span>${name}</span><div class="report-bar"><i style="width:${Math.max(8,value/total*100)}%"></i></div><strong>${value}′</strong></div>`).join('')}</details>`; }).join('')}</div>` : '<div class="empty report-empty">这一天还没有训练记录</div>'}</div>`;
}

function changeReportMonth(delta) { const [y,m]=reportMonth.split('-').map(Number), d=new Date(y,m-1+delta,1); reportMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; reportDate=`${reportMonth}-01`; render(); }

function submitCheckin(data) {
  const item = Object.fromEntries(data.entries());
  const recordId = Number(item.recordId); delete item.recordId;
  item.duration = Number(item.duration); item.calories = Number(item.calories || 0); item.createdAt = recordId || Date.now(); item.photo = uploadedPhoto || state.checkins.find(c=>c.createdAt===recordId)?.photo || '';
  if(!validDate(item.date) || item.date>today || !actionsByType[item.type]?.includes(item.exercise) || !Number.isFinite(item.duration) || item.duration<1 || item.duration>1440 || !Number.isFinite(item.calories) || item.calories<0) return toast('请填写有效的日期、动作和训练时长');
  if (item.type === '有氧') { item.sets = ''; item.reps = ''; }
  const previous=state.checkins.find(c=>c.createdAt===recordId);
  const plan=state.plans.find(p=>p.id===item.planId);
  if(item.planId && !plan && !previous) return toast('计划已删除，请重新创建记录');
  if(plan && plan.date!==item.date) return toast('关联计划的记录日期需要与计划一致');
  if(plan && plan.type!==item.type) return toast('关联计划的运动类型需要与计划一致');
  if(plan && state.checkins.some(c=>c.planId===plan.id && c.createdAt!==recordId)) return toast('这项计划已打卡，请编辑已有记录');
  item.backfill=item.date!==localDate(new Date(item.createdAt));
  item.planCompleted=Boolean(plan) || Boolean(previous?.planCompleted);
  if (recordId) {
    const index = state.checkins.findIndex(c=>c.createdAt===recordId); if(index<0) return toast('记录已删除，请刷新后重试'); state.checkins[index] = item;
  } else {
    state.checkins.unshift(item);
  }
  if(plan) {plan.done=true;plan.linked=true;}
  save(); uploadedPhoto=''; editingCheckinId=null; reportDate=item.date; reportMonth=item.date.slice(0,7);
  navigate(plan?checkinReturnPage:'home'); showNotice(recordId?'修改已保存':'打卡成功',plan?'计划已完成，训练时长与积分已更新。':'训练记录和统计报表已更新。');
}
function startEditRecord(id) { editingCheckinId=id; currentPage='checkin'; document.querySelector('#pageTitle').textContent='编辑训练记录'; document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page==='checkin')); render(); window.scrollTo({top:0,behavior:'smooth'}); }
function confirmDeleteRecord(id) { showConfirm('删除这条记录？', '关联计划将恢复待完成；时长、连续天数和积分会重新计算。', () => { state.checkins=state.checkins.filter(c=>c.createdAt!==id); save(); render(); showNotice('记录已删除','训练数据和统计报表已更新。'); }); }
function recalculateStats(data) {
  for(const p of data.plans) { if(p.linked || data.checkins.some(c=>c.planId===p.id)){p.linked=true;p.done=data.checkins.some(c=>c.planId===p.id);} }
  const valid=data.checkins.filter(c=>!(c.backfill ?? (c.date!==localDate(new Date(c.createdAt)))));
  const days=new Set(valid.map(c=>c.date));
  let date=days.has(today)?today:shiftDate(today,-1), streak=0;
  while(days.has(date)){streak++;date=shiftDate(date,-1);}
  data.user.streak=streak;
  data.user.score=scoreFor(data);
}
function scoreFor(data,from='0000-01-01') {
  const validDays=new Set(data.checkins.filter(c=>!(c.backfill ?? (c.date!==localDate(new Date(c.createdAt))))).map(c=>c.date));
  const countedPlans=new Set(); let score=0;
  for(const c of [...data.checkins].sort((a,b)=>a.date.localeCompare(b.date))) {
    const backfill=c.backfill ?? (c.date!==localDate(new Date(c.createdAt)));
    if(c.date>=from && c.date<=today) score+=backfill?5:10;
    if(c.planCompleted && c.planId && !backfill && !countedPlans.has(c.planId)) { if(c.date>=from && c.date<=today) score+=5; countedPlans.add(c.planId); }
  }
  for(const d of validDays) if(d>=from && d<=today && validDays.has(shiftDate(d,-1))) score+=2;
  return score;
}
function startPlanCheckin(id) {
  const p=state.plans.find(p=>p.id===id); if(!p) return;
  if(p.date>today) return toast('还没到计划日期，可以当天完成或历史补签');
  checkinReturnPage=currentPage; pendingPlanId=id;
  const record=state.checkins.find(c=>c.planId===id); editingCheckinId=record?.createdAt || null;
  navigate('checkin');
}
function confirmDeletePlan(id) {
  const plan=state.plans.find(p=>p.id===id); if(!plan) return;
  showConfirm('删除这项计划？','只删除计划，已经保存的训练记录会保留。',()=>{state.plans=state.plans.filter(p=>p.id!==id);save();render();toast('计划已删除，历史训练记录已保留');});
}
function calculateStreak(items) { const unique = new Set(items.map(i=>i.date)); let d=new Date(), n=0; while(unique.has(localDate(d))){ n++; d.setDate(d.getDate()-1); } return n; }
function useTemplate(name,type,detail,duration,exercise) { state.plans.push({id:crypto.randomUUID(),date:planDate,name,type,detail,duration,exercise,done:false}); save(); render(); showNotice('计划已添加', `${name} 已添加到 ${planDate}。`); }
function showProfileEditor() { openModal(`<h2>编辑个人资料</h2><form id="profileForm" class="form-card modal-form"><div class="avatar-editor"><div id="avatarPreview" class="profile-big-avatar avatar-image" style="${state.user.avatar?`background-image:url('${state.user.avatar}')`:''}">${state.user.avatar?'':esc(state.user.name[0])}</div><label class="secondary-btn">更换头像<input id="avatarFile" type="file" accept="image/*" hidden></label><input id="avatarData" name="avatar" type="hidden" value="${state.user.avatar || ''}"></div><div class="field"><label>显示用户名</label><input name="name" maxlength="12" value="${esc(state.user.name)}" required></div><p class="field-help">登录账号 @${state.user.username} 不会改变</p><button class="primary-btn solid">保存资料</button></form>`); }
function updateProfile(data) { state.user.name=data.get('name').trim(); state.user.avatar=data.get('avatar'); save(); closeModal(); renderApp(); showNotice('资料已保存','用户名和头像已经更新。'); }
function showWeightModal(date) {
  const item=state.weights.find(w=>w.date===date);
  openModal(`<h2>${item?'修改体重':'记录体重'}</h2><form id="weightForm" class="form-card modal-form"><input name="originalDate" type="hidden" value="${item?.date || ''}"><div class="field"><label>记录日期</label><input name="date" type="date" max="${today}" value="${item?.date || today}" ${item?'readonly':''} required></div><div class="field"><label>体重（kg）</label><input name="weight" type="number" min="20" max="300" step="0.1" value="${item?.value || ''}" required></div><p class="field-help">每天保留一条记录，保存后可以修改数值。</p><button class="primary-btn solid">保存记录</button></form>`);
}
function updateWeight(data) {
  const date=data.get('date'), value=Number(data.get('weight'));
  if (!validDate(date) || date>today || !Number.isFinite(value) || value<20 || value>300) return toast('请输入有效日期和体重');
  // Re-read immediately before the check to avoid overwriting another tab's entry.
  state=loadState(activeUsername);
  const originalDate=data.get('originalDate'), index=state.weights.findIndex(w=>w.date===date);
  if(originalDate && (originalDate!==date || index<0)) return toast('记录已变化，请重新打开后修改');
  if(index>=0 && !originalDate) return toast(`${date} 已记录体重，每天只能保存一次；请使用修改入口`);
  if(index>=0) state.weights[index]={date,value}; else state.weights.push({date,value});
  state.weights.sort((a,b)=>a.date.localeCompare(b.date));
  save(); closeModal(); render(); showNotice(originalDate?'体重已修改':'体重已保存',`${date} 的体重记录为 ${value} kg。`);
}
function weightHistory() { return state.weights.length?`<details class="weight-history"><summary>查看与修改记录（${state.weights.length}）</summary>${[...state.weights].reverse().map(w=>`<div class="weight-row"><time>${w.date}</time><strong>${w.value} kg</strong><button class="task-edit" data-action="edit-weight" data-date="${w.date}">修改</button></div>`).join('')}</details>`:''; }
function weightChart() {
  const points=state.weights.filter(w=>w?.date && Number.isFinite(w.value)).sort((a,b)=>a.date.localeCompare(b.date)).slice(-10);
  if(!points.length) return '<div class="empty">暂无体重记录<br><small>每天可保存一次，记录后自动生成趋势图</small></div>';
  const values=points.map(p=>p.value), min=Math.min(...values)-.5, max=Math.max(...values)+.5, width=Math.max(320,points.length*48), height=150, pad=24;
  const timestamp=d=>new Date(d+'T12:00:00').getTime(), start=timestamp(points[0].date), end=timestamp(points.at(-1).date);
  const x=i=>points.length===1?width/2:pad+(timestamp(points[i].date)-start)/(end-start)*(width-pad*2), y=v=>pad+(max-v)/(max-min)*(height-pad*2);
  const line=points.map((p,i)=>`${x(i)},${y(p.value)}`).join(' ');
  return `<div class="weight-latest"><span>最新 ${points.at(-1).date}</span><strong>${points.at(-1).value} kg</strong></div><div class="weight-svg-wrap"><svg class="weight-svg" style="min-width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="${points.length===1?'单次体重点':'体重变化折线图'}">${points.length>1?`<line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" class="chart-axis"/><polyline points="${line}" class="chart-line"/>`:''}${points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.value)}" r="4" class="chart-point"><title>${p.date}：${p.value} kg</title></circle><text x="${x(i)}" y="${y(p.value)-9}" text-anchor="middle" class="chart-value">${p.value}</text><text x="${x(i)}" y="${height-5}" text-anchor="middle" class="chart-date">${p.date.slice(5)}</text>`).join('')}</svg></div><p class="field-help">${points.length===1?'已记录 1 天，下一次记录后连接趋势线':'按日期显示最近 10 次记录'}</p>`;
}
function showPlanModal(id) {
  const p=state.plans.find(p=>p.id===id), value=(key,fallback='')=>esc(p?.[key]??fallback);
  openModal(`<h2>${p?'编辑':'新增'}训练计划</h2><form id="planForm" class="form-card modal-form"><input type="hidden" name="id" value="${value('id')}"><div class="field"><label>计划日期</label><input name="date" type="date" value="${value('date',planDate)}" required></div><div class="field"><label>计划名称</label><input name="name" maxlength="40" value="${value('name')}" required></div><div class="field"><label>类型</label><div class="select-wrap"><select name="type"><option ${p?.type==='无氧'?'selected':''}>无氧</option><option ${p?.type==='有氧'?'selected':''}>有氧</option></select></div></div><div class="field"><label>训练内容</label><textarea name="detail" maxlength="300" required>${value('detail')}</textarea></div><div class="field"><label>预计时长（分钟）</label><input name="duration" type="number" min="1" max="1440" value="${value('duration')}" required></div><button class="primary-btn solid">保存计划</button></form>`);
}
function updatePlan(data) {
  const id=data.get('id'), existing=state.plans.findIndex(p=>p.id===id), name=data.get('name').trim(), detail=data.get('detail').trim(), date=data.get('date'), duration=Number(data.get('duration'));
  if(!name || !detail || !validDate(date) || duration<1 || duration>1440) return toast('请完整填写计划内容');
  if(existing>=0 && state.checkins.some(c=>c.planId===id && (c.date!==date || c.type!==data.get('type')))) return toast('已有训练记录，请保留原日期与运动类型');
  const p={...(state.plans[existing] || {}),id:id||crypto.randomUUID(),name,detail,date,duration,type:data.get('type'),done:existing>=0?state.plans[existing].done:false};
  if(existing>=0) state.plans[existing]=p; else state.plans.push(p);
  planDate=p.date; save(); closeModal(); render(); showNotice('计划已保存',`${date} 的训练清单已更新。`);
}
function showTemplateModal(index) {
  const t=getTemplates()[index]; if(!t) return;
  openModal(`<h2>编辑训练模板</h2><form id="planForm" class="form-card modal-form"><input type="hidden" name="kind" value="template"><input type="hidden" name="index" value="${index}"><div class="field"><label>模板名称</label><input name="name" maxlength="40" value="${esc(t.name)}" required></div><div class="field"><label>运动类型</label><div class="select-wrap"><select name="type" data-plan-type><option ${t.type==='无氧'?'selected':''}>无氧</option><option ${t.type==='有氧'?'selected':''}>有氧</option></select></div></div><div class="field"><label>训练动作</label><div class="select-wrap"><select name="exercise">${actionsByType[t.type].map(x=>`<option ${t.exercise===x?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="field"><label>训练说明</label><textarea name="detail" maxlength="300" required>${esc(t.detail)}</textarea></div><div class="field"><label>预计时长（分钟）</label><input name="duration" type="number" min="1" max="1440" value="${t.duration}" required></div><p class="field-help">修改后用于新添加的计划，已安排的计划保持原内容。</p><button class="primary-btn solid">保存模板</button></form>`);
}
function updateTemplate(data) {
  const index=Number(data.get('index')),name=data.get('name').trim(),detail=data.get('detail').trim(),duration=Number(data.get('duration')),type=data.get('type'),exercise=data.get('exercise');
  if(!templates[index] || !name || !detail || !Number.isFinite(duration) || duration<1 || duration>1440 || !actionsByType[type]?.includes(exercise)) return toast('请完整填写模板内容');
  state.templateOverrides ||= {};state.templateOverrides[index]={name,detail,duration,type,exercise};save();closeModal();render();showNotice('模板已更新','以后新增计划将使用这份模板，已安排的计划不受影响。');
}
function showNotice(title, message) { openModal(`<div class="notice-modal"><div class="notice-icon">✓</div><h2>${esc(title)}</h2><p>${esc(message)}</p><button class="primary-btn solid" data-action="close-modal">知道了</button></div>`); }
function showConfirm(title,message,onConfirm,label='确认删除') { confirmHandler=onConfirm; openModal(`<div class="notice-modal"><div class="notice-icon warn">!</div><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="confirm-actions"><button class="secondary-btn" data-action="close-modal">取消</button><button class="primary-btn solid danger-btn" data-action="confirm">${label}</button></div></div>`); }
function openModal(content) {
  if(!document.querySelector('.modal')) modalReturnFocus=document.activeElement;
  document.querySelector('#modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="dialogTitle"><div class="modal-handle"></div><div class="modal-close"><button class="icon-btn" aria-label="关闭弹窗" data-action="close-modal">×</button></div>${content}</div></div>`;
  const heading=document.querySelector('.modal h2'); if(heading) heading.id='dialogTitle';
  document.querySelector('.app-shell').inert=true;
  document.querySelector('.modal input:not([type="hidden"]),.modal button')?.focus({preventScroll:true});
}
function closeModal() { document.querySelector('#modalRoot').innerHTML='';document.querySelector('.app-shell').inert=false;confirmHandler=null;if(modalReturnFocus?.isConnected)modalReturnFocus.focus({preventScroll:true}); }
document.addEventListener('keydown',e=>{
  const modal=document.querySelector('.modal');if(!modal)return;
  if(e.key==='Escape'){e.preventDefault();closeModal();}
  if(e.key==='Tab') {const items=[...modal.querySelectorAll('button,input:not([type="hidden"]),select,textarea')].filter(el=>!el.disabled), first=items[0],last=items.at(-1); if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}}
});

function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && localDate(new Date(value+'T12:00:00'))===value; }
function shiftDate(value,delta) { const d=new Date(value+'T12:00:00'); d.setDate(d.getDate()+delta); return localDate(d); }
function dayPicker(kind,date) {
  return `<div class="day-picker"><button data-action="change-day" data-kind="${kind}" data-delta="-1" aria-label="前一天">‹</button><label><span>${date===today?'今天':date}</span><input id="${kind}Date" type="date" aria-label="${kind==='plan'?'计划':'饮食'}日期" value="${date}" ${kind==='diet'?`max="${today}"`:''}></label><button data-action="change-day" data-kind="${kind}" data-delta="1" aria-label="后一天" ${kind==='diet' && date>=today?'disabled':''}>›</button></div>`;
}
function dietView() {
  const meals=state.meals.filter(m=>m.date===dietDate).sort((a,b)=>a.time.localeCompare(b.time));
  const calories=meals.reduce((n,m)=>n+Number(m.calories),0);
  return `<div class="diet-summary"><div><strong>${calories}</strong><span>当日摄入 / 千卡</span></div><div><strong>${meals.length}</strong><span>饮食记录</span></div><div><strong>${new Set(meals.map(m=>m.category)).size}</strong><span>已记录餐次</span></div></div>${dayPicker('diet',dietDate)}<div class="section-head diet-heading"><h2>好好吃饭，好好生活</h2><button data-action="add-meal">＋ 记一餐</button></div>${meals.length?`<div class="meal-grid">${meals.map(m=>`<article class="meal-card"><button class="meal-open" data-action="edit-meal" data-id="${esc(m.id)}" aria-label="编辑${esc(m.name)}"><div class="meal-photo">${m.photo?`<img src="${m.photo}" alt="${esc(m.name)}">`:'<span class="meal-placeholder">♧<small>饮食记录</small></span>'}<span class="meal-badge">${esc(m.category)}</span></div><div class="meal-info"><h3>${esc(m.name)}</h3><p><time>${esc(m.time)}</time><span>🔥 ${m.calories} 千卡</span></p>${m.note?`<p class="meal-note">${esc(m.note)}</p>`:''}</div></button><button class="meal-delete" data-action="delete-meal" data-id="${esc(m.id)}" aria-label="删除${esc(m.name)}">删除</button></article>`).join('')}</div>`:'<div class="empty">这一天还没有饮食记录<br><small>拍张照片，记录今天吃了什么</small><button class="primary-btn solid" data-action="add-meal">＋ 添加饮食</button></div>'}`;
}
function showMealModal(id) {
  const m=state.meals.find(m=>m.id===id), value=(k,f='')=>esc(m?.[k]??f);
  openModal(`<h2>${m?'编辑':'记录'}饮食</h2><form id="mealForm" class="form-card modal-form"><input type="hidden" name="id" value="${value('id')}"><div class="form-grid"><div class="field"><label>日期</label><input type="date" name="date" max="${today}" value="${value('date',dietDate)}" required></div><div class="field"><label>时间</label><input type="time" name="time" value="${value('time',new Date().toTimeString().slice(0,5))}" required></div><div class="field full"><label>餐次</label><div class="select-wrap"><select name="category">${['早餐','午餐','晚餐','加餐'].map(c=>`<option ${m?.category===c?'selected':''}>${c}</option>`).join('')}</select></div></div><div class="field full"><label>吃了什么</label><input name="name" maxlength="50" placeholder="例如：鸡蛋、牛奶、全麦面包" value="${value('name')}" required></div><div class="field full"><label>热量（千卡，手动填写）</label><input type="number" name="calories" min="0" max="20000" step="1" value="${value('calories')}" required></div><div class="field full"><label>饮食照片（可选）</label><div id="mealImagePreview" class="meal-image-preview">${m?.photo?`<img src="${m.photo}" alt="饮食照片预览">`:''}</div><input id="mealPhoto" type="file" accept="image/*"><input id="mealPhotoData" type="hidden" name="photo" value="${value('photo')}"></div><div class="field full"><label>备注（可选）</label><textarea name="note" maxlength="300">${value('note')}</textarea></div></div><button class="primary-btn solid">保存饮食</button></form>`);
}
function updateMeal(data) {
  const id=data.get('id'), date=data.get('date'), time=data.get('time'), name=data.get('name').trim(), calories=Number(data.get('calories'));
  if(!validDate(date) || date>today || !/^\d{2}:\d{2}$/.test(time) || !name || !Number.isFinite(calories) || calories<0 || calories>20000) return toast('请填写有效的饮食记录');
  const m={id:id||crypto.randomUUID(),date,time,name,calories,category:data.get('category'),note:data.get('note').trim(),photo:data.get('photo')};
  const index=state.meals.findIndex(m=>m.id===id);
  if(index>=0) state.meals[index]=m; else state.meals.push(m);
  save(); dietDate=date; closeModal(); render(); showNotice('饮食已保存',`${date} 的饮食日记已更新。`);
}
function compressPhoto(file) {
  if(!file.type.startsWith('image/')) return Promise.reject(new Error('请选择图片文件'));
  if(file.size>20*1024*1024) return Promise.reject(new Error('请选择小于 20MB 的照片'));
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{const scale=Math.min(1,1000/Math.max(img.width,img.height)), canvas=document.createElement('canvas'); canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/jpeg',.75));};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('图片无法读取，请使用 JPG 或 PNG 格式'));};img.src=url;
  });
}
function refreshLocalData() {
  if(!activeUsername) return;
  const newToday=localDate();
  if(newToday!==today) { if(planDate===today)planDate=newToday;if(dietDate===today)dietDate=newToday;today=newToday; }
  state=loadState(activeUsername);
  if(currentPage!=='checkin' && !document.querySelector('#modalRoot form')) renderApp();
}
window.addEventListener('storage',event=>{if(event.key?.startsWith('lianban-v3-')) refreshLocalData();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible') refreshLocalData();});

function swipeRow(kind,id,content) {
  return `<div class="swipe-row" data-swipe-kind="${kind}" data-swipe-id="${esc(id)}"><button class="swipe-delete" data-action="delete-${kind}" data-id="${esc(id)}" tabindex="-1" aria-label="删除计划">删除</button><div class="swipe-content">${content}</div></div>`;
}
let gesture=null, suppressClickUntil=0;
document.addEventListener('pointerdown',e=>{
  const row=e.target.closest('.swipe-row');if(!row || e.button!==0 || e.target.closest('button,input'))return;
  gesture={row,x:e.clientX,y:e.clientY,opened:row.classList.contains('revealed'),horizontal:false,pointer:e.pointerId};
});
document.addEventListener('pointermove',e=>{
  if(!gesture || e.pointerId!==gesture.pointer)return;
  const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
  if(!gesture.horizontal && Math.abs(dy)>12 && Math.abs(dy)>Math.abs(dx)){gesture=null;return;}
  if(Math.abs(dx)>12 && Math.abs(dx)>Math.abs(dy)*1.5) {
    gesture.horizontal=true;
    gesture.row.classList.toggle('revealed',dx>35 || (gesture.opened && dx>-35));
    gesture.row.querySelector('.swipe-delete').tabIndex=gesture.row.classList.contains('revealed')?0:-1;
  }
});
function endSwipe(){if(gesture?.horizontal)suppressClickUntil=Date.now()+400;gesture=null;}
document.addEventListener('pointerup',endSwipe);document.addEventListener('pointercancel',()=>{gesture=null;});
document.addEventListener('click',e=>{if(Date.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);

renderApp();
