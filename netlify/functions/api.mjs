/**
 * MOSTIK API (Netlify Function)
 * ----------------------------
 * Единая точка входа: /api/* → этот handler.
 *
 * Модель доступа:
 *  - effective_role = demo_role || role (админ может «притворяться» ролью)
 *  - allowedAnimal() — владелец, admin или запись в animal_access
 *
 * Архитектурное правило:
 *  - План и факт разделены (prescription → administrations, diet_meals → food_logs)
 *
 * Основные модули ниже помечены комментариями-секциями.
 */
import { getDatabase } from '@netlify/database';
import crypto from 'node:crypto';

const db = getDatabase();
const json = (x, status=200, headers={}) => new Response(JSON.stringify(x), {status, headers:{'content-type':'application/json; charset=utf-8', ...headers}});
const parse = async r => { try{return await r.json()}catch{return {}} };
const id = () => crypto.randomUUID();
async function hashPassword(p){const salt=crypto.randomBytes(16).toString('hex'); const h=crypto.createHash('sha256').update(salt+':'+p).digest('hex'); return `${salt}:${h}`;}
async function checkPassword(p, stored){
  try{
    const [salt,h]=String(stored||'').split(':');
    if(!salt || !h || !/^[0-9a-f]{64}$/i.test(h)) return false;
    const x=crypto.createHash('sha256').update(salt+':'+p).digest('hex');
    const a=Buffer.from(h,'hex'), b=Buffer.from(x,'hex');
    return a.length===b.length && crypto.timingSafeEqual(a,b);
  }catch{return false;}
}
function addCalendarMonths(date, months){
  const d=new Date(date), day=d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+months);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(day,last)); return d;
}
function nextReminderOccurrence(date,type,every=1){
  const d=new Date(date);
  if(type==='daily'){d.setUTCDate(d.getUTCDate()+1);return d;}
  if(type==='weekly'){d.setUTCDate(d.getUTCDate()+7);return d;}
  if(type==='every_n_days'){d.setUTCDate(d.getUTCDate()+Math.max(1,Number(every||1)));return d;}
  if(type==='monthly')return addCalendarMonths(d,1);
  return d;
}
function reminderOccurrenceAt(startMs,type,nowMs,every=1){
  const start=new Date(startMs);
  if(type==='daily'){
    const n=Math.max(0,Math.floor((nowMs-startMs)/86400000));
    const d=new Date(start); d.setUTCDate(d.getUTCDate()+n); return d;
  }
  if(type==='weekly'){
    const n=Math.max(0,Math.floor((nowMs-startMs)/(7*86400000)));
    const d=new Date(start); d.setUTCDate(d.getUTCDate()+n*7); return d;
  }
  if(type==='every_n_days'){
    const step=Math.max(1,Number(every||1)), n=Math.max(0,Math.floor((nowMs-startMs)/(step*86400000)));
    const d=new Date(start); d.setUTCDate(d.getUTCDate()+n*step); return d;
  }
  if(type==='monthly'){
    let n=0; while(addCalendarMonths(start,n+1).getTime()<=nowMs && n<2400)n++;
    return addCalendarMonths(start,n);
  }
  return start;
}
function makeRecoveryCode(){return crypto.randomBytes(18).toString('hex').toUpperCase();}
function hashRecoveryCode(code){return crypto.createHash('sha256').update(String(code||'').replace(/\s+/g,'').toUpperCase()).digest('hex');}
function cookie(id){return `mostik_session=${encodeURIComponent(id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`}
function sid(req){return (req.headers.get('cookie')||'').match(/(?:^|;\s*)mostik_session=([^;]+)/)?.[1]||null}
async function user(req){const s=sid(req); if(!s)return null; const r=await db.sql`SELECT u.id,u.email,u.display_name,u.role,sa.demo_role,COALESCE(sa.demo_role,u.role) effective_role FROM sessions_auth sa JOIN users u ON u.id=sa.user_id WHERE sa.id=${s} AND sa.expires_at>now()`; return r[0]||null}

/** Проверка доступа к животному: admin / owner / animal_access */
async function allowedAnimal(me, aid){
  if(me.role==='admin') return true;
  return (await db.sql`SELECT a.id FROM animals a LEFT JOIN animal_access aa ON aa.animal_id=a.id AND aa.user_id=${me.id} WHERE a.id=${aid} AND (a.owner_id=${me.id} OR aa.user_id IS NOT NULL)`).length>0;
}

