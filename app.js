const today = new Date().toISOString().slice(0, 10);
const accounts = [
  { username: 'yqq', password: '20030907' },
  { username: 'ybb', password: '020020901' },
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

function freshState(username) {
  return {
    user: { username, name: username, avatar: '', weight: null, streak: 0, score: 0 },
    checkins: [], weights: [], feed: [],
    activePlan: { name: '尚未设置计划', type: '无氧', detail: '从训练模板中选择或创建计划', duration: 0, progress: 0 },
    friends: accounts.filter(a => a.username !== username).map((a, i) => ({ id: i + 1, username: a.username, name: a.username, initial: a.username[0].toUpperCase(), color: colors[i + 1], score: 0, streak: 0 }))
  };
}
function loadState(username) {
  try { return JSON.parse(localStorage.getItem(`lianban-v3-${username}`)) || freshState(username); }
  catch { return freshState(username); }
}
function save() { if (activeUsername) localStorage.setItem(`lianban-v3-${activeUsername}`, JSON.stringify(state)); }
function esc(v = '') { return String(v).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
function dateText(date = new Date()) { return new Intl.DateTimeFormat('zh-CN', { month:'long', day:'numeric', weekday:'long' }).format(date); }
function hasToday() { return state.checkins.some(c => c.date === today); }
function avatarHTML(user, cls = 'small-avatar') {
  return user.avatar ? `<div class="${cls} avatar-image" style="background-image:url('${user.avatar}')"></div>` : `<div class="${cls}" style="background:${user.color || '#d9c7d8'}">${esc((user.name || user.username || '?')[0].toUpperCase())}</div>`;
}
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => el.classList.remove('show'), 1800); }

document.addEventListener('click', handleClick);
document.addEventListener('submit', handleSubmit);
document.addEventListener('change', handleChange);

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
  if (action === 'create-plan') showPlanModal();
  if (action === 'use-template') useTemplate(el.dataset.name, el.dataset.type, el.dataset.detail, Number(el.dataset.duration));
  if (action === 'nudge') toast(`已提醒 ${el.dataset.name} 来打卡`);
  if (action === 'report-day') { reportDate = el.dataset.date; render(); }
  if (action === 'report-month') changeReportMonth(Number(el.dataset.delta));
  if (action === 'edit-record') startEditRecord(Number(el.dataset.id));
  if (action === 'delete-record') confirmDeleteRecord(Number(el.dataset.id));
}

function handleSubmit(e) {
  e.preventDefault();
  const data = new FormData(e.target);
  if (e.target.id === 'loginForm') login(data);
  if (e.target.id === 'checkinForm') submitCheckin(data);
  if (e.target.id === 'profileForm') updateProfile(data);
  if (e.target.id === 'weightForm') updateWeight(data);
  if (e.target.id === 'planForm') updatePlan(data);
}

function handleChange(e) {
  if (e.target.id === 'type') updateActionOptions(e.target.value);
  if (e.target.id === 'reportDate') { reportDate = e.target.value; reportMonth = reportDate.slice(0, 7); render(); }
  if (e.target.id === 'photo' || e.target.id === 'avatarFile') {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      if (e.target.id === 'photo') { uploadedPhoto = event.target.result; document.querySelector('#photoPreview').innerHTML = `<img src="${uploadedPhoto}" alt="训练照片预览">`; }
      else document.querySelector('#avatarPreview').style.backgroundImage = `url('${event.target.result}')`, document.querySelector('#avatarData').value = event.target.result;
    };
    reader.readAsDataURL(file);
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
  document.querySelector('#todayText').textContent = dateText();
  document.querySelector('.avatar-button').innerHTML = state.user.avatar ? `<span class="header-avatar" style="background-image:url('${state.user.avatar}')"></span><i class="online-dot"></i>` : `<span>${esc(state.user.name[0].toUpperCase())}</span><i class="online-dot"></i>`;
  navigate(currentPage, false);
}
function navigate(page, scroll = true) {
  currentPage = page;
  if (page !== 'checkin') editingCheckinId = null;
  const titles = { home: hasToday() ? `今天也很棒，${state.user.name}` : `你好，${state.user.name}`, checkin:'记录今日训练', plans:'我的训练计划', ranking:'好友排行榜', profile:'个人中心' };
  document.querySelector('#pageTitle').textContent = titles[page];
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  render(); if (scroll) window.scrollTo({ top:0, behavior:'smooth' });
}
function render() { document.querySelector('#app').innerHTML = ({ home:homeView, checkin:checkinView, plans:plansView, ranking:rankingView, profile:profileView })[currentPage](); }

