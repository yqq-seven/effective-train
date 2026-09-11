const todayKey = new Date().toISOString().slice(0, 10);

const defaults = {
  user: { name: '林夏', weight: 56.8, streak: 6, score: 168 },
  checkins: [],
  activePlan: { name: '核心唤醒计划', type: '核心训练', detail: '平板支撑 3组 · 卷腹 4组', duration: 25, progress: 0 },
  weights: [58.2, 57.8, 57.6, 57.3, 57.1, 56.9, 56.8],
  friends: [
    { id: 1, name: '周舟', initial: '舟', color: '#9aaa9b', score: 212, streak: 12 },
    { id: 2, name: '阿柚', initial: '柚', color: '#c18f9f', score: 194, streak: 9 },
    { id: 3, name: '陈默', initial: '默', color: '#8d91ad', score: 153, streak: 5 }
  ],
  feed: [
    { id: 101, friendId: 1, time: '今天 07:42', type: '跑步训练', text: '晨跑结束！今天的风很舒服 🌿', duration: 36, calories: 286, likes: 5, liked: false, comments: ['阿柚：太自律啦！'] },
    { id: 102, friendId: 2, time: '昨天 20:16', type: '下肢力量', text: '深蹲最后一组突破了自己的记录。', duration: 48, calories: 320, likes: 8, liked: true, comments: [] }
  ]
};

let state = loadState();
let currentPage = 'home';
let uploadedPhoto = '';