export default async (req) => {
  try {
  const u=new URL(req.url), p=u.pathname.replace(/^\/api\/?/,'');
  if(p==='health'){const c=await db.sql`SELECT count(*)::int users, count(*) FILTER (WHERE role='admin')::int admins FROM users`; return json({ok:true,app:'MOSTIK',version:'5.2.1',users:c[0].users,admins:c[0].admins});}
  if(p==='auth/status' && req.method==='GET'){const c=await db.sql`SELECT count(*)::int users, count(*) FILTER (WHERE role='admin')::int admins FROM users`; return json({setup_required:c[0].admins===0,users:c[0].users,admins:c[0].admins});}
  if(p==='auth/register' && req.method==='POST'){
    const b=await parse(req);
    const email=String(b.email||'').trim().toLowerCase(), displayName=String(b.display_name||'').trim(), password=String(b.password||'');
    if(!email||!displayName||password.length<6)return json({error:'Укажите имя, корректный email и пароль минимум 6 символов'},400);
    const c=await db.sql`SELECT count(*) FILTER (WHERE role='admin')::int admin_count FROM users`;
    const requestedRole=String(b.role||'owner');
    const allowedRoles=['owner','trainer','vet','keeper'];
    if(!allowedRoles.includes(requestedRole)) return json({error:'Выберите роль: владелец, тренер, ветеринар или кипер'},400);
    const role=c[0].admin_count===0?'admin':requestedRole;
    const exists=await db.sql`SELECT id FROM users WHERE lower(email)=lower(${email}) LIMIT 1`;
    if(exists.length)return json({error:'Пользователь с таким email уже существует'},409);
    const uid=id(), ph=await hashPassword(password), recoveryCode=makeRecoveryCode(), recoveryHash=hashRecoveryCode(recoveryCode);
    await db.sql`INSERT INTO users(id,email,display_name,password_hash,role,recovery_code_hash) VALUES(${uid},${email},${displayName},${ph},${role},${recoveryHash})`;
    const sessionId=id(); await db.sql`INSERT INTO sessions_auth(id,user_id,expires_at) VALUES(${sessionId},${uid},now()+interval '30 days')`;
    return json({ok:true,role,recovery_code:recoveryCode,recovery_note:'Сохраните код восстановления. Он нужен, если забудете пароль и пока не подключена почта.'},201,{ 'set-cookie':cookie(sessionId)});
  }
  if(p==='auth/recover' && req.method==='POST') {
    const b=await parse(req);
    const email=String(b.email||'').trim().toLowerCase();
    const code=String(b.recovery_code||'').replace(/\s+/g,'').toUpperCase();
    const password=String(b.password||'');
    if(!email || !email.includes('@') || code.length < 20 || password.length < 6) return json({error:'Введите email, код восстановления и новый пароль (минимум 6 символов)'},400);
    const rows=await db.sql`SELECT id,recovery_code_hash FROM users WHERE lower(email)=lower(${email}) LIMIT 1`;
    if(!rows.length || !rows[0].recovery_code_hash || !crypto.timingSafeEqual(Buffer.from(rows[0].recovery_code_hash),Buffer.from(hashRecoveryCode(code)))) return json({error:'Неверный email или код восстановления'},401);
    const ph=await hashPassword(password), nextRecovery=makeRecoveryCode(), nextHash=hashRecoveryCode(nextRecovery);
    await db.sql`UPDATE users SET password_hash=${ph}, recovery_code_hash=${nextHash} WHERE id=${rows[0].id}`;
    await db.sql`DELETE FROM sessions_auth WHERE user_id=${rows[0].id}`;
    const sessionId=id(); await db.sql`INSERT INTO sessions_auth(id,user_id,expires_at) VALUES(${sessionId},${rows[0].id},now()+interval '30 days')`;
    return json({ok:true,message:'Пароль изменён. Старый код восстановления больше недействителен. Новый код показан один раз.',recovery_code:nextRecovery},200,{ 'set-cookie':cookie(sessionId)});
  }
  if(p==='auth/request-reset' && req.method==='POST') {
    const b=await parse(req);
    const email=String(b.email||'').trim().toLowerCase();
    if(!email || !email.includes('@')) return json({error:'Введите корректный email'},400);
    const rows=await db.sql`SELECT id,email,display_name FROM users WHERE lower(email)=${email} LIMIT 1`;
    if(rows.length){
      const row=rows[0];
      await db.sql`UPDATE password_reset_tokens SET used_at=now() WHERE user_id=${row.id} AND used_at IS NULL`;
      const raw=crypto.randomBytes(32).toString('hex');
      const hash=crypto.createHash('sha256').update(raw).digest('hex');
      await db.sql`INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at) VALUES(${id()},${row.id},${hash},now()+interval '1 hour')`;
      const origin=new URL(req.url).origin;
      const resetUrl=`${origin}/?reset=${encodeURIComponent(raw)}`;
      const key=process.env.RESEND_API_KEY;
      const from=process.env.RESEND_FROM_EMAIL;
      if(key && from){
        const resp=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[row.email],subject:'MOSTIK — восстановление пароля',html:`<p>Здравствуйте, ${String(row.display_name).replace(/[<>]/g,'')}.</p><p>Для восстановления пароля откройте ссылку:</p><p><a href="${resetUrl}">Восстановить пароль</a></p><p>Ссылка действует 1 час и одноразовая.</p>`})});
        if(!resp.ok) console.error('reset email failed', await resp.text());
      }
    }
    return json({ok:true,message:'Если такой email зарегистрирован, инструкция по восстановлению отправлена.'});
  }
  if(p==='auth/reset-password' && req.method==='POST') {
    const b=await parse(req);
    const token=String(b.token||''); const password=String(b.password||'');
    if(token.length<32 || password.length<6) return json({error:'Неверная ссылка или слишком короткий пароль'},400);
    const hash=crypto.createHash('sha256').update(token).digest('hex');
    const rows=await db.sql`SELECT id,user_id FROM password_reset_tokens WHERE token_hash=${hash} AND used_at IS NULL AND expires_at>now() LIMIT 1`;
    if(!rows.length) return json({error:'Ссылка недействительна или срок её действия истёк'},400);
    const ph=await hashPassword(password);
    await db.sql`UPDATE users SET password_hash=${ph} WHERE id=${rows[0].user_id}`;
    await db.sql`UPDATE password_reset_tokens SET used_at=now() WHERE id=${rows[0].id}`;
    await db.sql`DELETE FROM sessions_auth WHERE user_id=${rows[0].user_id}`;
    return json({ok:true,message:'Пароль изменён. Теперь можно войти с новым паролем.'});
  }
  if(p==='auth/login' && req.method==='POST'){
    const b=await parse(req);
    const email=String(b.email||'').trim().toLowerCase().normalize('NFKC');
    const passwordRaw=String(b.password??'');
    // Mobile keyboards/password managers can accidentally add surrounding whitespace.
    // Keep exact-password support, but also accept a trimmed version when different.
    const candidates=[passwordRaw];
    const trimmed=passwordRaw.trim();
    if(trimmed!==passwordRaw)candidates.push(trimmed);
    const r=await db.sql`SELECT * FROM users WHERE lower(email)=lower(${email}) LIMIT 1`;
    const row=r[0];
    let ok=false;
    if(row){
      for(const candidate of candidates){
        if(await checkPassword(candidate,row.password_hash)){ok=true;break;}
      }
    }
    if(!row || !ok) return json({error:'Неверный email или пароль'},401);
    const sessionId=id();
    await db.sql`INSERT INTO sessions_auth(id,user_id,expires_at) VALUES(${sessionId},${row.id},now()+interval '30 days')`;
    return json({ok:true},200,{'set-cookie':cookie(sessionId)});
  }
  if(p==='auth/logout'){const s=sid(req); if(s) await db.sql`DELETE FROM sessions_auth WHERE id=${s}`; return json({ok:true},200,{'set-cookie':'mostik_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'});}
  const me=await user(req); if(!me)return json({error:'Требуется вход'},401);
  if(p==='me')return json({user:me,real_role:me.role,demo_role:me.demo_role||null});
  if(p==='admin/demo-role' && req.method==='PUT') {
    if(me.role!=='admin')return json({error:'Только для администратора'},403);
    const b=await parse(req), roles=['admin','owner','trainer','keeper','vet'], role=String(b.role||'admin');
    if(!roles.includes(role))return json({error:'Неизвестная роль'},400);
    const s=sid(req); await db.sql`UPDATE sessions_auth SET demo_role=${role==='admin'?null:role} WHERE id=${s}`;
    return json({ok:true,role});
  }

  if(p==='insight/events' && req.method==='POST') {
    const b=await parse(req);
    const allowedTypes=['navigation','quick_action','button_click','form_submit','animal_change','form_cancel','validation_error','search','repeat_action','screen_view'];
    const eventType=String(b.event_type||'button_click');
    if(!allowedTypes.includes(eventType)) return json({error:'Неизвестный тип события'},400);
    const metadata=(b.metadata && typeof b.metadata==='object' && !Array.isArray(b.metadata))?b.metadata:{};
    const safeMeta={};
    for(const [k,v] of Object.entries(metadata).slice(0,10)){ if(['password','token','email','note','details','instructions'].includes(k)) continue; safeMeta[String(k).slice(0,40)]=String(v??'').slice(0,120); }
    await db.sql`INSERT INTO insight_events(id,user_id,event_type,screen,target,metadata) VALUES(${id()},${me.id},${eventType},${String(b.screen||'').slice(0,120)},${String(b.target||'').slice(0,120)},${JSON.stringify(safeMeta)}::jsonb)`;
    return json({ok:true},201);
  }
  if(p==='admin/insight' && req.method==='GET') {
    if(me.role!=='admin') return json({error:'Только для администратора'},403);
    const summary=(await db.sql`SELECT count(*)::int events,count(DISTINCT user_id)::int users FROM insight_events WHERE created_at>=now()-interval '30 days'`)[0];
    const rows=await db.sql`SELECT event_type,target,count(*)::int count FROM insight_events WHERE created_at>=now()-interval '30 days' GROUP BY event_type,target ORDER BY count DESC LIMIT 100`;
    const cancels=(await db.sql`SELECT count(*)::int count FROM insight_events WHERE event_type='form_cancel' AND created_at>=now()-interval '30 days'`)[0].count;
    const submits=(await db.sql`SELECT count(*)::int count FROM insight_events WHERE event_type='form_submit' AND created_at>=now()-interval '30 days'`)[0].count;
    const navRows=await db.sql`SELECT target,count(*)::int count FROM insight_events WHERE event_type='navigation' AND created_at>=now()-interval '30 days' GROUP BY target ORDER BY count DESC LIMIT 30`;
    const quickRows=await db.sql`SELECT target,count(*)::int count FROM insight_events WHERE event_type='quick_action' AND created_at>=now()-interval '30 days' GROUP BY target ORDER BY count DESC LIMIT 30`;
    const recommendations=[];
    const pct=(a,b)=>b?Math.round(a/b*100):0;
    if(cancels>=10 && pct(cancels,cancels+submits)>=25) recommendations.push({id:'form_dropoff',priority:'high',priority_label:'Высокий приоритет',title:'Пользователи часто бросают формы',description:`Доля отмен среди зафиксированных действий формы — около ${pct(cancels,cancels+submits)}%. Стоит упростить наиболее длинные формы и проверить обязательные поля.`,why:`За 30 дней: ${cancels} отмен и ${submits} отправок.` ,evidence_label:`${cancels} отмен`});
    const repeatTarget=quickRows.find(x=>Number(x.count)>=10);
    if(repeatTarget) recommendations.push({id:'quick_action',priority:'medium',priority_label:'Средний приоритет',title:`Быстрое действие «${repeatTarget.target}» используют особенно часто`,description:'Это хороший кандидат для вынесения на главный экран или карточку животного, чтобы сократить путь до результата.',why:`Кнопку использовали ${repeatTarget.count} раз за 30 дней.`,evidence_label:`${repeatTarget.count} использований`});
    const navTraining=navRows.find(x=>String(x.target||'').toLowerCase().includes('трен'));
    if(navTraining && Number(navTraining.count)>=10) recommendations.push({id:'training_entry',priority:'medium',priority_label:'Средний приоритет',title:'Тренировку часто запускают через навигацию',description:'Стоит проверить, достаточно ли заметна кнопка запуска тренировки на главной и в карточке животного.',why:`Раздел «${navTraining.target}» открывали ${navTraining.count} раз.`,evidence_label:`${navTraining.count} открытий`});
    const noEvents=summary.events===0;
    if(noEvents) recommendations.push({id:'collect_more',priority:'low',priority_label:'Низкий приоритет',title:'Нужно накопить историю использования',description:'Пока недостаточно данных, чтобы делать надёжные выводы. После появления реальных событий рекомендации станут точнее.',why:'События ещё не накоплены.',evidence_label:'Нет данных'});
    const feedback=await db.sql`SELECT recommendation_id,feedback,count(*)::int count FROM insight_feedback WHERE created_at>=now()-interval '90 days' GROUP BY recommendation_id,feedback`;
    return json({summary,recommendations,metrics:{top_navigation:navRows.slice(0,10),top_quick_actions:quickRows.slice(0,10),feedback}});
  }
  if(p==='admin/insight/feedback' && req.method==='POST') {
    if(me.role!=='admin') return json({error:'Только для администратора'},403);
    const b=await parse(req);
    if(!String(b.recommendation_id||'') || !['useful','later','not_relevant'].includes(String(b.feedback||''))) return json({error:'Некорректная обратная связь'},400);
    await db.sql`INSERT INTO insight_feedback(id,admin_id,recommendation_id,feedback) VALUES(${id()},${me.id},${String(b.recommendation_id)},${String(b.feedback)})`;
    return json({ok:true},201);
  }
  if(p==='admin/users' && req.method==='GET'){
    if(me.role!=='admin')return json({error:'Только для администратора'},403);
    const users=await db.sql`SELECT id,email,display_name,role,created_at FROM users ORDER BY display_name,email`;
    const grants=await db.sql`SELECT aa.user_id,aa.animal_id,a.name FROM animal_access aa JOIN animals a ON a.id=aa.animal_id ORDER BY a.name`;
    return json({users,grants});
  }
  if(p==='admin/users' && req.method==='POST'){
    if(me.role!=='admin')return json({error:'Только для администратора'},403);
    const b=await parse(req), email=String(b.email||'').trim().toLowerCase(), displayName=String(b.display_name||'').trim(), password=String(b.password||''), role=String(b.role||'owner');
    const roles=['owner','trainer','keeper','vet','admin'];
    if(!email||!displayName||password.length<6||!roles.includes(role))return json({error:'Проверьте имя, email, пароль (минимум 6 символов) и роль'},400);
    const exists=await db.sql`SELECT id FROM users WHERE lower(email)=lower(${email}) LIMIT 1`; if(exists.length)return json({error:'Пользователь с таким email уже существует'},409);
    const uid=id(), ph=await hashPassword(password); await db.sql`INSERT INTO users(id,email,display_name,password_hash,role) VALUES(${uid},${email},${displayName},${ph},${role})`;
    return json({ok:true,id:uid},201);
  }
  const adminRecoveryMatch=p.match(/^admin\/users\/([^/]+)\/recovery-code$/);
  if(adminRecoveryMatch && req.method==='POST'){
    if(me.role!=='admin')return json({error:'Только для администратора'},403);
    const target=adminRecoveryMatch[1];
    const found=await db.sql`SELECT id FROM users WHERE id=${target}`; if(!found.length)return json({error:'Пользователь не найден'},404);
    const recoveryCode=makeRecoveryCode(), recoveryHash=hashRecoveryCode(recoveryCode);
    await db.sql`UPDATE users SET recovery_code_hash=${recoveryHash} WHERE id=${target}`;
    return json({ok:true,recovery_code:recoveryCode,message:'Новый код восстановления создан. Покажите его пользователю и попросите сохранить.'});
  }
  const adminUserMatch=p.match(/^admin\/users\/([^/]+)\/access$/);
  if(adminUserMatch && req.method==='PUT'){
    if(me.role!=='admin')return json({error:'Только для администратора'},403);
    const target=adminUserMatch[1], b=await parse(req), ids=Array.isArray(b.animal_ids)?[...new Set(b.animal_ids.map(String))]:[];
    const found=await db.sql`SELECT id FROM users WHERE id=${target}`; if(!found.length)return json({error:'Пользователь не найден'},404);
    await db.sql`DELETE FROM animal_access WHERE user_id=${target}`;
    for(const aid of ids) await db.sql`INSERT INTO animal_access(user_id,animal_id) SELECT ${target},id FROM animals WHERE id=${aid} ON CONFLICT DO NOTHING`;
    return json({ok:true});
  }
  if(p==='admin/users' && req.method==='DELETE'){
    if(me.role!=='admin')return json({error:'Только для администратора'},403);
    const b=await parse(req), target=String(b.id||''); if(!target||target===me.id)return json({error:'Нельзя удалить текущего администратора'},400);
    const found=await db.sql`SELECT id FROM users WHERE id=${target}`; if(!found.length)return json({error:'Пользователь не найден'},404);
    await db.sql`DELETE FROM users WHERE id=${target}`; return json({ok:true});
  }
  if(p==='animals/access' && req.method==='POST'){
    if(!['admin','owner','trainer','keeper','vet'].includes(me.effective_role)) return json({error:'Недостаточно прав для добавления животного по ID'},403);
    const b=await parse(req);
    const aid=String(b.animal_id||b.id||'').trim();
    if(!aid) return json({error:'Введите ID животного'},400);
    const r=await db.sql`SELECT a.id,a.name,a.species,a.breed,a.owner_id,u.display_name owner_name FROM animals a JOIN users u ON u.id=a.owner_id WHERE a.id=${aid} LIMIT 1`;
    if(!r.length) return json({error:'Животное с таким ID не найдено'},404);
    await db.sql`INSERT INTO animal_access(id,user_id,animal_id) VALUES(${id()},${me.id},${aid}) ON CONFLICT (user_id,animal_id) DO NOTHING`;
    return json({ok:true,animal:r[0]},201);
  }

  if(p==='guidance' && req.method==='GET'){
    const q=new URL(req.url).searchParams, aid=q.get('animal_id');
    if(aid && !(await allowedAnimal(me,aid))) return json({error:'Нет доступа к животному'},403);
    const animals=aid
      ? await db.sql`SELECT id,name,status,avatar_icon FROM animals WHERE id=${aid}`
      : me.role==='admin'
        ? await db.sql`SELECT id,name,status,avatar_icon FROM animals ORDER BY name`
        : await db.sql`SELECT a.id,a.name,a.status,a.avatar_icon FROM animals a LEFT JOIN animal_access aa ON aa.animal_id=a.id AND aa.user_id=${me.id} WHERE a.owner_id=${me.id} OR aa.user_id IS NOT NULL ORDER BY a.name`;
    const ids=animals.map(a=>a.id);
    if(!ids.length) return json({actions:[]});
    const reminders=await db.sql`SELECT r.id,r.animal_id,r.title,r.remind_at,a.name animal_name FROM reminders r JOIN animals a ON a.id=r.animal_id WHERE r.enabled=true AND r.remind_at<=now()+interval '24 hours' AND (r.user_id=${me.id} OR a.owner_id=${me.id} OR ${me.role==='admin'}) AND r.animal_id = ANY(${ids}) ORDER BY r.remind_at LIMIT 50`;
    const schedule=await db.sql`SELECT si.id,si.animal_id,si.title,si.scheduled_at,si.type,a.name animal_name FROM scheduled_items si JOIN animals a ON a.id=si.animal_id WHERE si.status='planned' AND si.scheduled_at BETWEEN now() AND now()+interval '24 hours' AND si.animal_id = ANY(${ids}) ORDER BY si.scheduled_at LIMIT 50`;
    const homework=await db.sql`SELECT h.id,h.animal_id,h.title,h.due_date,a.name animal_name FROM homework h JOIN animals a ON a.id=h.animal_id WHERE lower(coalesce(h.status,'active')) NOT IN ('done','completed','complete') AND h.due_date IS NOT NULL AND h.due_date <= current_date+2 AND h.animal_id = ANY(${ids}) ORDER BY h.due_date LIMIT 50`;
    const sessions=await db.sql`SELECT s.animal_id,count(*)::int count FROM sessions s WHERE s.started_at>=date_trunc('day',now()) AND s.started_at<date_trunc('day',now())+interval '1 day' AND s.animal_id = ANY(${ids}) GROUP BY s.animal_id`;
    const observations=await db.sql`SELECT o.animal_id,count(*)::int count FROM observations o WHERE o.observed_at>=date_trunc('day',now()) AND o.observed_at<date_trunc('day',now())+interval '1 day' AND o.animal_id = ANY(${ids}) GROUP BY o.animal_id`;
    const critical=await db.sql`SELECT animal_id,count(*)::int count FROM animal_health_features WHERE animal_id = ANY(${ids}) AND severity='critical' GROUP BY animal_id`;
    const sMap=Object.fromEntries(sessions.map(x=>[x.animal_id,x.count])), oMap=Object.fromEntries(observations.map(x=>[x.animal_id,x.count])), cMap=Object.fromEntries(critical.map(x=>[x.animal_id,x.count]));
    const actions=[]; const role=me.effective_role;
    for(const a of animals){
      if((cMap[a.id]||0)>0) actions.push({priority:'critical',animal_id:a.id,animal_name:a.name,kind:'health',title:`Проверить особенности здоровья ${a.name}`,detail:`Есть ${cMap[a.id]} критичн. предупреждений.`,view:'development'});
      for(const r of reminders.filter(x=>x.animal_id===a.id).slice(0,2)) actions.push({priority:new Date(r.remind_at)<=new Date()?'high':'medium',animal_id:a.id,animal_name:a.name,kind:'reminder',title:r.title,detail:`Напоминание · ${new Date(r.remind_at).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'})}`,view:'reminders',item_id:r.id});
      for(const h of homework.filter(x=>x.animal_id===a.id).slice(0,2)) actions.push({priority:new Date(h.due_date)<new Date(new Date().toDateString())?'high':'medium',animal_id:a.id,animal_name:a.name,kind:'homework',title:`ДЗ: ${h.title}`,detail:`Срок: ${h.due_date}`,view:'training',item_id:h.id});
      for(const x of schedule.filter(y=>y.animal_id===a.id).slice(0,1)) actions.push({priority:'medium',animal_id:a.id,animal_name:a.name,kind:'schedule',title:x.title,detail:`Запланировано · ${new Date(x.scheduled_at).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'})}`,view:'calendar',item_id:x.id});
      if(['admin','trainer','keeper'].includes(role) && !(sMap[a.id]||0)) actions.push({priority:'low',animal_id:a.id,animal_name:a.name,kind:'training',title:`Сегодня ещё не было тренировки у ${a.name}`,detail:'Можно начать обычную или запланированную тренировку.',view:'training'});
      if(['admin','owner','keeper'].includes(role) && !(oMap[a.id]||0)) actions.push({priority:'low',animal_id:a.id,animal_name:a.name,kind:'observation',title:`Сегодня нет наблюдения по ${a.name}`,detail:'Добавьте короткое наблюдение, если уже видели животное.',view:'observations'});
    }
    const rank={critical:0,high:1,medium:2,low:3}; actions.sort((x,y)=>rank[x.priority]-rank[y.priority]||x.animal_name.localeCompare(y.animal_name,'ru'));
    return json({actions:actions.slice(0,20)});
  }

  const animalStatusMatch=p.match(/^animals\/([^/]+)\/status$/);
  if(animalStatusMatch && req.method==='PUT'){
    const aid=animalStatusMatch[1], b=await parse(req);
    const row=await db.sql`SELECT id,owner_id FROM animals WHERE id=${aid}`; if(!row.length)return json({error:'Животное не найдено'},404);
    if(me.role!=='admin' && !(me.effective_role==='owner' && row[0].owner_id===me.id) && me.effective_role!=='vet')return json({error:'Изменять статус может администратор, владелец или ветеринар'},403);
    const status=String(b.status||'normal'); if(!['normal','attention','critical'].includes(status))return json({error:'Недопустимый статус'},400);
    await db.sql`UPDATE animals SET status=${status} WHERE id=${aid}`; return json({ok:true,status});
  }

  if(p==='animals-overview' && req.method==='GET') {
    const rows = await db.sql`
      SELECT a.id,a.name,a.species,a.breed,a.owner_id,u.display_name owner_name,
        COALESCE((SELECT count(*)::int FROM skills s WHERE s.animal_id=a.id),0) skill_count,
        COALESCE((SELECT count(*)::int FROM skills s WHERE s.animal_id=a.id AND COALESCE(s.mastered,false)=true),0) mastered_count,
        COALESCE((SELECT count(*)::int FROM animal_health_features hf WHERE hf.animal_id=a.id AND hf.severity='critical'),0) critical_health_count,
        COALESCE((SELECT count(*)::int FROM animal_health_features hf WHERE hf.animal_id=a.id),0) health_count,
        COALESCE((SELECT count(*)::int FROM animal_attention aa WHERE aa.animal_id=a.id),0) attention_count,
        (SELECT max(o.observed_at) FROM observations o WHERE o.animal_id=a.id) last_observation_at,
        (SELECT max(s.started_at) FROM sessions s WHERE s.animal_id=a.id) last_training_at,
        (SELECT min(si.scheduled_at) FROM scheduled_items si WHERE si.animal_id=a.id AND si.status='planned' AND si.scheduled_at>=now()) next_scheduled_at,
        (SELECT min(r.remind_at) FROM reminders r WHERE r.animal_id=a.id AND r.enabled=true AND r.remind_at>=now() AND (r.user_id=${me.id} OR r.user_id=a.owner_id)) next_reminder_at
      FROM animals a JOIN users u ON u.id=a.owner_id
      LEFT JOIN animal_access ax ON ax.animal_id=a.id AND ax.user_id=${me.id}
      WHERE ${me.role==='admin'} OR a.owner_id=${me.id} OR ax.user_id IS NOT NULL
      ORDER BY a.name`;
    return json({animals:rows});
  }

  if(p==='animals'){
    if(req.method==='GET'){
      const r=await db.sql`SELECT a.*,COALESCE((SELECT json_agg(json_build_object('id',aa2.id,'title',aa2.title,'category',aa2.category) ORDER BY aa2.title) FROM animal_attention aa2 WHERE aa2.animal_id=a.id),'[]') attention,COALESCE((SELECT json_agg(json_build_object('id',df.id,'category',df.category,'title',df.title,'status',df.status,'note',df.note,'created_at',df.created_at) ORDER BY df.category,df.title) FROM animal_development_features df WHERE df.animal_id=a.id),'[]') development_features,COALESCE((SELECT json_agg(json_build_object('id',hf.id,'feature_type',hf.feature_type,'title',hf.title,'severity',hf.severity,'status',hf.status,'note',hf.note,'created_at',hf.created_at) ORDER BY CASE hf.severity WHEN 'critical' THEN 1 WHEN 'important' THEN 2 ELSE 3 END,hf.title) FROM animal_health_features hf WHERE hf.animal_id=a.id),'[]') health_features FROM animals a LEFT JOIN animal_access aa ON aa.animal_id=a.id AND aa.user_id=${me.id} WHERE ${me.role==='admin'} OR a.owner_id=${me.id} OR aa.user_id IS NOT NULL ORDER BY a.name`;
      return json({animals:r});
    }
    if(req.method==='POST' && ['admin','owner'].includes(me.effective_role)){
      const b=await parse(req), aid=id(); const ownerId=me.effective_role==='admin'&&b.owner_id?String(b.owner_id):me.id;
      const avatarIcon=Array.from({length:14},(_,i)=>String(i+1)).includes(String(b.avatar_icon||''))?String(b.avatar_icon):String((Math.floor(Math.random()*14)+1));
      const ok=await db.sql`SELECT id FROM users WHERE id=${ownerId}`; if(!ok.length)return json({error:'Владелец не найден'},404);
      await db.sql`INSERT INTO animals(id,name,species,breed,owner_id,avatar_icon) VALUES(${aid},${String(b.name||'').trim()},${b.species||''},${b.breed||''},${ownerId},${avatarIcon})`;
      const attention=Array.isArray(b.attention)?b.attention:[];
      for(const x of attention){const title=String(x?.title||'').trim(); const category=String(x?.category||'').trim()||'Другое'; if(title) await db.sql`INSERT INTO animal_attention(id,animal_id,category,title) VALUES(${id()},${aid},${category},${title})`;}
      return json({ok:true,id:aid},201);
    }
    if(req.method==='DELETE'){
      const aid=p==='animals'?null:null;
      return json({error:'Для удаления укажите идентификатор животного'},400);
    }
  }
  const animalIdMatch=p.match(/^animals\/([^/]+)$/);
  if(animalIdMatch && req.method==='DELETE'){
    const aid=animalIdMatch[1];
    const row=await db.sql`SELECT id,owner_id FROM animals WHERE id=${aid}`; if(!row.length)return json({error:'Животное не найдено'},404);
    if(me.role!=='admin' && !(await allowedAnimal(me,aid)))return json({error:'Удалять животное можно только из своего окружения'},403);
    await db.sql`DELETE FROM session_skills WHERE session_id IN (SELECT id FROM sessions WHERE animal_id=${aid})`;
    await db.sql`DELETE FROM sessions WHERE animal_id=${aid}`;
    await db.sql`DELETE FROM animals WHERE id=${aid}`;
    return json({ok:true});
  }
  const animalPhotoMatch=p.match(/^animals\/([^/]+)\/photo$/);
  if(animalPhotoMatch){
    const aid=animalPhotoMatch[1];
    if(!(await allowedAnimal(me,aid))) return json({error:'Нет доступа к животному'},403);
    if(req.method==='GET'){
      const r=await db.sql`SELECT id,photo_data FROM animals WHERE id=${aid}`;
      if(!r.length)return json({error:'Животное не найдено'},404);
      return json({photo_data:r[0].photo_data||null});
    }
    if(req.method==='PUT') {
      if(!['admin','owner'].includes(me.effective_role)) return json({error:'Изменять фото может администратор или владелец'},403);
      const b=await parse(req);
      const photo=String(b.photo_data||'');
      if(photo && (!photo.startsWith('data:image/') || photo.length>1800000)) return json({error:'Фото должно быть изображением до 1.8 МБ после сжатия'},400);
      const r=await db.sql`UPDATE animals SET photo_data=${photo||null} WHERE id=${aid} RETURNING id,photo_data`;
      if(!r.length)return json({error:'Животное не найдено'},404);
      return json({ok:true,photo_data:r[0].photo_data||null});
    }
    if(req.method==='DELETE'){
      if(!['admin','owner'].includes(me.effective_role)) return json({error:'Удалять фото может администратор или владелец'},403);
      await db.sql`UPDATE animals SET photo_data=NULL WHERE id=${aid}`;
      return json({ok:true});
    }
  }
  const attentionMatch=p.match(/^animals\/([^/]+)\/attention$/);
  if(attentionMatch){
    const aid=attentionMatch[1]; if(!(await allowedAnimal(me,aid)))return json({error:'Нет доступа к животному'},403);
    if(req.method==='GET'){const r=await db.sql`SELECT id,animal_id,category,title,created_at FROM animal_attention WHERE animal_id=${aid} ORDER BY title`;return json({attention:r});}
    if(req.method==='POST'){
      if(!['admin','owner'].includes(me.effective_role))return json({error:'Добавлять особенности может владелец или администратор'},403);
      const b=await parse(req), title=String(b.title||'').trim(), category=String(b.category||'Другое').trim(); if(!title)return json({error:'Укажите особенность'},400);
      const oid=id(); await db.sql`INSERT INTO animal_attention(id,animal_id,category,title) VALUES(${oid},${aid},${category},${title})`;return json({ok:true,id:oid},201);
    }
    if(req.method==='DELETE'){
      if(!['admin','owner'].includes(me.effective_role))return json({error:'Нет прав'},403);
      const b=await parse(req), oid=String(b.id||''); await db.sql`DELETE FROM animal_attention WHERE id=${oid} AND animal_id=${aid}`;return json({ok:true});
    }
  }
  const healthMatch=p.match(/^animals\/([^/]+)\/health-features$/);
  if(healthMatch){
    const aid=healthMatch[1]; if(!(await allowedAnimal(me,aid)))return json({error:'Нет доступа к животному'},403);
    if(req.method==='GET'){const r=await db.sql`SELECT id,animal_id,feature_type,title,severity,status,note,created_by,created_at,updated_at FROM animal_health_features WHERE animal_id=${aid} ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'important' THEN 2 ELSE 3 END,title`;return json({features:r});}
    if(req.method==='POST'){
      if(!['admin','owner','vet'].includes(me.effective_role))return json({error:'Добавлять особенности здоровья может владелец, ветеринар или администратор'},403);
      const b=await parse(req), featureType=String(b.feature_type||'other').trim(), title=String(b.title||'').trim(), severity=String(b.severity||'important').trim(), status=String(b.status||'observation').trim(), note=String(b.note||'').trim();
      const sev=['critical','important','info'], sts=['confirmed','suspected','observation'];
      if(!title)return json({error:'Укажите состояние здоровья'},400); if(!sev.includes(severity)||!sts.includes(status))return json({error:'Некорректные параметры'},400);
      const oid=id(); await db.sql`INSERT INTO animal_health_features(id,animal_id,feature_type,title,severity,status,note,created_by) VALUES(${oid},${aid},${featureType},${title},${severity},${status},${note||null},${me.id})`;return json({ok:true,id:oid},201);
    }
    if(req.method==='PUT'){
      if(!['admin','owner','vet'].includes(me.effective_role))return json({error:'Нет прав'},403);
      const b=await parse(req), oid=String(b.id||''), featureType=String(b.feature_type||'other').trim(), title=String(b.title||'').trim(), severity=String(b.severity||'important').trim(), status=String(b.status||'observation').trim(), note=String(b.note||'').trim();
      if(!oid||!title)return json({error:'Недостаточно данных'},400); if(!['critical','important','info'].includes(severity)||!['confirmed','suspected','observation'].includes(status))return json({error:'Некорректные параметры'},400);
      await db.sql`UPDATE animal_health_features SET feature_type=${featureType},title=${title},severity=${severity},status=${status},note=${note||null},updated_at=now() WHERE id=${oid} AND animal_id=${aid}`;return json({ok:true});
    }
    if(req.method==='DELETE'){
      if(!['admin','owner','vet'].includes(me.effective_role))return json({error:'Нет прав'},403);
      const b=await parse(req); await db.sql`DELETE FROM animal_health_features WHERE id=${String(b.id||'')} AND animal_id=${aid}`;return json({ok:true});
    }
  }
  const devMatch=p.match(/^animals\/([^/]+)\/development-features$/);
  if(devMatch){
    const aid=devMatch[1]; if(!(await allowedAnimal(me,aid)))return json({error:'Нет доступа к животному'},403);
    if(req.method==='GET'){const r=await db.sql`SELECT id,animal_id,category,title,status,note,created_by,created_at,updated_at FROM animal_development_features WHERE animal_id=${aid} ORDER BY category,title`;return json({features:r});}
    if(req.method==='POST'){
      if(!['admin','owner'].includes(me.effective_role))return json({error:'Добавлять особенности развития может владелец или администратор'},403);
      const b=await parse(req), category=String(b.category||'Другое').trim(), title=String(b.title||'').trim(), status=String(b.status||'observation').trim(), note=String(b.note||'').trim();
      const allowedStatus=['confirmed','suspected','observation'];
      if(!title)return json({error:'Укажите особенность'},400); if(!allowedStatus.includes(status))return json({error:'Некорректный статус'},400);
      const oid=id(); await db.sql`INSERT INTO animal_development_features(id,animal_id,category,title,status,note,created_by) VALUES(${oid},${aid},${category},${title},${status},${note||null},${me.id})`;return json({ok:true,id:oid},201);
    }
    if(req.method==='PUT'){
      if(!['admin','owner'].includes(me.effective_role))return json({error:'Нет прав'},403);
      const b=await parse(req), oid=String(b.id||''), category=String(b.category||'Другое').trim(), title=String(b.title||'').trim(), status=String(b.status||'observation').trim(), note=String(b.note||'').trim();
      if(!oid||!title)return json({error:'Недостаточно данных'},400); if(!['confirmed','suspected','observation'].includes(status))return json({error:'Некорректный статус'},400);
      await db.sql`UPDATE animal_development_features SET category=${category},title=${title},status=${status},note=${note||null},updated_at=now() WHERE id=${oid} AND animal_id=${aid}`;return json({ok:true});
    }
    if(req.method==='DELETE'){
      if(!['admin','owner'].includes(me.effective_role))return json({error:'Нет прав'},403);
      const b=await parse(req); await db.sql`DELETE FROM animal_development_features WHERE id=${String(b.id||'')} AND animal_id=${aid}`;return json({ok:true});
    }
  }
  const m=p.match(/^animals\/([^/]+)\/skills$/); if(m){const aid=m[1]; const allowed=await allowedAnimal(me,aid); if(!allowed)return json({error:'Нет доступа к животному'},403); if(req.method==='GET'){const r=await db.sql`SELECT s.*,COALESCE(s.mastered,false) mastered,coalesce(json_agg(json_build_object('id',st.id,'step_no',st.step_no,'title',st.title,'goal',st.goal,'criterion',st.criterion,'bridge',st.bridge,'reinforcement',st.reinforcement,'reinforcement_other',st.reinforcement_other,'reinforcement_schedule',st.reinforcement_schedule) ORDER BY st.step_no) FILTER(WHERE st.id IS NOT NULL),'[]') steps FROM skills s LEFT JOIN skill_steps st ON st.skill_id=s.id WHERE s.animal_id=${aid} GROUP BY s.id ORDER BY s.name`;return json({skills:r});}
    if(req.method==='POST'){if(!['admin','trainer'].includes(me.effective_role))return json({error:'Только тренер или администратор'},403); const b=await parse(req), sid=id(); await db.sql`INSERT INTO skills(id,animal_id,name,signal,goal) VALUES(${sid},${aid},${b.name},${b.signal||''},${b.goal||''})`; for(let i=0;i<(b.steps||[]).length;i++){const s=b.steps[i]; await db.sql`INSERT INTO skill_steps(id,skill_id,step_no,title,goal,criterion,bridge,reinforcement,reinforcement_other,reinforcement_schedule) VALUES(${id()},${sid},${i+1},${s.title||''},${s.goal||''},${s.criterion||''},${s.bridge||'нет'},${s.reinforcement||'пищевое'},${s.reinforcement_other||''},${s.reinforcement_schedule||'постоянный'})`;} return json({ok:true,id:sid},201)}
  }
  const skillStatusMatch=p.match(/^animals\/([^/]+)\/skills\/([^/]+)$/);
  if(skillStatusMatch){
    const aid=skillStatusMatch[1], skillId=skillStatusMatch[2]; if(!(await allowedAnimal(me,aid)))return json({error:'Нет доступа к животному'},403);
    if(req.method==='PUT'){
      if(!['admin','trainer'].includes(me.effective_role))return json({error:'Только тренер или администратор'},403);
      const b=await parse(req); await db.sql`UPDATE skills SET mastered=${!!b.mastered} WHERE id=${skillId} AND animal_id=${aid}`; return json({ok:true});
    }
    if(req.method==='DELETE'){
      if(!['admin','trainer'].includes(me.effective_role))return json({error:'Только тренер или администратор'},403);
      await db.sql`DELETE FROM skills WHERE id=${skillId} AND animal_id=${aid}`;
      return json({ok:true});
    }
  }
  if(p==='defaults' && req.method==='GET'){
    const aid=new URL(req.url).searchParams.get('animal_id');
    if(!aid || !(await allowedAnimal(me,aid))) return json({error:'Нет доступа к животному'},403);
    const obs=await db.sql`SELECT behavior_note,health_note,arousal,stress,concentration,appetite,pain,sleep,note FROM observations WHERE animal_id=${aid} ORDER BY observed_at DESC LIMIT 1`;
    const food=await db.sql`SELECT meal,offered,eaten,not_eaten,appetite,note FROM food_logs WHERE animal_id=${aid} ORDER BY logged_at DESC LIMIT 1`;
    const vet=await db.sql`SELECT record_type,medication_name,dosage,frequency,note FROM vet_records WHERE animal_id=${aid} ORDER BY updated_at DESC LIMIT 1`;
    const sess=await db.sql`SELECT id,ending_type,success_score,concentration,arousal,external_stimulus,external_reason,internal_stimulus,internal_reason FROM sessions WHERE animal_id=${aid} ORDER BY started_at DESC LIMIT 1`;
    let skills=[];
    if(sess.length) skills=await db.sql`SELECT skill_id,repetitions FROM session_skills WHERE session_id=${sess[0].id} ORDER BY skill_id`;
    return json({observation:obs[0]||{},food:food[0]||{},vet:vet[0]||{},training:{...sess[0],skills}});
  }
  // --- Лекарства: prescription (план) + administrations (факт выдачи) ---
  if(p==='medications' || p.startsWith('medications/')){
    const mm=p.match(/^medications\/([^/]+)\/administrations$/);
    if(mm && req.method==='POST'){
      const b=await parse(req), adminId=mm[1];
      const rows=await db.sql`SELECT ma.id,ma.animal_id FROM medication_administrations ma JOIN medication_prescriptions mp ON mp.id=ma.prescription_id WHERE ma.id=${adminId}`;
      if(!rows.length)return json({error:'Приём препарата не найден'},404);
      if(!(await allowedAnimal(me,rows[0].animal_id)))return json({error:'Нет доступа к животному'},403);
      await db.sql`UPDATE medication_administrations SET administered_at=COALESCE(${b.administered_at||new Date().toISOString()},now()), administered_by=${me.id}, status='given', note=${String(b.note||'')}, updated_at=now() WHERE id=${adminId}`;
      return json({ok:true,id:adminId});
    }
    if(mm && req.method==='GET'){
      const rows=await db.sql`SELECT ma.*,mp.medication_name,mp.dosage,mp.route,mp.frequency_per_day,a.name animal_name FROM medication_administrations ma JOIN medication_prescriptions mp ON mp.id=ma.prescription_id JOIN animals a ON a.id=ma.animal_id WHERE ma.id=${mm[1]}`;
      if(!rows.length || !(await allowedAnimal(me,rows[0].animal_id)))return json({error:'Приём препарата не найден'},404);
      return json({administration:rows[0]});
    }
    if(req.method==='GET'){
      const q=new URL(req.url).searchParams, aid=q.get('animal_id');
      if(aid && !(await allowedAnimal(me,aid)))return json({error:'Нет доступа к животному'},403);
      const rows=aid ? await db.sql`SELECT mp.*,a.name animal_name,(SELECT count(*)::int FROM medication_administrations ma WHERE ma.prescription_id=mp.id) administration_count,(SELECT count(*)::int FROM medication_administrations ma WHERE ma.prescription_id=mp.id AND ma.status='given') given_count FROM medication_prescriptions mp JOIN animals a ON a.id=mp.animal_id WHERE mp.animal_id=${aid} ORDER BY mp.start_date DESC,mp.created_at DESC` : await db.sql`SELECT mp.*,a.name animal_name,(SELECT count(*)::int FROM medication_administrations ma WHERE ma.prescription_id=mp.id) administration_count,(SELECT count(*)::int FROM medication_administrations ma WHERE ma.prescription_id=mp.id AND ma.status='given') given_count FROM medication_prescriptions mp JOIN animals a ON a.id=mp.animal_id ORDER BY mp.start_date DESC,mp.created_at DESC LIMIT 500`;
      return json({prescriptions:rows});
    }
    if(req.method==='POST'){
      if(!['admin','vet'].includes(me.effective_role))return json({error:'Только ветеринар или администратор'},403);
      const b=await parse(req), aid=String(b.animal_id||''); if(!await allowedAnimal(me,aid))return json({error:'Нет доступа к животному'},403);
      const name=String(b.medication_name||'').trim(); if(!name)return json({error:'Укажите препарат'},400);
      const start=String(b.start_date||'').slice(0,10), end=String(b.end_date||'').slice(0,10); if(!start||!end||end<start)return json({error:'Укажите корректный период назначения'},400);
      const times=(Array.isArray(b.times)?b.times:[]).map(x=>String(x).trim()).filter(x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x));
      const count=Math.max(1,Math.min(24,Number(b.frequency_per_day||times.length||1)));
      const defaultTimes=count===1?['08:00']:count===2?['08:00','20:00']:count===3?['08:00','14:00','20:00']:Array.from({length:count},(_,i)=>`${String(Math.floor(i*24/count)).padStart(2,'0')}:00`);
      const useTimes=times.length===count?times:defaultTimes;
      const pid=id(); await db.sql`INSERT INTO medication_prescriptions(id,animal_id,vet_id,medication_name,dosage,route,frequency_per_day,times,start_date,end_date,instructions,active) VALUES(${pid},${aid},${me.id},${name},${String(b.dosage||'')},${String(b.route||'')},${count},${JSON.stringify(useTimes)},${start},${end},${String(b.instructions||'')},true)`;
      let created=0, day=new Date(`${start}T00:00:00`), last=new Date(`${end}T00:00:00`);
      while(day<=last){ const ds=day.toISOString().slice(0,10); for(const t of useTimes){const adid=id(); await db.sql`INSERT INTO medication_administrations(id,prescription_id,animal_id,scheduled_at,status) VALUES(${adid},${pid},${aid},${`${ds}T${t}:00`},'pending')`;created++;} day.setDate(day.getDate()+1); }
      return json({ok:true,id:pid,administrations_created:created,times:useTimes},201);
    }
  }
  // --- «Сегодня»: агрегация фактов + плановых выдач препаратов за день ---
  if(p==='today' && req.method==='GET'){
    const q=new URL(req.url).searchParams, aid=q.get('animal_id'), from=q.get('from'), to=q.get('to');
    if(!aid||!from||!to)return json({error:'Нужны animal_id, from и to'},400);
    if(!(await allowedAnimal(me,aid)))return json({error:'Нет доступа к животному'},403);
    const observations=await db.sql`SELECT o.id,o.observed_at,o.behavior_note,o.health_note,o.arousal,o.stress,o.concentration,o.appetite,o.pain,o.sleep,o.note,u.display_name author FROM observations o JOIN users u ON u.id=o.author_id WHERE o.animal_id=${aid} AND o.observed_at>=${from} AND o.observed_at<${to} ORDER BY o.observed_at DESC`;
    const food=await db.sql`SELECT f.id,f.logged_at,f.meal,f.offered,f.eaten,f.not_eaten,f.appetite,f.note,u.display_name author FROM food_logs f JOIN users u ON u.id=f.author_id WHERE f.animal_id=${aid} AND f.logged_at>=${from} AND f.logged_at<${to} ORDER BY f.logged_at DESC`;
    const sessions=await db.sql`SELECT s.id,s.started_at,s.ended_at,s.duration_minutes,s.ending_type,s.success_score,s.concentration,s.arousal,u.display_name author FROM sessions s JOIN users u ON u.id=s.trainer_id WHERE s.animal_id=${aid} AND s.started_at>=${from} AND s.started_at<${to} ORDER BY s.started_at DESC`;
    const homework=await db.sql`SELECT h.id,h.title,h.instructions,h.due_date,h.status,u.display_name trainer_name FROM homework h JOIN users u ON u.id=h.trainer_id WHERE h.animal_id=${aid} AND h.status='active' AND (h.due_date IS NULL OR h.due_date<=CURRENT_DATE+7) ORDER BY h.due_date NULLS LAST,h.updated_at DESC LIMIT 20`;
    const vet=await db.sql`SELECT v.id,v.record_type,v.medication_name,v.dosage,v.frequency,v.start_date,v.end_date,v.instructions,v.note,v.pain,v.appetite,v.sleep,v.complaint,v.updated_at,u.display_name vet_name FROM vet_records v JOIN users u ON u.id=v.vet_id WHERE v.animal_id=${aid} AND (v.updated_at>=${from} AND v.updated_at<${to} OR (v.record_type='prescription' AND (v.start_date IS NULL OR v.start_date<=CURRENT_DATE) AND (v.end_date IS NULL OR v.end_date>=CURRENT_DATE))) ORDER BY v.updated_at DESC`;
    const medications=await db.sql`SELECT ma.id,ma.prescription_id,ma.scheduled_at,ma.status,ma.administered_at,ma.note,mp.medication_name,mp.dosage,mp.route,a.name animal_name FROM medication_administrations ma JOIN medication_prescriptions mp ON mp.id=ma.prescription_id JOIN animals a ON a.id=ma.animal_id WHERE ma.animal_id=${aid} AND ma.scheduled_at>=${from} AND ma.scheduled_at<${to} ORDER BY ma.scheduled_at`;
    const reminderRules=await db.sql`SELECT r.id,r.title,r.details,r.remind_at,r.repeat_type,r.repeat_days,r.every_n_days,r.enabled FROM reminders r WHERE r.animal_id=${aid} AND r.enabled=true AND r.remind_at < ${to} AND (r.repeat_type<>'once' OR r.remind_at>=${from}) ORDER BY r.remind_at`;
    const reminders=[];
    const fromTs=new Date(from).getTime(),toTs=new Date(to).getTime();
    for(const r of reminderRules){const start=new Date(r.remind_at).getTime(); if(!Number.isFinite(start))continue;
      if(r.repeat_type==='once'){if(start>=fromTs&&start<toTs)reminders.push(r);continue;}
      for(let t=start;t<toTs;t+=86400000){if(t<fromTs)continue; const day=new Date(t); const ok=r.repeat_type==='daily'||(r.repeat_type==='every_n_days'&&Math.floor((t-start)/86400000)%Math.max(1,Number(r.every_n_days||1))===0)||(r.repeat_type==='weekly'&&day.getDay()===new Date(start).getDay()); if(ok)reminders.push({...r,remind_at:new Date(t).toISOString(),occurrence_of:r.id});}
    }
    const scheduled=await db.sql`SELECT si.id,si.type,si.title,si.details,si.scheduled_at,si.status FROM scheduled_items si WHERE si.animal_id=${aid} AND si.scheduled_at>=${from} AND si.scheduled_at<${to} ORDER BY si.scheduled_at`;
    return json({observations,food,sessions,homework,vet,medications,reminders,scheduled});
  }
  const sessionMatch=p.match(/^sessions\/([^/]+)$/);
  if(sessionMatch && req.method==='GET'){
    const sid=sessionMatch[1];
    const r=await db.sql`SELECT s.*,a.name animal_name,u.display_name author FROM sessions s JOIN animals a ON a.id=s.animal_id JOIN users u ON u.id=s.trainer_id WHERE s.id=${sid}`;
    if(!r.length || !(await allowedAnimal(me,r[0].animal_id)))return json({error:'Тренировка не найдена'},404);
    const skills=await db.sql`SELECT ss.skill_id,ss.repetitions,sk.name FROM session_skills ss JOIN skills sk ON sk.id=ss.skill_id WHERE ss.session_id=${sid} ORDER BY sk.name`;
    return json({session:r[0],skills});
  }
  if(p==='sessions' && req.method==='GET'){
    const q=new URL(req.url).searchParams, aid=q.get('animal_id');
    if(aid && !(await allowedAnimal(me,aid)))return json({error:'Нет доступа к животному'},403);
    const r=aid
      ? await db.sql`SELECT s.id,s.animal_id,s.trainer_id,s.started_at,s.ended_at,s.duration_minutes,s.ending_type,s.ending_other,s.success_score,s.external_stimulus,s.external_reason,s.internal_stimulus,s.internal_reason,s.concentration,s.arousal,a.name animal_name,u.display_name author FROM sessions s JOIN animals a ON a.id=s.animal_id JOIN users u ON u.id=s.trainer_id WHERE s.animal_id=${aid} ORDER BY s.started_at DESC LIMIT 300`
      : me.role==='admin'
        ? await db.sql`SELECT s.id,s.animal_id,s.trainer_id,s.started_at,s.ended_at,s.duration_minutes,s.ending_type,s.ending_other,s.success_score,s.external_stimulus,s.external_reason,s.internal_stimulus,s.internal_reason,s.concentration,s.arousal,a.name animal_name,u.display_name author FROM sessions s JOIN animals a ON a.id=s.animal_id JOIN users u ON u.id=s.trainer_id ORDER BY s.started_at DESC LIMIT 500`
        : await db.sql`SELECT s.id,s.animal_id,s.trainer_id,s.started_at,s.ended_at,s.duration_minutes,s.ending_type,s.ending_other,s.success_score,s.external_stimulus,s.external_reason,s.internal_stimulus,s.internal_reason,s.concentration,s.arousal,a.name animal_name,u.display_name author FROM sessions s JOIN animals a ON a.id=s.animal_id JOIN users u ON u.id=s.trainer_id LEFT JOIN animal_access aa ON aa.animal_id=a.id AND aa.user_id=${me.id} WHERE a.owner_id=${me.id} OR aa.user_id IS NOT NULL ORDER BY s.started_at DESC LIMIT 500`;
    return json({sessions:r});
  }
  if(sessionMatch && req.method==='DELETE'){
    const sid=sessionMatch[1];
    const row=await db.sql`SELECT id,animal_id,trainer_id FROM sessions WHERE id=${sid}`;
    if(!row.length)return json({error:'Тренировка не найдена'},404);
    if(!(await allowedAnimal(me,row[0].animal_id)))return json({error:'Нет доступа к животному'},403);
    if(me.effective_role!=='admin' && row[0].trainer_id!==me.id)return json({error:'Удалять тренировку может только её автор или администратор'},403);
    await db.sql`DELETE FROM sessions WHERE id=${sid}`;
    return json({ok:true});
  }
  if(p==='sessions' && req.method==='POST'){
    const b=await parse(req), sessionType=String(b.session_type||'training'), homeworkId=String(b.homework_id||'')||null;
    const canStandard=['admin','trainer','keeper'].includes(me.effective_role);
    const canHomework=me.effective_role==='owner' && sessionType==='homework' && homeworkId;
    if(!canStandard && !canHomework)return json({error:'Недоступно для этой роли'},403);
    const allowed=await allowedAnimal(me,b.animal_id); if(!allowed)return json({error:'Нет доступа к животному'},403);
    if(homeworkId){
      const hw=await db.sql`SELECT id,status,animal_id FROM homework WHERE id=${homeworkId} AND animal_id=${b.animal_id}`;
      if(!hw.length)return json({error:'Домашнее задание не найдено'},404);
      if(['done','completed','complete'].includes(String(hw[0].status||'').toLowerCase()))return json({error:'Домашнее задание уже выполнено'},409);
    }
    const sid=id();
    await db.sql`INSERT INTO sessions(id,animal_id,trainer_id,session_type,homework_id,started_at,ended_at,duration_minutes,ending_type,ending_other,success_score,external_stimulus,external_reason,internal_stimulus,internal_reason,concentration,arousal) VALUES(${sid},${b.animal_id},${me.id},${sessionType},${homeworkId},${b.started_at},${b.ended_at},${b.duration_minutes},${b.ending_type},${b.ending_other||''},${b.success_score},${b.external_stimulus},${b.external_reason||''},${b.internal_stimulus},${b.internal_reason||''},${b.concentration},${b.arousal})`;
    for(const sk of b.skills||[])await db.sql`INSERT INTO session_skills(session_id,skill_id,repetitions) VALUES(${sid},${sk.skill_id},${Number(sk.repetitions||0)})`;
    if(homeworkId)await db.sql`UPDATE homework SET status='done',updated_at=now() WHERE id=${homeworkId}`;
    return json({ok:true,id:sid},201);
  }
  if(p==='observations'){
    if(req.method==='GET'){
      const aid=new URL(req.url).searchParams.get('animal_id'); if(aid && !(await allowedAnimal(me,aid)))return json({error:'Нет доступа к животному'},403);
      const r=aid?await db.sql`SELECT o.*,a.name animal_name,u.display_name author FROM observations o JOIN animals a ON a.id=o.animal_id JOIN users u ON u.id=o.author_id WHERE o.animal_id=${aid} ORDER BY o.observed_at DESC LIMIT 200`:
        (me.role==='admin'?await db.sql`SELECT o.*,a.name animal_name,u.display_name author FROM observations o JOIN animals a ON a.id=o.animal_id JOIN users u ON u.id=o.author_id ORDER BY o.observed_at DESC LIMIT 200`:await db.sql`SELECT o.*,a.name animal_name,u.display_name author FROM observations o JOIN animals a ON a.id=o.animal_id JOIN users u ON u.id=o.author_id LEFT JOIN animal_access aa ON aa.animal_id=a.id AND aa.user_id=${me.id} WHERE a.owner_id=${me.id} OR aa.user_id IS NOT NULL ORDER BY o.observed_at DESC LIMIT 200`);
      return json({observations:r});
    }
    if(req.method==='POST'){
      const b=await parse(req); if(!await allowedAnimal(me,b.animal_id))return json({error:'Нет доступа к животному'},403);
      const oid=id(); await db.sql`INSERT INTO observations(id,animal_id,author_id,observed_at,behavior_note,health_note,arousal,stress,concentration,appetite,pain,sleep,note) VALUES(${oid},${b.animal_id},${me.id},${b.observed_at||new Date().toISOString()},${b.behavior_note||''},${b.health_note||''},${b.arousal||null},${b.stress||null},${b.concentration||null},${b.appetite||null},${b.pain||null},${b.sleep||null},${b.note||''})`; return json({ok:true,id:oid},201);
    }
  }
  if(p==='training-templates'){
    if(req.method==='GET'){
      const rows=me.effective_role==='admin'
        ? await db.sql`SELECT t.id,t.name,t.description,t.duration_minutes,t.skill_ids,t.created_at,COALESCE((SELECT array_agg(sk.name ORDER BY sk.name) FROM skills sk WHERE sk.id=ANY(t.skill_ids)),ARRAY[]::text[]) skill_names FROM training_templates t WHERE t.trainer_id=${me.id} ORDER BY t.created_at DESC`
        : await db.sql`SELECT t.id,t.name,t.description,t.duration_minutes,t.skill_ids,t.created_at,COALESCE((SELECT array_agg(sk.name ORDER BY sk.name) FROM skills sk WHERE sk.id=ANY(t.skill_ids)),ARRAY[]::text[]) skill_names FROM training_templates t WHERE t.trainer_id=${me.id} ORDER BY t.created_at DESC`;
      return json({templates:rows});
    }
    if(req.method==='POST'){
      if(!['admin','trainer'].includes(me.effective_role))return json({error:'Только тренер или администратор'},403);
      const b=await parse(req);
      const name=String(b.name||'').trim();
      if(!name)return json({error:'Укажите название шаблона'},400);
      const skillIds=Array.isArray(b.skill_ids)?b.skill_ids.map(String).filter(Boolean):[];
      const tid=id();
      await db.sql`INSERT INTO training_templates(id,trainer_id,name,description,duration_minutes,skill_ids) VALUES(${tid},${me.id},${name},${String(b.description||'')},${Math.max(1,Number(b.duration_minutes||15))},${skillIds})`;
      return json({ok:true,id:tid},201);
    }
  }
  const trainingTemplateMatch=p.match(/^training-templates\/([^/]+)$/);
  if(trainingTemplateMatch && req.method==='DELETE'){
    if(!['admin','trainer'].includes(me.effective_role))return json({error:'Только тренер или администратор'},403);
    const tid=trainingTemplateMatch[1];
    const found=await db.sql`SELECT id FROM training_templates WHERE id=${tid} AND trainer_id=${me.id}`;
    if(!found.length)return json({error:'Шаблон не найден'},404);
    await db.sql`DELETE FROM training_templates WHERE id=${tid}`;
    return json({ok:true});
  }
  if(p==='homework'){
    if(req.method==='GET'){
      const aid=new URL(req.url).searchParams.get('animal_id'); if(aid && !(await allowedAnimal(me,aid)))return json({error:'Нет доступа к животному'},403);
      const r=aid?await db.sql`SELECT h.*,a.name animal_name,u.display_name trainer_name,s.name skill_name FROM homework h JOIN animals a ON a.id=h.animal_id JOIN users u ON u.id=h.trainer_id LEFT JOIN skills s ON s.id=h.skill_id WHERE h.animal_id=${aid} ORDER BY h.updated_at DESC`:
        (me.role==='admin'?await db.sql`SELECT h.*,a.name animal_name,u.display_name trainer_name,s.name skill_name FROM homework h JOIN animals a ON a.id=h.animal_id JOIN users u ON u.id=h.trainer_id LEFT JOIN skills s ON s.id=h.skill_id ORDER BY h.updated_at DESC LIMIT 200`:await db.sql`SELECT h.*,a.name animal_name,u.display_name trainer_name,s.name skill_name FROM homework h JOIN animals a ON a.id=h.animal_id JOIN users u ON u.id=h.trainer_id LEFT JOIN skills s ON s.id=h.skill_id LEFT JOIN animal_access aa ON aa.animal_id=a.id AND aa.user_id=${me.id} WHERE a.owner_id=${me.id} OR aa.user_id IS NOT NULL ORDER BY h.updated_at DESC LIMIT 200`);
      return json({homework:r});
    }
    if(req.method==='POST' || req.method==='PUT'){
      if(!['admin','trainer'].includes(me.effective_role))return json({error:'Только тренер или администратор'},403);
      const b=await parse(req), aid=String(b.animal_id||''); if(!await allowedAnimal(me,aid))return json({error:'Нет доступа к животному'},403);
      if(req.method==='POST'){const hid=id(); await db.sql`INSERT INTO homework(id,animal_id,trainer_id,skill_id,title,instructions,due_date,status) VALUES(${hid},${aid},${me.id},${b.skill_id||null},${b.title||'Домашнее задание'},${b.instructions||''},${b.due_date||null},${b.status||'active'})`;return json({ok:true,id:hid},201)}
      const hid=String(b.id||''); const found=await db.sql`SELECT id FROM homework WHERE id=${hid} AND animal_id=${aid}`; if(!found.length)return json({error:'Задание не найдено'},404); await db.sql`UPDATE homework SET skill_id=${b.skill_id||null},title=${b.title||'Домашнее задание'},instructions=${b.instructions||''},due_date=${b.due_date||null},status=${b.status||'active'},updated_at=now() WHERE id=${hid}`; return json({ok:true});
    }
  }
  // --- Ветеринарные анализы ---
  if(p==='vet-analyses'){
    if(req.method==='GET'){
      const aid=new URL(req.url).searchParams.get('animal_id');
      if(!aid)return json({error:'animal_id required'},400);
      if(!await allowedAnimal(me,aid))return json({error:'Нет доступа к животному'},403);
      const rows=await db.sql`SELECT v.*,a.name animal_name,u.display_name vet_name FROM vet_analyses v JOIN animals a ON a.id=v.animal_id JOIN users u ON u.id=v.vet_id WHERE v.animal_id=${aid} ORDER BY v.sample_date DESC,v.created_at DESC LIMIT 1000`;
      return json({analyses:rows});
    }
    if(req.method==='POST' || req.method==='PUT'){
      if(!['admin','vet'].includes(me.effective_role))return json({error:'Только ветеринар или администратор'},403);
      const b=await parse(req), aid=String(b.animal_id||''); if(!await allowedAnimal(me,aid))return json({error:'Нет доступа к животному'},403);
      const status=['normal','high','low','critical','unknown'].includes(String(b.status))?String(b.status):'unknown';
      if(req.method==='POST'){
        const vid=id(); await db.sql`INSERT INTO vet_analyses(id,animal_id,vet_id,sample_date,analysis_name,parameter,value_numeric,value_text,unit,reference_min,reference_max,status,note) VALUES(${vid},${aid},${me.id},${b.sample_date||new Date().toISOString().slice(0,10)},${String(b.analysis_name||'').trim()},${String(b.parameter||'').trim()},${b.value_numeric===''||b.value_numeric==null?null:Number(b.value_numeric)},${b.value_text||''},${b.unit||''},${b.reference_min===''||b.reference_min==null?null:Number(b.reference_min)},${b.reference_max===''||b.reference_max==null?null:Number(b.reference_max)},${status},${b.note||''})`;
        return json({ok:true,id:vid},201);
      }
      const vid=String(b.id||''); const found=await db.sql`SELECT id,animal_id FROM vet_analyses WHERE id=${vid}`; if(!found.length)return json({error:'Анализ не найден'},404); if(found[0].animal_id!==aid)return json({error:'Неверное животное'},400);
      await db.sql`UPDATE vet_analyses SET sample_date=${b.sample_date||new Date().toISOString().slice(0,10)},analysis_name=${String(b.analysis_name||'').trim()},parameter=${String(b.parameter||'').trim()},value_numeric=${b.value_numeric===''||b.value_numeric==null?null:Number(b.value_numeric)},value_text=${b.value_text||''},unit=${b.unit||''},reference_min=${b.reference_min===''||b.reference_min==null?null:Number(b.reference_min)},reference_max=${b.reference_max===''||b.reference_max==null?null:Number(b.reference_max)},status=${status},note=${b.note||''},updated_at=now() WHERE id=${vid}`;
      return json({ok:true});
    }
    if(req.method==='DELETE'){
      if(!['admin','vet'].includes(me.effective_role))return json({error:'Только ветеринар или администратор'},403);
      const b=await parse(req); const rows=await db.sql`SELECT animal_id FROM vet_analyses WHERE id=${b.id}`; if(!rows.length)return json({error:'Анализ не найден'},404); if(!await allowedAnimal(me,rows[0].animal_id))return json({error:'Нет доступа'},403); await db.sql`DELETE FROM vet_analyses WHERE id=${b.id}`; return json({ok:true});
    }
  }

  // --- Ветеринария: vet_records (note|prescription) + связь с medication_* ---
  if(p==='vet'){
    if(req.method==='GET'){
      const aid=new URL(req.url).searchParams.get('animal_id'); if(aid && !(await allowedAnimal(me,aid)))return json({error:'Нет доступа к животному'},403);
      let r=[];
      if(aid){
        r=me.effective_role==='trainer'
          ? await db.sql`SELECT v.id,v.animal_id,v.vet_id,v.record_type,v.note,v.medication_name,v.frequency,v.start_date,v.end_date,v.instructions,v.updated_at,v.created_at,a.name animal_name,u.display_name vet_name FROM vet_records v JOIN animals a ON a.id=v.animal_id JOIN users u ON u.id=v.vet_id WHERE v.animal_id=${aid} ORDER BY v.updated_at DESC`
          : await db.sql`SELECT v.id,v.animal_id,v.vet_id,v.record_type,v.note,v.medication_name,v.dosage,v.frequency,v.start_date,v.end_date,v.instructions,v.pain,v.appetite,v.sleep,v.complaint,v.updated_at,v.created_at,a.name animal_name,u.display_name vet_name FROM vet_records v JOIN animals a ON a.id=v.animal_id JOIN users u ON u.id=v.vet_id WHERE v.animal_id=${aid} ORDER BY v.updated_at DESC`;
      } else {
        r=me.effective_role==='trainer'
          ? await db.sql`SELECT v.id,v.animal_id,v.vet_id,v.record_type,v.note,v.medication_name,v.frequency,v.start_date,v.end_date,v.instructions,v.updated_at,v.created_at,a.name animal_name,u.display_name vet_name FROM vet_records v JOIN animals a ON a.id=v.animal_id JOIN users u ON u.id=v.vet_id LEFT JOIN animal_access aa ON aa.animal_id=a.id AND aa.user_id=${me.id} WHERE a.owner_id=${me.id} OR aa.user_id IS NOT NULL ORDER BY v.updated_at DESC LIMIT 500`
          : me.role==='admin'
            ? await db.sql`SELECT v.id,v.animal_id,v.vet_id,v.record_type,v.note,v.medication_name,v.dosage,v.frequency,v.start_date,v.end_date,v.instructions,v.pain,v.appetite,v.sleep,v.complaint,v.updated_at,v.created_at,a.name animal_name,u.display_name vet_name FROM vet_records v JOIN animals a ON a.id=v.animal_id JOIN users u ON u.id=v.vet_id ORDER BY v.updated_at DESC LIMIT 500`
            : await db.sql`SELECT v.id,v.animal_id,v.vet_id,v.record_type,v.note,v.medication_name,v.dosage,v.frequency,v.start_date,v.end_date,v.instructions,v.pain,v.appetite,v.sleep,v.complaint,v.updated_at,v.created_at,a.name animal_name,u.display_name vet_name FROM vet_records v JOIN animals a ON a.id=v.animal_id JOIN users u ON u.id=v.vet_id LEFT JOIN animal_access aa ON aa.animal_id=a.id AND aa.user_id=${me.id} WHERE a.owner_id=${me.id} OR aa.user_id IS NOT NULL ORDER BY v.updated_at DESC LIMIT 500`;
      }
      return json({records:r});
    }
    if(req.method==='POST' || req.method==='PUT'){
      if(!['admin','vet'].includes(me.effective_role))return json({error:'Только ветеринар или администратор'},403);
      const b=await parse(req), aid=String(b.animal_id||''); if(!await allowedAnimal(me,aid))return json({error:'Нет доступа к животному'},403);
      if(req.method==='POST'){const vid=id(); await db.sql`INSERT INTO vet_records(id,animal_id,vet_id,record_type,note,medication_name,dosage,frequency,start_date,end_date,instructions,pain,appetite,sleep,complaint) VALUES(${vid},${aid},${me.id},${b.record_type||'prescription'},${b.note||''},${b.medication_name||''},${b.dosage||''},${b.frequency||''},${b.start_date||null},${b.end_date||null},${b.instructions||''},${b.pain==null?null:Number(b.pain)||null},${b.appetite==null?null:Number(b.appetite)||null},${b.sleep==null?null:Number(b.sleep)||null},${b.complaint||''})`;return json({ok:true,id:vid},201)}
      const vid=String(b.id||''); const found=await db.sql`SELECT id FROM vet_records WHERE id=${vid} AND animal_id=${aid}`; if(!found.length)return json({error:'Запись не найдена'},404); await db.sql`UPDATE vet_records SET record_type=${b.record_type||'prescription'},note=${b.note||''},medication_name=${b.medication_name||''},dosage=${b.dosage||''},frequency=${b.frequency||''},start_date=${b.start_date||null},end_date=${b.end_date||null},instructions=${b.instructions||''},pain=${b.pain==null?null:Number(b.pain)||null},appetite=${b.appetite==null?null:Number(b.appetite)||null},sleep=${b.sleep==null?null:Number(b.sleep)||null},complaint=${b.complaint||''},updated_at=now() WHERE id=${vid}`;return json({ok:true});
    }
    if(req.method==='DELETE'){
      const b=await parse(req), vid=String(b.id||'');
      const row=await db.sql`SELECT id,animal_id,vet_id FROM vet_records WHERE id=${vid}`;
      if(!row.length)return json({error:'Ветеринарная запись не найдена'},404);
      if(!(await allowedAnimal(me,row[0].animal_id)))return json({error:'Нет доступа к животному'},403);
      if(me.effective_role!=='admin' && row[0].vet_id!==me.id)return json({error:'Удалять медицинскую запись может только её автор или администратор'},403);
      await db.sql`DELETE FROM vet_records WHERE id=${vid}`;
      return json({ok:true});
    }
  }
  // --- Фактические записи питания (food_logs), products jsonb ---
  if(p==='food'){
    if(req.method==='GET'){
      const aid=new URL(req.url).searchParams.get('animal_id'); if(aid && !(await allowedAnimal(me,aid)))return json({error:'Нет доступа к животному'},403); const r=aid ? await db.sql`SELECT f.*,a.name animal_name,u.display_name author FROM food_logs f JOIN animals a ON a.id=f.animal_id JOIN users u ON u.id=f.author_id WHERE f.animal_id=${aid} ORDER BY f.logged_at DESC LIMIT 200` : me.role==='admin' ? await db.sql`SELECT f.*,a.name animal_name,u.display_name author FROM food_logs f JOIN animals a ON a.id=f.animal_id JOIN users u ON u.id=f.author_id ORDER BY f.logged_at DESC LIMIT 500` : await db.sql`SELECT f.*,a.name animal_name,u.display_name author FROM food_logs f JOIN animals a ON a.id=f.animal_id JOIN users u ON u.id=f.author_id LEFT JOIN animal_access aa ON aa.animal_id=a.id AND aa.user_id=${me.id} WHERE a.owner_id=${me.id} OR aa.user_id IS NOT NULL ORDER BY f.logged_at DESC LIMIT 500`; return json({food:r});
    }
    if(req.method==='POST'){
      if(!['admin','keeper','owner','vet'].includes(me.effective_role))return json({error:'Нет прав на запись питания'},403); const b=await parse(req); if(!await allowedAnimal(me,b.animal_id))return json({error:'Нет доступа к животному'},403); const fid=id(); const products=JSON.stringify(Array.isArray(b.products)?b.products:[]); const dietMealId=String(b.diet_meal_id||'')||null; await db.sql`INSERT INTO food_logs(id,animal_id,author_id,logged_at,meal,offered,eaten,not_eaten,appetite,note,products,diet_meal_id,planned) VALUES(${fid},${b.animal_id},${me.id},${b.logged_at||new Date().toISOString()},${b.meal||''},${b.offered||''},${b.eaten||''},${b.not_eaten||''},${b.appetite||null},${b.note||''},${products}::jsonb,${dietMealId},${b.planned===true})`;return json({ok:true,id:fid},201);
    }
    if(req.method==='PUT'){
      if(!['admin','keeper','owner','vet'].includes(me.effective_role))return json({error:'Нет прав на изменение'},403);
      const b=await parse(req), fid=String(b.id||'');
      const rows=await db.sql`SELECT animal_id FROM food_logs WHERE id=${fid}`;
      if(!rows.length)return json({error:'Запись не найдена'},404);
      if(!await allowedAnimal(me,rows[0].animal_id))return json({error:'Нет доступа'},403);
      const products=JSON.stringify(Array.isArray(b.products)?b.products:[]);
      const dietMealId=String(b.diet_meal_id||'')||null;
      await db.sql`UPDATE food_logs SET meal=${b.meal||''},offered=${b.offered||''},eaten=${b.eaten||''},not_eaten=${b.not_eaten||''},appetite=${b.appetite||null},note=${b.note||''},products=${products}::jsonb,diet_meal_id=${dietMealId},planned=${b.planned===true},updated_at=now() WHERE id=${fid}`;
      return json({ok:true});
    }
    if(req.method==='DELETE'){
      if(!['admin','keeper','owner','vet'].includes(me.effective_role))return json({error:'Нет прав на удаление'},403); const b=await parse(req); const rows=await db.sql`SELECT animal_id FROM food_logs WHERE id=${b.id}`; if(!rows.length)return json({error:'Запись не найдена'},404); if(!await allowedAnimal(me,rows[0].animal_id))return json({error:'Нет доступа'},403); await db.sql`DELETE FROM food_logs WHERE id=${b.id}`; return json({ok:true});
    }
  }



  // ========== ОБОГАЩЕНИЕ СРЕДЫ (кипер): факт мероприятий, не план ==========
  // ========== ENRICHMENT (обогащение среды) ==========
  if(p==='enrichment'){
    if(req.method==='GET'){
      const aid=new URL(req.url).searchParams.get('animal_id');
      if(aid && !(await allowedAnimal(me,aid))) return json({error:'Нет доступа к животному'},403);
      const r = aid
        ? await db.sql`SELECT e.*, a.name animal_name, u.display_name author FROM enrichment_logs e JOIN animals a ON a.id=e.animal_id JOIN users u ON u.id=e.author_id WHERE e.animal_id=${aid} ORDER BY e.logged_at DESC LIMIT 200`
        : me.role==='admin'
          ? await db.sql`SELECT e.*, a.name animal_name, u.display_name author FROM enrichment_logs e JOIN animals a ON a.id=e.animal_id JOIN users u ON u.id=e.author_id ORDER BY e.logged_at DESC LIMIT 300`
          : await db.sql`SELECT e.*, a.name animal_name, u.display_name author FROM enrichment_logs e JOIN animals a ON a.id=e.animal_id JOIN users u ON u.id=e.author_id LEFT JOIN animal_access aa ON aa.animal_id=a.id AND aa.user_id=${me.id} WHERE a.owner_id=${me.id} OR aa.user_id IS NOT NULL ORDER BY e.logged_at DESC LIMIT 300`;
      return json({enrichment:r});
    }
    if(req.method==='POST'){
      if(!['admin','keeper','owner','trainer'].includes(me.effective_role)) return json({error:'Нет прав'},403);
      const b=await parse(req);
      if(!await allowedAnimal(me,b.animal_id)) return json({error:'Нет доступа'},403);
      const eid=id();
      await db.sql`INSERT INTO enrichment_logs(id,animal_id,author_id,logged_at,category,title,details,duration_minutes,animals_reaction) VALUES(${eid},${b.animal_id},${me.id},${b.logged_at||new Date().toISOString()},${b.category||'other'},${b.title||'Обогащение'},${b.details||''},${b.duration_minutes??null},${b.animals_reaction||''})`;
      return json({ok:true,id:eid},201);
    }
    if(req.method==='DELETE'){
      if(!['admin','keeper','owner'].includes(me.effective_role)) return json({error:'Нет прав'},403);
      const b=await parse(req);
      const rows=await db.sql`SELECT animal_id FROM enrichment_logs WHERE id=${b.id}`;
      if(!rows.length) return json({error:'Не найдено'},404);
      if(!await allowedAnimal(me,rows[0].animal_id)) return json({error:'Нет доступа'},403);
      await db.sql`DELETE FROM enrichment_logs WHERE id=${b.id}`;
      return json({ok:true});
    }
  }

  // ========== СПРАВОЧНИК ПРОДУКТОВ: ккал/100г (пользовательский + автоподстановка) ==========
  // ========== FOOD PRODUCT CATALOG (kcal/100g) ==========
  if(p==='food-products' || p.startsWith('food-products/')){
    const one = p.match(/^food-products\/([^/]+)$/);
    const norm = (s)=>String(s||'').toLowerCase().trim().replace(/\s+/g,' ');

    if(p==='food-products' && req.method==='GET'){
      const q = new URL(req.url).searchParams;
      const aid = q.get('animal_id');
      const search = norm(q.get('q')||'');
      // Return animal-specific + global (animal_id is null)
      let rows;
      if(aid){
        if(!(await allowedAnimal(me,aid))) return json({error:'Нет доступа'},403);
        rows = search
          ? await db.sql`SELECT * FROM food_product_catalog WHERE (animal_id=${aid} OR animal_id IS NULL) AND name_normalized LIKE ${'%'+search+'%'} ORDER BY animal_id NULLS LAST, name LIMIT 100`
          : await db.sql`SELECT * FROM food_product_catalog WHERE animal_id=${aid} OR animal_id IS NULL ORDER BY animal_id NULLS LAST, name LIMIT 200`;
      } else {
        rows = search
          ? await db.sql`SELECT * FROM food_product_catalog WHERE name_normalized LIKE ${'%'+search+'%'} ORDER BY name LIMIT 100`
          : await db.sql`SELECT * FROM food_product_catalog ORDER BY name LIMIT 200`;
      }
      return json({products: rows});
    }

    if(p==='food-products' && req.method==='POST'){
      if(!['admin','keeper','owner','vet','trainer'].includes(me.effective_role)) return json({error:'Нет прав'},403);
      const b = await parse(req);
      const name = String(b.name||'').trim();
      if(!name) return json({error:'Укажите название продукта'},400);
      const kcal = Number(b.kcal_per_100g);
      if(!(kcal>=0 && kcal<=1000)) return json({error:'Ккал на 100г: число от 0 до 1000'},400);
      const aid = b.animal_id || null;
      if(aid && !(await allowedAnimal(me,aid))) return json({error:'Нет доступа'},403);
      const n = norm(name);
      // Upsert by normalized name + animal scope
      const existing = aid
        ? await db.sql`SELECT id FROM food_product_catalog WHERE name_normalized=${n} AND animal_id=${aid} LIMIT 1`
        : await db.sql`SELECT id FROM food_product_catalog WHERE name_normalized=${n} AND animal_id IS NULL LIMIT 1`;
      if(existing.length){
        await db.sql`UPDATE food_product_catalog SET name=${name}, kcal_per_100g=${kcal}, updated_at=now(), created_by=${me.id} WHERE id=${existing[0].id}`;
        return json({ok:true,id:existing[0].id,updated:true});
      }
      const pid = id();
      await db.sql`INSERT INTO food_product_catalog(id,name,name_normalized,kcal_per_100g,animal_id,created_by) VALUES(${pid},${name},${n},${kcal},${aid},${me.id})`;
      return json({ok:true,id:pid,updated:false},201);
    }

    if(one && req.method==='DELETE'){
      if(!['admin','keeper','owner','vet'].includes(me.effective_role)) return json({error:'Нет прав'},403);
      const rows = await db.sql`SELECT * FROM food_product_catalog WHERE id=${one[1]}`;
      if(!rows.length) return json({error:'Не найдено'},404);
      if(rows[0].animal_id && !(await allowedAnimal(me,rows[0].animal_id))) return json({error:'Нет доступа'},403);
      await db.sql`DELETE FROM food_product_catalog WHERE id=${one[1]}`;
      return json({ok:true});
    }

    return json({error:'Неизвестный маршрут каталога продуктов'},404);
  }

  // ========== РАЦИОНЫ / ПЛАН ПИТАНИЯ ==========
  // diets → diet_periods → diet_meals → diet_meal_products
  // copy-day копирует приёмы с day_offset A на B; /diets/active — рацион на дату
  // ========== DIETS MODULE ==========
  if(p==='diets' || p.startsWith('diets/')){
    const dm = p.match(/^diets\/([^/]+)$/);
    const mealsM = p.match(/^diets\/([^/]+)\/meals$/);
    const mealProdM = p.match(/^diets\/([^/]+)\/meals\/([^/]+)\/products$/);
    const periodM = p.match(/^diets\/([^/]+)\/periods$/);
    const copyM = p.match(/^diets\/([^/]+)\/copy-day$/);
    const activeM = p.match(/^diets\/active$/);

    // List diets for animal
    if(p==='diets' && req.method==='GET'){
      const aid = new URL(req.url).searchParams.get('animal_id');
      if(!aid) return json({error:'animal_id required'},400);
      if(!(await allowedAnimal(me,aid))) return json({error:'Нет доступа к животному'},403);
      const rows = await db.sql`SELECT d.*, u.display_name author,
        (SELECT count(*)::int FROM diet_meals m WHERE m.diet_id=d.id) meal_count,
        (SELECT json_agg(json_build_object('id',dp.id,'start_date',dp.start_date,'end_date',dp.end_date) ORDER BY dp.start_date) FROM diet_periods dp WHERE dp.diet_id=d.id) periods
        FROM diets d LEFT JOIN users u ON u.id=d.created_by
        WHERE d.animal_id=${aid} ORDER BY d.active DESC, d.updated_at DESC`;
      return json({diets: rows});
    }

    // Create diet
    if(p==='diets' && req.method==='POST'){
      if(!['admin','keeper','owner','vet'].includes(me.effective_role)) return json({error:'Нет прав'},403);
      const b = await parse(req);
      if(!await allowedAnimal(me,b.animal_id)) return json({error:'Нет доступа'},403);
      const did = id();
      await db.sql`INSERT INTO diets(id,animal_id,name,description,active,created_by) VALUES(${did},${b.animal_id},${b.name||'Рацион'},${b.description||''},${b.active!==false},${me.id})`;
      if(b.start_date){
        await db.sql`INSERT INTO diet_periods(id,diet_id,animal_id,start_date,end_date) VALUES(${id()},${did},${b.animal_id},${b.start_date},${b.end_date||null})`;
      }
      return json({ok:true,id:did},201);
    }

    // Get / update / delete single diet
    if(dm && !mealsM && !periodM && !copyM){
      const did = dm[1];
      const drows = await db.sql`SELECT * FROM diets WHERE id=${did}`;
      if(!drows.length) return json({error:'Рацион не найден'},404);
      if(!await allowedAnimal(me,drows[0].animal_id)) return json({error:'Нет доступа'},403);

      if(req.method==='GET'){
        const meals = await db.sql`SELECT m.*,
          coalesce(json_agg(json_build_object('id',p.id,'name',p.name,'quantity',p.quantity,'calories',p.calories,'sort_order',p.sort_order) ORDER BY p.sort_order) FILTER(WHERE p.id IS NOT NULL),'[]') products
          FROM diet_meals m LEFT JOIN diet_meal_products p ON p.meal_id=m.id
          WHERE m.diet_id=${did} GROUP BY m.id ORDER BY m.day_offset, m.sort_order, m.time_of_day`;
        const periods = await db.sql`SELECT * FROM diet_periods WHERE diet_id=${did} ORDER BY start_date`;
        return json({diet:drows[0], meals, periods});
      }
      if(req.method==='PUT'){
        const b = await parse(req);
        await db.sql`UPDATE diets SET name=${b.name||drows[0].name}, description=${b.description??drows[0].description}, active=${b.active??drows[0].active}, updated_at=now() WHERE id=${did}`;
        return json({ok:true});
      }
      if(req.method==='DELETE'){
        await db.sql`DELETE FROM diets WHERE id=${did}`;
        return json({ok:true});
      }
    }

    // Meals CRUD
    if(mealsM){
      const did = mealsM[1];
      const drows = await db.sql`SELECT animal_id FROM diets WHERE id=${did}`;
      if(!drows.length) return json({error:'Рацион не найден'},404);
      if(!await allowedAnimal(me,drows[0].animal_id)) return json({error:'Нет доступа'},403);

      if(req.method==='GET'){
        const meals = await db.sql`SELECT m.*,
          coalesce(json_agg(json_build_object('id',p.id,'name',p.name,'quantity',p.quantity,'calories',p.calories,'sort_order',p.sort_order) ORDER BY p.sort_order) FILTER(WHERE p.id IS NOT NULL),'[]') products
          FROM diet_meals m LEFT JOIN diet_meal_products p ON p.meal_id=m.id
          WHERE m.diet_id=${did} GROUP BY m.id ORDER BY m.day_offset, m.sort_order, m.time_of_day`;
        return json({meals});
      }
      if(req.method==='POST'){
        const b = await parse(req);
        const mid = id();
        await db.sql`INSERT INTO diet_meals(id,diet_id,day_offset,time_of_day,title,sort_order) VALUES(${mid},${did},${b.day_offset||0},${b.time_of_day||'08:00'},${b.title||'Приём пищи'},${b.sort_order||0})`;
        for(const [i,p] of (b.products||[]).entries()){
          await db.sql`INSERT INTO diet_meal_products(id,meal_id,name,quantity,calories,sort_order) VALUES(${id()},${mid},${p.name||''},${p.quantity||''},${p.calories??null},${i})`;
        }
        return json({ok:true,id:mid},201);
      }
      if(req.method==='PUT'){
        const b = await parse(req);
        if(!b.id) return json({error:'id meal required'},400);
        await db.sql`UPDATE diet_meals SET day_offset=${b.day_offset??0}, time_of_day=${b.time_of_day||'08:00'}, title=${b.title||'Приём пищи'}, sort_order=${b.sort_order||0} WHERE id=${b.id} AND diet_id=${did}`;
        if(Array.isArray(b.products)){
          await db.sql`DELETE FROM diet_meal_products WHERE meal_id=${b.id}`;
          for(const [i,p] of b.products.entries()){
            await db.sql`INSERT INTO diet_meal_products(id,meal_id,name,quantity,calories,sort_order) VALUES(${id()},${b.id},${p.name||''},${p.quantity||''},${p.calories??null},${i})`;
          }
        }
        return json({ok:true});
      }
      if(req.method==='DELETE'){
        const b = await parse(req);
        await db.sql`DELETE FROM diet_meals WHERE id=${b.id} AND diet_id=${did}`;
        return json({ok:true});
      }
    }

    // Periods
    if(periodM){
      const did = periodM[1];
      const drows = await db.sql`SELECT animal_id FROM diets WHERE id=${did}`;
      if(!drows.length) return json({error:'Рацион не найден'},404);
      if(!await allowedAnimal(me,drows[0].animal_id)) return json({error:'Нет доступа'},403);
      if(req.method==='POST'){
        const b = await parse(req);
        const pid = id();
        await db.sql`INSERT INTO diet_periods(id,diet_id,animal_id,start_date,end_date) VALUES(${pid},${did},${drows[0].animal_id},${b.start_date},${b.end_date||null})`;
        return json({ok:true,id:pid},201);
      }
      if(req.method==='DELETE'){
        const b = await parse(req);
        await db.sql`DELETE FROM diet_periods WHERE id=${b.id} AND diet_id=${did}`;
        return json({ok:true});
      }
    }

    // Copy day (copy all meals of day_offset X to day_offset Y or range)
    if(copyM && req.method==='POST'){
      const did = copyM[1];
      const drows = await db.sql`SELECT animal_id FROM diets WHERE id=${did}`;
      if(!drows.length) return json({error:'Рацион не найден'},404);
      if(!await allowedAnimal(me,drows[0].animal_id)) return json({error:'Нет доступа'},403);
      const b = await parse(req);
      const fromDay = Number(b.from_day_offset||0);
      const targets = Array.isArray(b.to_day_offsets) ? b.to_day_offsets.map(Number) : [Number(b.to_day_offset||1)];
      const srcMeals = await db.sql`SELECT * FROM diet_meals WHERE diet_id=${did} AND day_offset=${fromDay} ORDER BY sort_order, time_of_day`;
      let created = 0;
      for(const target of targets){
        if(target === fromDay) continue;
        // remove existing meals on target day
        await db.sql`DELETE FROM diet_meals WHERE diet_id=${did} AND day_offset=${target}`;
        for(const m of srcMeals){
          const mid = id();
          await db.sql`INSERT INTO diet_meals(id,diet_id,day_offset,time_of_day,title,sort_order) VALUES(${mid},${did},${target},${m.time_of_day},${m.title},${m.sort_order})`;
          const prods = await db.sql`SELECT * FROM diet_meal_products WHERE meal_id=${m.id} ORDER BY sort_order`;
          for(const p of prods){
            await db.sql`INSERT INTO diet_meal_products(id,meal_id,name,quantity,calories,sort_order) VALUES(${id()},${mid},${p.name},${p.quantity},${p.calories},${p.sort_order})`;
          }
          created++;
        }
      }
      return json({ok:true, meals_copied: created});
    }

    // Active diet for animal on a date (for "Питание по рациону")
    if(activeM && req.method==='GET'){
      const q = new URL(req.url).searchParams;
      const aid = q.get('animal_id');
      const onDate = q.get('date') || new Date().toISOString().slice(0,10);
      if(!aid) return json({error:'animal_id required'},400);
      if(!await allowedAnimal(me,aid)) return json({error:'Нет доступа'},403);
      const periods = await db.sql`
        SELECT dp.*, d.name diet_name, d.id diet_id FROM diet_periods dp
        JOIN diets d ON d.id=dp.diet_id AND d.active=true
        WHERE dp.animal_id=${aid} AND dp.start_date<=${onDate} AND (dp.end_date IS NULL OR dp.end_date>=${onDate})
        ORDER BY dp.start_date DESC LIMIT 1`;
      if(!periods.length) return json({active:null, meals:[]});
      const dietId = periods[0].diet_id;
      // day_offset: for simplicity use day of period or 0 for template
      const meals = await db.sql`SELECT m.*,
        coalesce(json_agg(json_build_object('id',p.id,'name',p.name,'quantity',p.quantity,'calories',p.calories) ORDER BY p.sort_order) FILTER(WHERE p.id IS NOT NULL),'[]') products
        FROM diet_meals m LEFT JOIN diet_meal_products p ON p.meal_id=m.id
        WHERE m.diet_id=${dietId} AND m.day_offset=0
        GROUP BY m.id ORDER BY m.sort_order, m.time_of_day`;
      return json({active: periods[0], meals});
    }

    return json({error:'Неизвестный маршрут рационов'},404);
  }

    // --- Календарь: разовые запланированные события (training/medical/grooming) ---
  if(p==='schedule'){
    if(req.method==='GET'){
      const q=new URL(req.url).searchParams, aid=q.get('animal_id');
      if(aid && !(await allowedAnimal(me,aid)))return json({error:'Нет доступа к животному'},403);
      const rows=aid
        ? await db.sql`SELECT si.*,a.name animal_name,u.display_name author FROM scheduled_items si JOIN animals a ON a.id=si.animal_id JOIN users u ON u.id=si.author_id WHERE si.animal_id=${aid} ORDER BY si.scheduled_at ASC LIMIT 300`
        : me.role==='admin'
          ? await db.sql`SELECT si.*,a.name animal_name,u.display_name author FROM scheduled_items si JOIN animals a ON a.id=si.animal_id JOIN users u ON u.id=si.author_id ORDER BY si.scheduled_at ASC LIMIT 300`
          : await db.sql`SELECT si.*,a.name animal_name,u.display_name author FROM scheduled_items si JOIN animals a ON a.id=si.animal_id JOIN users u ON u.id=si.author_id LEFT JOIN animal_access aa ON aa.animal_id=a.id AND aa.user_id=${me.id} WHERE a.owner_id=${me.id} OR aa.user_id IS NOT NULL ORDER BY si.scheduled_at ASC LIMIT 300`;
      return json({schedule:rows});
    }
    if(req.method==='POST'){
      const b=await parse(req), aid=String(b.animal_id||'');
      if(!aid || !(await allowedAnimal(me,aid)))return json({error:'Нет доступа к животному'},403);
      const roles=['admin','owner','trainer','keeper','vet'];
      if(!roles.includes(me.effective_role))return json({error:'Недоступно для этой роли'},403);
      const type=String(b.type||'training');
      if(!['training','medical','grooming'].includes(type))return json({error:'Неизвестный тип события'},400);
      const scheduledAt=String(b.scheduled_at||''); if(!scheduledAt)return json({error:'Укажите дату и время'},400);
      const sid=id();
      await db.sql`INSERT INTO scheduled_items(id,animal_id,author_id,type,title,details,scheduled_at,duration_minutes,status) VALUES(${sid},${aid},${me.id},${type},${String(b.title||'').trim()},${String(b.details||'')},${scheduledAt},${Number(b.duration_minutes||0)},'planned')`;
      return json({ok:true,id:sid},201);
    }
    if(req.method==='PUT'){
      const b=await parse(req), sid=String(b.id||'');
      const row=await db.sql`SELECT id,animal_id,author_id FROM scheduled_items WHERE id=${sid}`; if(!row.length)return json({error:'Запланированное событие не найдено'},404);
      if(!(await allowedAnimal(me,row[0].animal_id)))return json({error:'Нет доступа к животному'},403);
      if(me.effective_role!=='admin' && row[0].author_id!==me.id)return json({error:'Изменять событие может только его автор или администратор'},403);
      const type=String(b.type||'training'); if(!['training','medical','grooming'].includes(type))return json({error:'Неизвестный тип события'},400);
      await db.sql`UPDATE scheduled_items SET type=${type},title=${String(b.title||'').trim()},details=${String(b.details||'')},scheduled_at=${String(b.scheduled_at||'')},duration_minutes=${Number(b.duration_minutes||0)},status=${String(b.status||'planned')},updated_at=now() WHERE id=${sid}`;
      return json({ok:true});
    }
    if(req.method==='DELETE'){
      const b=await parse(req), sid=String(b.id||''); const row=await db.sql`SELECT id,author_id FROM scheduled_items WHERE id=${sid}`; if(!row.length)return json({error:'Событие не найдено'},404);
      if(me.effective_role!=='admin' && row[0].author_id!==me.id)return json({error:'Удалять может только автор или администратор'},403);
      await db.sql`DELETE FROM scheduled_items WHERE id=${sid}`; return json({ok:true});
    }
  }
  // --- Напоминания: once|daily|weekly|every_n_days; complete сдвигает следующий срок ---
  if(p==='reminders'){
    if(req.method==='GET'){
      const q=new URL(req.url).searchParams, aid=q.get('animal_id'), upcoming=q.get('upcoming');
      if(aid && !(await allowedAnimal(me,aid))) return json({error:'Нет доступа к животному'},403);
      const base = aid
        ? await db.sql`SELECT r.*,a.name animal_name,u.display_name user_name FROM reminders r LEFT JOIN animals a ON a.id=r.animal_id JOIN users u ON u.id=r.user_id WHERE r.animal_id=${aid} AND (r.user_id=${me.id} OR ${me.role==='admin'}) ORDER BY r.remind_at ASC LIMIT 300`
        : me.role==='admin'
          ? await db.sql`SELECT r.*,a.name animal_name,u.display_name user_name FROM reminders r LEFT JOIN animals a ON a.id=r.animal_id JOIN users u ON u.id=r.user_id ORDER BY r.remind_at ASC LIMIT 300`
          : await db.sql`SELECT r.*,a.name animal_name,u.display_name user_name FROM reminders r LEFT JOIN animals a ON a.id=r.animal_id JOIN users u ON u.id=r.user_id LEFT JOIN animal_access aa ON aa.animal_id=a.id AND aa.user_id=${me.id} WHERE r.user_id=${me.id} OR a.owner_id=${me.id} OR aa.user_id IS NOT NULL ORDER BY r.remind_at ASC LIMIT 300`;
      const nowTs=Date.now(), due=[];
      for(const r of base){if(!r.enabled)continue; const start=new Date(r.remind_at).getTime(); if(!Number.isFinite(start))continue; let occ=null;
        if(r.repeat_type==='once'){if(start<=nowTs+60000 && !r.completed_at)occ=r.remind_at;}
        else if(nowTs>=start){const day=86400000; if(r.repeat_type==='daily')occ=new Date(start+Math.floor((nowTs-start)/day)*day).toISOString(); else if(r.repeat_type==='every_n_days'){const n=Math.max(1,Number(r.every_n_days||1));occ=new Date(start+Math.floor((nowTs-start)/(day*n))*day*n).toISOString();} else if(r.repeat_type==='weekly'){const d=new Date(start), n=Math.floor((nowTs-start)/day); const baseDay=d.getDay(), today=new Date(); const delta=(today.getDay()-baseDay+7)%7; const candidate=new Date(today.getFullYear(),today.getMonth(),today.getDate(),d.getHours(),d.getMinutes(),d.getSeconds(),d.getMilliseconds()); candidate.setDate(candidate.getDate()-delta); if(candidate.getTime()<=nowTs+60000)occ=candidate.toISOString();}}
        if(occ)due.push({...r,remind_at:occ,occurrence_of:r.id});
      }
      due.sort((a,b)=>new Date(a.remind_at)-new Date(b.remind_at));
      return json({reminders:base,due:due.slice(0,20)});
    }
    if(req.method==='POST'){
      const b=await parse(req), aid=b.animal_id?String(b.animal_id):null;
      if(aid && !(await allowedAnimal(me,aid))) return json({error:'Нет доступа к животному'},403);
      if(!String(b.title||'').trim() || !String(b.remind_at||'')) return json({error:'Укажите название и дату/время'},400);
      const uid=String(b.user_id||me.id);
      if(me.role!=='admin' && uid!==me.id) return json({error:'Нельзя назначить напоминание другому пользователю'},403);
      if(uid!==me.id){ const ok=await db.sql`SELECT id FROM users WHERE id=${uid}`; if(!ok.length)return json({error:'Пользователь не найден'},404); }
      const rid=id(), repeat=String(b.repeat_type||'once');
      if(!['once','daily','weekly','monthly','every_n_days'].includes(repeat)) return json({error:'Неверный тип повтора'},400);
      const every=repeat==='every_n_days'?Math.max(1,Number(b.every_n_days||1)):null;
      await db.sql`INSERT INTO reminders(id,animal_id,user_id,author_id,title,details,remind_at,repeat_type,repeat_days,every_n_days,enabled,source_type,source_id) VALUES(${rid},${aid},${uid},${me.id},${String(b.title).trim()},${String(b.details||'')},${String(b.remind_at)},${repeat},${String(b.repeat_days||'')},${every},${b.enabled!==false},${String(b.source_type||'')||null},${String(b.source_id||'')||null})`;
      return json({ok:true,id:rid},201);
    }
    if(req.method==='PUT'){
      const b=await parse(req), rid=String(b.id||''); const row=await db.sql`SELECT id,user_id,author_id,animal_id FROM reminders WHERE id=${rid}`; if(!row.length)return json({error:'Напоминание не найдено'},404);
      if(me.role!=='admin' && row[0].user_id!==me.id && row[0].author_id!==me.id)return json({error:'Нет доступа'},403);
      const repeat=String(b.repeat_type||'once'); if(!['once','daily','weekly','monthly','every_n_days'].includes(repeat)) return json({error:'Неверный тип повтора'},400); const every=repeat==='every_n_days'?Math.max(1,Number(b.every_n_days||1)):null;
      await db.sql`UPDATE reminders SET title=${String(b.title||'').trim()},details=${String(b.details||'')},remind_at=${String(b.remind_at||'')},repeat_type=${repeat},repeat_days=${String(b.repeat_days||'')},every_n_days=${every},enabled=${b.enabled!==false},updated_at=now() WHERE id=${rid}`;
      return json({ok:true});
    }
    if(req.method==='DELETE'){
      const b=await parse(req), rid=String(b.id||''); const row=await db.sql`SELECT id,user_id,author_id FROM reminders WHERE id=${rid}`; if(!row.length)return json({error:'Напоминание не найдено'},404);
      if(me.role!=='admin' && row[0].user_id!==me.id && row[0].author_id!==me.id)return json({error:'Нет доступа'},403);
      await db.sql`DELETE FROM reminders WHERE id=${rid}`; return json({ok:true});
    }
  }
    if(p.match(/^reminders\/[^/]+\/complete$/) && req.method==='POST'){
    const rid=p.split('/')[1];
    const row=await db.sql`SELECT * FROM reminders WHERE id=${rid}`;
    if(!row.length)return json({error:'Напоминание не найдено'},404);
    if(me.role!=='admin' && row[0].user_id!==me.id && row[0].author_id!==me.id)return json({error:'Нет доступа'},403);
    if(row[0].repeat_type==='once'){
      await db.sql`UPDATE reminders SET enabled=false,completed_at=now(),updated_at=now() WHERE id=${rid}`;
      return json({ok:true,disabled:true});
    }
    const current=new Date(row[0].remind_at);
    let next=nextReminderOccurrence(current,row[0].repeat_type,Number(row[0].every_n_days||1));
    const now=Date.now();
    while(next.getTime()<=now && row[0].repeat_type!=='once'){
      const n=nextReminderOccurrence(next,row[0].repeat_type,Number(row[0].every_n_days||1));
      if(n.getTime()<=next.getTime())break;
      next=n;
    }
    await db.sql`UPDATE reminders SET remind_at=${next.toISOString()},completed_at=now(),updated_at=now(),enabled=true WHERE id=${rid}`;
    return json({ok:true,next:next.toISOString()});
  }

  const homeworkCompleteMatch=p.match(/^homework\/([^/]+)\/complete$/);
  if(homeworkCompleteMatch && req.method==='POST'){
    const hid=homeworkCompleteMatch[1];
    const rows=await db.sql`SELECT id,animal_id,status FROM homework WHERE id=${hid}`;
    if(!rows.length)return json({error:'Домашнее задание не найдено'},404);
    if(!(await allowedAnimal(me,rows[0].animal_id)))return json({error:'Нет доступа'},403);
    await db.sql`UPDATE homework SET status='done',updated_at=now() WHERE id=${hid}`;
    return json({ok:true,status:'done'});
  }