function loginView() {
  return `<section class="login-screen"><div class="brand-mark">练</div><p class="eyebrow">和朋友一起坚持</p><h1>登录练伴</h1><p class="login-tip">记录每一次训练，看见每一天进步</p><form id="loginForm" class="form-card login-card"><div class="field"><label>用户名</label><input name="username" autocomplete="username" placeholder="请输入用户名" required></div><div class="field"><label>密码</label><input name="password" type="password" autocomplete="current-password" placeholder="请输入密码" required></div><button class="primary-btn solid">登录</button></form></section>`;
}

function homeView() {
  const checked = hasToday();
  return `<section class="hero-card"><div class="hero-top"><span class="status-pill">${checked ? '✓ 今日已完成' : '○ 今日待完成'}</span><span>连续 ${state.user.streak} 天 🔥</span></div><h2>${checked ? '今天已经完成打卡' : '今天也要动起来呀'}</h2><p>${checked ? '保持节奏，积累看得见的改变。' : '完成一次训练，获得 10 积分'}</p><button class="primary-btn" data-action="go-checkin">${checked ? '再记一项训练' : '立即打卡'}</button></section>
  <section class="section"><div class="section-head"><h2>今日训练</h2><button data-page="plans">管理计划</button></div>${planCard(state.activePlan)}</section>
  <section class="section"><div class="section-head"><h2>最近记录</h2><button data-page="profile">查看报表</button></div>${state.checkins.length ? `<div class="feed-list">${state.checkins.slice(0,3).map(recordCard).join('')}</div>` : '<div class="empty">还没有训练记录<br><small>完成第一次打卡后会显示在这里</small></div>'}</section>`;
}
function planCard(plan) { return `<article class="plan-card"><div class="plan-icon">${plan.type === '有氧' ? '🏃' : '🏋️'}</div><div class="plan-content"><div class="row-between"><h3>${esc(plan.name)}</h3><strong>${plan.duration || 0}′</strong></div><p>${esc(plan.detail)}</p><div class="progress"><i style="width:${plan.progress || 0}%"></i></div></div></article>`; }
function recordCard(c) { return `<article class="feed-card"><div class="row-between"><div><h3>${c.type} · ${c.exercise}</h3><p class="record-date">${c.date}${c.date === today ? ' · 今天' : ''}</p></div><span class="tag">${c.duration} 分钟</span></div><div class="feed-stats"><span class="mini-chip">${c.sets ? `${c.sets} 组 × ${c.reps || '-'} 次` : '持续训练'}</span><span class="mini-chip">${c.calories || 0} 千卡</span></div>${c.note ? `<p class="feed-text">${esc(c.note)}</p>` : ''}<div class="record-actions"><button data-action="edit-record" data-id="${c.createdAt}">编辑</button><button class="danger-text" data-action="delete-record" data-id="${c.createdAt}">删除</button></div></article>`; }