function loadState() {
  try { return { ...structuredClone(defaults), ...JSON.parse(localStorage.getItem('lianban-state') || '{}') }; }
  catch { return structuredClone(defaults); }
}
function save() { localStorage.setItem('lianban-state', JSON.stringify(state)); }
function hasTodayCheckin() { return state.checkins.some(item => item.date === todayKey); }
function dateLabel() { return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()); }
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => el.classList.remove('show'), 1800); }
function esc(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

document.querySelector('#todayText').textContent = dateLabel();
document.addEventListener('click', handleClick);
document.addEventListener('submit', handleSubmit);
document.addEventListener('change', handleChange);

function handleClick(event) {
  const nav = event.target.closest('[data-page]');
  if (nav) return navigate(nav.dataset.page);
  const action = event.target.closest('[data-action]');
  if (!action) return;
  const type = action.dataset.action;
  if (type === 'go-profile') navigate('profile');
  if (type === 'go-checkin') navigate('checkin');
  if (type === 'like') toggleLike(Number(action.dataset.id));
  if (type === 'comment') showComments(Number(action.dataset.id));
  if (type === 'nudge') toast(`已提醒${action.dataset.name}来打卡`);
  if (type === 'close-modal') closeModal();
  if (type === 'use-template') useTemplate(action.dataset.name, action.dataset.detail, Number(action.dataset.duration));
  if (type === 'create-plan') showPlanModal();
  if (type === 'weight') showWeightModal();
  if (type === 'add-friend') addFriend(action.dataset.name);
}

function handleSubmit(event) {
  event.preventDefault();
  if (event.target.id === 'checkinForm') submitCheckin(new FormData(event.target));
  if (event.target.id === 'commentForm') submitComment(new FormData(event.target));
  if (event.target.id === 'planForm') submitPlan(new FormData(event.target));
  if (event.target.id === 'weightForm') submitWeight(new FormData(event.target));
  if (event.target.id === 'friendForm') searchFriend(new FormData(event.target));
}

function handleChange(event) {
  if (event.target.id === 'photo') {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => { uploadedPhoto = e.target.result; document.querySelector('#photoPreview').innerHTML = `<img src="${uploadedPhoto}" alt="训练照片预览">`; };
    reader.readAsDataURL(file);
  }
}

function navigate(page) {
  currentPage = page;
  const titles = { home: hasTodayCheckin() ? '今天也很棒，林夏' : '早上好，林夏', checkin: '记录今日训练', plans: '我的训练计划', ranking: '好友排行榜', profile: '个人中心' };
  document.querySelector('#pageTitle').textContent = titles[page];
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  render(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function render() {
  const views = { home: homeView, checkin: checkinView, plans: plansView, ranking: rankingView, profile: profileView };
  document.querySelector('#app').innerHTML = views[currentPage]();
}

function homeView() {
  const checked = hasTodayCheckin();
  return `
    <section class="hero-card">
      <div class="hero-top"><span class="status-pill">${checked ? '✓ 今日已完成' : '○ 今日待完成'}</span><span>连续 ${state.user.streak} 天 🔥</span></div>
      <h2>${checked ? '打卡成功，坚持住！' : '今天也要动起来呀'}</h2>
      <p>${checked ? '每一次坚持，都在靠近更好的自己。' : '完成今日计划，收获 15 积分'}</p>
      <button class="primary-btn" data-action="go-checkin">${checked ? '再记一项训练' : '立即打卡'}</button>
    </section>
    <section class="section">
      <div class="section-head"><h2>今日计划</h2><button data-page="plans">查看全部</button></div>
      ${planCard(state.activePlan)}
    </section>
    <section class="section">
      <div class="section-head"><h2>好友动态</h2><span>${state.friends.length} 位练伴</span></div>
      <div class="feed-list">${state.feed.map(feedCard).join('')}</div>
    </section>`;
}

function planCard(plan) {
  const icons = { '跑步训练':'🏃', '核心训练':'◉', '上肢力量':'🏋️', '下肢力量':'🦵', '拉伸恢复':'🧘' };
  return `<article class="plan-card"><div class="plan-icon">${icons[plan.type] || '✓'}</div><div class="plan-content"><div class="row-between"><h3>${esc(plan.name)}</h3><strong>${plan.duration}′</strong></div><p>${esc(plan.detail)}</p><div class="progress"><i style="width:${plan.progress || 0}%"></i></div></div></article>`;
}

function feedCard(item) {
  const friend = state.friends.find(f => f.id === item.friendId) || { name: '我', initial: '夏', color: '#9a7898' };
  return `<article class="feed-card"><div class="friend-head"><div class="friend-avatar" style="background:${friend.color}">${friend.initial}</div><div class="friend-meta"><strong>${friend.name}</strong><p>${item.time} · ${item.type}</p></div><button class="icon-btn" data-action="nudge" data-name="${friend.name}" aria-label="催打卡">↗</button></div><p class="feed-text">${esc(item.text)}</p><div class="feed-stats"><span class="mini-chip">⏱ ${item.duration} 分钟</span><span class="mini-chip">⌁ ${item.calories} 千卡</span></div><div class="feed-actions"><button class="${item.liked?'liked':''}" data-action="like" data-id="${item.id}">♡ ${item.likes}</button><button data-action="comment" data-id="${item.id}">评论 ${item.comments.length || ''}</button><button data-action="nudge" data-name="${friend.name}">催打卡</button></div></article>`;
}

function checkinView() {
  return `<div class="date-mode"><button class="active">今日打卡</button><button type="button" onclick="document.querySelector('#checkDate').focus()">历史补签</button></div>
  <form id="checkinForm" class="form-card">
    <div class="form-grid">
      <div class="field full"><label for="checkDate">训练日期</label><input id="checkDate" name="date" type="date" max="${todayKey}" value="${todayKey}" required></div>
      <div class="field full"><label for="type">运动类型</label><select id="type" name="type"><option>核心训练</option><option>跑步训练</option><option>上肢力量</option><option>下肢力量</option><option>拉伸恢复</option><option>其他运动</option></select></div>
      <div class="field full"><label for="exercise">训练动作</label><input id="exercise" name="exercise" placeholder="例如：平板支撑" required></div>
      <div class="field"><label for="sets">组数</label><input id="sets" name="sets" type="number" min="1" placeholder="3"></div>
      <div class="field"><label for="reps">每组次数</label><input id="reps" name="reps" type="number" min="1" placeholder="12"></div>
      <div class="field"><label for="duration">时长（分钟）</label><input id="duration" name="duration" type="number" min="1" placeholder="30" required></div>
      <div class="field"><label for="calories">消耗（千卡）</label><input id="calories" name="calories" type="number" min="0" placeholder="180" required></div>
      <div class="field full"><label>训练照片（可选）</label><div class="upload-box" id="photoPreview"><span>＋ 添加一张训练照片</span><input id="photo" type="file" accept="image/*"></div></div>
      <div class="field full"><label for="note">备注</label><textarea id="note" name="note" placeholder="记录今天的状态或小突破…"></textarea></div>
      <div class="field full"><label for="visibility">谁可以看</label><select id="visibility" name="visibility"><option value="public">好友可见</option><option value="private">仅自己可见</option></select></div>
    </div><button class="primary-btn solid" type="submit">完成打卡 · +10 积分</button>
  </form>`;
}

const templates = [
  { name:'轻松跑 5 公里', type:'跑步训练', detail:'热身 5 分钟 · 轻松跑 · 拉伸', duration:40, icon:'🏃' },
  { name:'核心唤醒计划', type:'核心训练', detail:'平板支撑 3组 · 卷腹 4组', duration:25, icon:'◉' },
  { name:'上肢力量进阶', type:'上肢力量', detail:'俯卧撑 · 哑铃划船 · 推举', duration:45, icon:'🏋️' },
  { name:'下肢塑形训练', type:'下肢力量', detail:'深蹲 · 箭步蹲 · 臀桥', duration:40, icon:'🦵' },
  { name:'睡前舒缓拉伸', type:'拉伸恢复', detail:'肩颈 · 腿后侧 · 髋部拉伸', duration:15, icon:'🧘' }
];
function plansView() {
  return `<section><div class="section-head"><h2>进行中的计划</h2><button data-action="create-plan">＋ 自定义</button></div>${planCard(state.activePlan)}</section>
  <section class="section"><div class="section-head"><h2>精选模板</h2><span>适合日常训练</span></div><div class="template-list">${templates.map(t => `<article class="template-card"><div class="template-icon">${t.icon}</div><div><h3>${t.name}</h3><p>${t.detail}</p><span class="tag">${t.type} · ${t.duration} 分钟</span></div><button class="icon-btn" data-action="use-template" data-name="${t.name}" data-detail="${t.detail}" data-duration="${t.duration}" data-type="${t.type}">＋</button></article>`).join('')}</div></section>`;
}

function rankingView() {
  const all = [...state.friends.map(f => ({...f})), { id:0, name:'林夏（我）', initial:'夏', color:'#9a7898', score:state.user.score, streak:state.user.streak }].sort((a,b)=>b.score-a.score);
  const top = all.slice(0,3);
  const podiumOrder = [top[1], top[0], top[2]].filter(Boolean);
  return `<div class="row-between"><span class="status-pill" style="background:var(--surface-2);color:var(--primary)">本周综合积分</span><span style="font-size:12px;color:var(--muted)">周一至今天</span></div>
  <section class="ranking-podium">${podiumOrder.map((p,i) => { const rank = i===0?2:i===1?1:3; return `<div class="podium-person ${rank===1?'first':''}"><div class="podium-avatar" style="background:${p.color}">${p.initial}<span class="rank-badge">${rank===1?'👑':'NO.'+rank}</span></div><strong>${p.name}</strong><p>${p.score} 分</p></div>` }).join('')}</section>
  <section class="rank-list">${all.map((p,i)=>`<article class="rank-row ${p.id===0?'me':''}"><span class="rank-number">${i+1}</span><div class="small-avatar" style="background:${p.color}">${p.initial}</div><div><strong>${p.name}</strong><div style="font-size:10px;color:var(--muted)">连续 ${p.streak} 天</div></div><div class="rank-score"><strong>${p.score}</strong><span>综合积分</span></div></article>`).join('')}</section>
  <section class="section"><div class="section-head"><h2>积分规则</h2></div><div class="form-card" style="font-size:12px;color:var(--muted);line-height:2">有效打卡 +10　·　连续打卡每日 +2<br>完成训练计划 +5　·　收到点赞 +1<br>历史补签 +5，不计入连续天数</div></section>`;
}

function profileView() {
  const totalMinutes = state.checkins.reduce((n,c)=>n+Number(c.duration), 0) + 184;
  const totalCalories = state.checkins.reduce((n,c)=>n+Number(c.calories), 0) + 1280;
  const min = Math.min(...state.weights)-.5, max = Math.max(...state.weights)+.2;
  return `<section class="profile-card"><div class="profile-main"><div class="profile-big-avatar">夏</div><div><h2>${state.user.name}</h2><p>@linxia · 和朋友一起坚持运动</p></div></div><div class="metric-row"><div><strong>${state.user.streak}</strong><span>连续天数</span></div><div><strong>${state.user.score}</strong><span>综合积分</span></div><div><strong>${state.friends.length}</strong><span>练伴好友</span></div></div></section>
  <section class="section"><div class="section-head"><h2>本周数据</h2><span>持续变好的你</span></div><div class="stats-grid"><div class="stat-card"><span>训练时长</span><strong>${totalMinutes}<small style="font-size:11px"> 分钟</small></strong></div><div class="stat-card"><span>消耗热量</span><strong>${totalCalories}<small style="font-size:11px"> 千卡</small></strong></div></div></section>
  <section class="section"><div class="section-head"><h2>体重趋势</h2><button data-action="weight">＋ 记录体重</button></div><div class="profile-card"><div class="row-between"><span style="font-size:12px;color:var(--muted)">最近 7 次记录</span><strong>${state.weights.at(-1)} kg</strong></div><div class="weight-chart">${state.weights.map((w,i)=>{const h=45+(w-min)/(max-min)*65;return `<div class="bar-wrap"><span class="bar-value">${w}</span><i class="bar" style="height:${h}px"></i><small>${i===6?'今天':i+1}</small></div>`}).join('')}</div></div></section>
  <section class="section"><div class="section-head"><h2>我的练伴</h2><span>搜索用户名添加</span></div><form id="friendForm" class="friend-search"><input name="query" placeholder="输入朋友的用户名" required><button class="secondary-btn">搜索</button></form><div id="friendResults" class="friend-list">${state.friends.map(friendRow).join('')}</div></section>`;
}

function friendRow(f) { return `<div class="friend-row"><div class="small-avatar" style="background:${f.color}">${f.initial}</div><div class="friend-meta"><strong>${f.name}</strong><p>@${['zhouzhou','youzi','chenmo'][f.id-1] || 'friend'}</p></div><button data-action="nudge" data-name="${f.name}">催打卡</button></div>`; }

function submitCheckin(data) {
  const item = Object.fromEntries(data.entries());
  const isBackfill = item.date !== todayKey;
  state.checkins.unshift({ ...item, photo: uploadedPhoto, createdAt: Date.now() });
  state.user.score += isBackfill ? 5 : 10;
  if (!isBackfill && state.activePlan.type === item.type) { state.activePlan.progress = 100; state.user.score += 5; }
  if (item.visibility === 'public') state.feed.unshift({ id:Date.now(), friendId:0, time:isBackfill?'历史补签':'刚刚', type:item.type, text:item.note || `${item.exercise}，完成 ${item.sets || '-'} 组训练。`, duration:Number(item.duration), calories:Number(item.calories), likes:0, liked:false, comments:[] });
  save(); uploadedPhoto=''; toast(isBackfill ? '补签成功，获得 5 积分' : '打卡成功，做得真棒！'); navigate('home');
}
function toggleLike(id) { const f=state.feed.find(x=>x.id===id); if(!f)return; f.liked=!f.liked; f.likes+=f.liked?1:-1; save(); render(); }
function showComments(id) { const f=state.feed.find(x=>x.id===id); openModal(`<h2>评论</h2><div class="comment-list">${f.comments.length?f.comments.map(c=>`<div class="comment">${esc(c)}</div>`).join(''):'<div class="empty">还没有评论，来鼓励一下吧</div>'}</div><form id="commentForm" class="comment-input"><input type="hidden" name="id" value="${id}"><input name="text" placeholder="写下你的鼓励…" required><button class="secondary-btn">发送</button></form>`); }
function submitComment(data) { const f=state.feed.find(x=>x.id===Number(data.get('id'))); f.comments.push(`林夏：${data.get('text')}`); save(); closeModal(); toast('评论已发送'); render(); }
function useTemplate(name, detail, duration) { const t=templates.find(x=>x.name===name); state.activePlan={ name, detail, duration, type:t?.type||'核心训练', progress:0 }; save(); toast('已设为当前训练计划'); render(); }
function showPlanModal(){ openModal(`<h2>自定义训练计划</h2><form id="planForm" class="form-card" style="margin-top:15px"><div class="form-grid"><div class="field full"><label>计划名称</label><input name="name" required placeholder="例如：我的晨间训练"></div><div class="field full"><label>运动类型</label><select name="type"><option>跑步训练</option><option>核心训练</option><option>上肢力量</option><option>下肢力量</option><option>拉伸恢复</option></select></div><div class="field full"><label>训练内容</label><textarea name="detail" required placeholder="填写动作和组数"></textarea></div><div class="field full"><label>预计时长（分钟）</label><input name="duration" type="number" min="1" required></div></div><button class="primary-btn solid">保存计划</button></form>`); }
function submitPlan(data){ state.activePlan={...Object.fromEntries(data.entries()), duration:Number(data.get('duration')), progress:0}; save(); closeModal(); toast('训练计划已保存'); render(); }
function showWeightModal(){ openModal(`<h2>记录体重</h2><form id="weightForm" class="form-card" style="margin-top:15px"><div class="field"><label>当前体重（kg）</label><input name="weight" type="number" min="20" max="300" step="0.1" value="${state.weights.at(-1)}" required></div><button class="primary-btn solid">保存记录</button></form>`); }
function submitWeight(data){ const w=Number(data.get('weight')); state.weights=[...state.weights.slice(-6),w]; state.user.weight=w; save(); closeModal(); toast('体重记录已更新'); render(); }
function searchFriend(data){ const q=data.get('query').trim(); const result={id:99,name:q,initial:q.slice(0,1),color:'#a890a8',score:126,streak:4}; document.querySelector('#friendResults').innerHTML=`<div class="friend-row"><div class="small-avatar" style="background:${result.color}">${esc(result.initial)}</div><div class="friend-meta"><strong>${esc(result.name)}</strong><p>@${esc(q.toLowerCase())}</p></div><button data-action="add-friend" data-name="${esc(q)}">添加好友</button></div>`; }
function addFriend(name){ if(state.friends.some(f=>f.name===name)) return toast('已经是你的练伴啦'); state.friends.push({id:Date.now(),name,initial:name.slice(0,1),color:'#a890a8',score:126,streak:4}); save(); toast(`已添加 ${name} 为练伴`); render(); }
function openModal(content){ document.querySelector('#modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-handle"></div><div class="row-between" style="margin-bottom:8px"><span></span><button class="icon-btn" data-action="close-modal">×</button></div>${content}</div></div>`; }
function closeModal(){ document.querySelector('#modalRoot').innerHTML=''; }

render();