if(p==='analytics'){
    const r=me.role==='admin' ? await db.sql`SELECT ending_type,count(*)::int count,round(avg(success_score),1)::float avg_success FROM sessions GROUP BY ending_type ORDER BY ending_type` : await db.sql`SELECT s.ending_type,count(*)::int count,round(avg(s.success_score),1)::float avg_success FROM sessions s JOIN animals a ON a.id=s.animal_id LEFT JOIN animal_access aa ON aa.animal_id=a.id AND aa.user_id=${me.id} WHERE a.owner_id=${me.id} OR aa.user_id IS NOT NULL GROUP BY s.ending_type ORDER BY s.ending_type`;
    const sessions=me.role==='admin' ? await db.sql`SELECT s.*,a.name animal_name,u.display_name author FROM sessions s JOIN animals a ON a.id=s.animal_id JOIN users u ON u.id=s.trainer_id ORDER BY s.started_at DESC LIMIT 100` : await db.sql`SELECT s.*,a.name animal_name,u.display_name author FROM sessions s JOIN animals a ON a.id=s.animal_id JOIN users u ON u.id=s.trainer_id LEFT JOIN animal_access aa ON aa.animal_id=a.id AND aa.user_id=${me.id} WHERE a.owner_id=${me.id} OR aa.user_id IS NOT NULL ORDER BY s.started_at DESC LIMIT 100`;
    return json({completion:r,sessions});
  }

  return json({error:'Не найдено'},404);
  } catch (e) {
    console.error('MOSTIK API error', e);
    return json({error:'DATABASE_ERROR', message:String(e?.message || e)},502);
  }
};
export const config={path:'/api/*'};