function checkinView() {
  const editing = state.checkins.find(c => c.createdAt === editingCheckinId);
  const value = (key, fallback = '') => esc(editing?.[key] ?? fallback);
  const type = editing?.type || '无氧';
  return `<div class="date-mode"><button class="active">${editing ? '编辑记录' : '今日打卡'}</button><button type="button" onclick="document.querySelector('#checkDate').focus()">历史补签</button></div><form id="checkinForm" class="form-card"><div class="form-grid">
    <input name="recordId" type="hidden" value="${editingCheckinId || ''}">
    <div class="field full"><label>训练日期</label><input id="checkDate" name="date" type="date" max="${today}" value="${value('date', today)}" required></div>
    <div class="field full"><label>运动类型</label><div class="select-wrap"><select id="type" name="type" required><option value="无氧" ${type==='无氧'?'selected':''}>无氧</option><option value="有氧" ${type==='有氧'?'selected':''}>有氧</option></select></div></div>
    <div class="field full"><label>训练动作</label><div class="select-wrap"><select id="exercise" name="exercise" required>${actionsByType[type].map(x => `<option ${editing?.exercise===x?'selected':''}>${x}</option>`).join('')}</select></div><small class="field-help">动作会根据运动类型自动切换</small></div>
    <div class="field strength-field ${type==='有氧'?'hidden-field':''}"><label>组数</label><input name="sets" type="number" min="1" placeholder="3" value="${value('sets')}"></div><div class="field strength-field ${type==='有氧'?'hidden-field':''}"><label>每组次数</label><input name="reps" type="number" min="1" placeholder="12" value="${value('reps')}"></div>
    <div class="field"><label>时长（分钟）</label><input name="duration" type="number" min="1" placeholder="30" value="${value('duration')}" required></div><div class="field"><label>消耗（千卡）</label><input name="calories" type="number" min="0" placeholder="180" value="${value('calories')}"></div>
    <div class="field full"><label>训练照片（可选）</label><div class="upload-box" id="photoPreview"><span>＋ 添加训练照片</span><input id="photo" type="file" accept="image/*"></div></div>
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
function plansView() { return `<section><div class="section-head"><h2>进行中的计划</h2><button data-action="create-plan">＋ 自定义</button></div>${planCard(state.activePlan)}</section><section class="section"><div class="section-head"><h2>训练模板</h2><span>点击添加</span></div><div class="template-list">${templates.map(t => `<article class="template-card"><div class="template-icon">${t.icon}</div><div><h3>${t.name}</h3><p>${t.detail}</p><span class="tag">${t.type} · ${t.duration} 分钟</span></div><button class="icon-btn" data-action="use-template" data-name="${t.name}" data-type="${t.type}" data-detail="${t.detail}" data-duration="${t.duration}">＋</button></article>`).join('')}</div></section>`; }

function rankingView() {
  const all = [...state.friends, { id:0, username:state.user.username, name:`${state.user.name}（我）`, initial:state.user.name[0], avatar:state.user.avatar, color:colors[0], score:state.user.score, streak:state.user.streak }].sort((a,b) => b.score-a.score);
  return `<div class="row-between"><span class="status-pill report-pill">本周综合积分</span><span class="subtle">数据从零开始</span></div><section class="rank-list section">${all.map((p,i) => `<article class="rank-row ${p.id===0?'me':''}"><span class="rank-number">${i+1}</span>${avatarHTML(p)}<div><strong>${esc(p.name)}</strong><div class="subtle">连续 ${p.streak} 天</div></div><div class="rank-score"><strong>${p.score}</strong><span>综合积分</span></div></article>`).join('')}</section><section class="section"><div class="form-card rule-copy">有效打卡 +10　·　连续打卡每日 +2<br>完成训练计划 +5　·　收到点赞 +1<br>历史补签 +5，不计入连续天数</div></section>`;
}

function profileView() {
  const minutes = state.checkins.reduce((n,c) => n + Number(c.duration || 0), 0);
  const calories = state.checkins.reduce((n,c) => n + Number(c.calories || 0), 0);
  return `<section class="profile-card"><div class="profile-main">${avatarHTML(state.user, 'profile-big-avatar')}<div class="profile-copy"><h2>${esc(state.user.name)}</h2><p>@${state.user.username} · 和朋友一起坚持运动</p></div><button class="secondary-btn" data-action="edit-profile">编辑</button></div><div class="metric-row"><div><strong>${state.user.streak}</strong><span>连续天数</span></div><div><strong>${state.user.score}</strong><span>综合积分</span></div><div><strong>${state.friends.length}</strong><span>练伴好友</span></div></div></section>
  <section class="section"><div class="section-head"><h2>训练统计报表</h2><span>按日期下钻</span></div>${reportView()}</section>
  <section class="section"><div class="section-head"><h2>全部训练记录</h2><span>${state.checkins.length} 条</span></div>${state.checkins.length ? `<div class="feed-list">${state.checkins.map(recordCard).join('')}</div>` : '<div class="empty">暂无训练记录</div>'}</section>
  <section class="section"><div class="section-head"><h2>累计数据</h2></div><div class="stats-grid"><div class="stat-card"><span>训练时长</span><strong>${minutes}<small> 分钟</small></strong></div><div class="stat-card"><span>消耗热量</span><strong>${calories}<small> 千卡</small></strong></div></div></section>
  <section class="section"><div class="section-head"><h2>体重趋势</h2><button data-action="weight">＋ 记录体重</button></div><div class="profile-card">${weightChart()}</div></section>
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
  if (item.type === '有氧') { item.sets = ''; item.reps = ''; }
  if (recordId) {
    const index = state.checkins.findIndex(c=>c.createdAt===recordId); if (index >= 0) state.checkins[index] = item;
    state.user.streak = calculateStreak(state.checkins); save(); uploadedPhoto=''; editingCheckinId=null; reportDate=item.date; reportMonth=item.date.slice(0,7); navigate('home'); showNotice('修改已保存', '训练记录已经成功更新。'); return;
  }
  const backfill = item.date !== today;
  state.checkins.unshift(item); state.user.score += backfill ? 5 : 10;
  if (!backfill && state.activePlan.type === item.type) { state.activePlan.progress = 100; state.user.score += 5; }
  state.user.streak = calculateStreak(state.checkins);
  save(); uploadedPhoto = ''; reportDate = item.date; reportMonth=item.date.slice(0,7); navigate('home'); showNotice(backfill ? '补签成功' : '打卡成功', backfill ? '历史记录已保存，获得 5 积分。' : '训练记录已保存，做得真棒！');
}
function startEditRecord(id) { editingCheckinId=id; currentPage='checkin'; document.querySelector('#pageTitle').textContent='编辑训练记录'; document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page==='checkin')); render(); window.scrollTo({top:0,behavior:'smooth'}); }
function confirmDeleteRecord(id) { showConfirm('删除这条记录？', '删除后无法恢复，相关统计也会同步更新。', () => { state.checkins=state.checkins.filter(c=>c.createdAt!==id); state.user.streak=calculateStreak(state.checkins); save(); render(); showNotice('记录已删除','训练数据和统计报表已更新。'); }); }
function calculateStreak(items) { const unique = new Set(items.map(i=>i.date)); let d=new Date(), n=0; while(unique.has(d.toISOString().slice(0,10))){ n++; d.setDate(d.getDate()-1); } return n; }
function useTemplate(name,type,detail,duration) { state.activePlan={name,type,detail,duration,progress:0}; save(); render(); showNotice('计划已保存', `${name} 已设为当前训练计划。`); }
function showProfileEditor() { openModal(`<h2>编辑个人资料</h2><form id="profileForm" class="form-card modal-form"><div class="avatar-editor"><div id="avatarPreview" class="profile-big-avatar avatar-image" style="${state.user.avatar?`background-image:url('${state.user.avatar}')`:''}">${state.user.avatar?'':esc(state.user.name[0])}</div><label class="secondary-btn">更换头像<input id="avatarFile" type="file" accept="image/*" hidden></label><input id="avatarData" name="avatar" type="hidden" value="${state.user.avatar || ''}"></div><div class="field"><label>显示用户名</label><input name="name" maxlength="12" value="${esc(state.user.name)}" required></div><p class="field-help">登录账号 @${state.user.username} 不会改变</p><button class="primary-btn solid">保存资料</button></form>`); }
function updateProfile(data) { state.user.name=data.get('name').trim(); state.user.avatar=data.get('avatar'); save(); closeModal(); renderApp(); showNotice('资料已保存','用户名和头像已经更新。'); }
function showWeightModal() { openModal(`<h2>记录体重</h2><form id="weightForm" class="form-card modal-form"><div class="field"><label>记录日期</label><input name="date" type="date" max="${today}" value="${today}" required></div><div class="field"><label>体重（kg）</label><input name="weight" type="number" min="20" max="300" step="0.1" required></div><button class="primary-btn solid">保存记录</button></form>`); }
function updateWeight(data) { const date=data.get('date'), value=Number(data.get('weight')), existing=state.weights.findIndex(w=>typeof w==='object'&&w.date===date); if(existing>=0) state.weights[existing]={date,value}; else state.weights.push({date,value}); state.weights.sort((a,b)=>(a.date||'').localeCompare(b.date||'')); save(); closeModal(); render(); showNotice(existing>=0?'体重已更新':'体重已保存',`${date} 的体重记录为 ${value} kg。`); }
function weightChart() { const points=state.weights.filter(w=>typeof w==='object').slice(-10); if(!points.length) return '<div class="empty">暂无体重记录<br><small>记录后将自动生成趋势折线图</small></div>'; const values=points.map(p=>p.value), min=Math.min(...values)-.5, max=Math.max(...values)+.5, width=320, height=150, pad=24, x=i=>points.length===1?width/2:pad+i*(width-pad*2)/(points.length-1), y=v=>pad+(max-v)/(max-min)*(height-pad*2); const line=points.map((p,i)=>`${x(i)},${y(p.value)}`).join(' '); return `<div class="weight-latest"><span>最新 ${points.at(-1).date}</span><strong>${points.at(-1).value} kg</strong></div><div class="weight-svg-wrap"><svg class="weight-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="体重变化折线图"><line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" class="chart-axis"/><polyline points="${line}" class="chart-line"/>${points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.value)}" r="4" class="chart-point"/><text x="${x(i)}" y="${y(p.value)-9}" text-anchor="middle" class="chart-value">${p.value}</text><text x="${x(i)}" y="${height-5}" text-anchor="middle" class="chart-date">${p.date.slice(5)}</text>`).join('')}</svg></div>`; }
function showPlanModal() { openModal(`<h2>自定义训练计划</h2><form id="planForm" class="form-card modal-form"><div class="field"><label>计划名称</label><input name="name" required></div><div class="field"><label>类型</label><select name="type"><option>无氧</option><option>有氧</option></select></div><div class="field"><label>训练内容</label><input name="detail" required></div><div class="field"><label>预计时长（分钟）</label><input name="duration" type="number" min="1" required></div><button class="primary-btn solid">保存计划</button></form>`); }
function updatePlan(data) { state.activePlan={...Object.fromEntries(data.entries()),duration:Number(data.get('duration')),progress:0}; save(); closeModal(); render(); showNotice('计划已保存','新的训练计划已设为当前计划。'); }
function showNotice(title, message) { openModal(`<div class="notice-modal"><div class="notice-icon">✓</div><h2>${title}</h2><p>${message}</p><button class="primary-btn solid" data-action="close-modal">知道了</button></div>`); }
function showConfirm(title,message,onConfirm) { confirmHandler=onConfirm; openModal(`<div class="notice-modal"><div class="notice-icon warn">!</div><h2>${title}</h2><p>${message}</p><div class="confirm-actions"><button class="secondary-btn" data-action="close-modal">取消</button><button class="primary-btn solid danger-btn" data-action="confirm">确认删除</button></div></div>`); }
function openModal(content) { document.querySelector('#modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-handle"></div><div class="modal-close"><button class="icon-btn" data-action="close-modal">×</button></div>${content}</div></div>`; }
function closeModal() { document.querySelector('#modalRoot').innerHTML=''; }

renderApp();
