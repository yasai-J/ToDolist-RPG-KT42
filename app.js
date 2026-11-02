/* RETRO LIFE QUEST - local-first offline PWA */
const DB_NAME = "retro-life-quest";
const DB_VERSION = 1;
const STORE = "app";
const STATE_KEY = "main";
const $ = (id) => document.getElementById(id);
const pad = n => String(n).padStart(2,"0");
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fromKey = key => { const [y,m,d]=key.split("-").map(Number); return new Date(y,m-1,d,12); };
const addDays = (key,n) => { const d=fromKey(key); d.setDate(d.getDate()+n); return dateKey(d); };
const diffDays = (a,b) => Math.round((fromKey(a)-fromKey(b))/86400000);
const escapeHtml = s => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const defaultState = () => ({
  version:1,
  tasks:[
    {id:uid(),name:"朝の準備をする",type:"DAILY",exp:10,repeat:"daily",created:dateKey(),active:true},
    {id:uid(),name:"今日の業務を確認する",type:"DAILY",exp:20,repeat:"weekdays",created:dateKey(),active:true},
    {id:uid(),name:"研究データの整理",type:"DEADLINE",exp:40,due:addDays(dateKey(),5),created:dateKey(),active:true},
    {id:uid(),name:"いつか行ってみたい街を旅する",type:"WONDER",exp:20,created:dateKey(),active:true}
  ],
  completions:{},
  events:[],
  player:{xp:0,level:1,gems:0,potions:0,keys:0,notes:0,cleared:0},
  settings:{theme:"auto",nightTime:"18:00",dayTime:"07:00",leadDays:3}
});
function uid(){return (crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`)}
let state;
let currentPeriod="week";

function openDB(){
 return new Promise((resolve,reject)=>{
  if(!("indexedDB" in window)){resolve(null);return;}
  const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
let db;
async function loadState(){
 try{
  db=await openDB();
  if(db){
   const value=await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readonly");const req=tx.objectStore(STORE).get(STATE_KEY);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
   });
   if(value)return normalize(value);
  }
 }catch(e){console.warn("IndexedDB unavailable; using localStorage",e);}
 try{const raw=localStorage.getItem(DB_NAME);if(raw)return normalize(JSON.parse(raw));}catch(e){}
 return defaultState();
}
function normalize(s){
 const d=defaultState();
 return {...d,...s,player:{...d.player,...(s.player||{})},settings:{...d.settings,...(s.settings||{})},
  tasks:Array.isArray(s.tasks)?s.tasks:d.tasks,completions:s.completions||{},events:Array.isArray(s.events)?s.events:[]};
}
async function saveState(){
 try{
  if(db){
   await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(state,STATE_KEY);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
   });
  }else localStorage.setItem(DB_NAME,JSON.stringify(state));
 }catch(e){console.error(e);toast("保存できませんでした。空き容量を確認してください。");}
}
function toast(message){
 const el=$("toast");el.textContent=message;el.classList.add("show");
 clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2100);
}
function showModal(title,body){
 $("modalContent").innerHTML=`<h2>${title}</h2><p>${body}</p>`;$("modal").classList.remove("hidden");
}
function closeModal(){$("modal").classList.add("hidden");}
$("modalClose").addEventListener("click",closeModal);
$("modal").addEventListener("click",e=>{if(e.target===$("modal"))closeModal()});

function levelFor(xp){return Math.floor(xp/100)+1;}
function isScheduled(task,key){
 const day=fromKey(key).getDay();
 if(task.repeat==="weekdays")return day>=1&&day<=5;
 if(task.repeat==="weekends")return day===0||day===6;
 return true;
}
function isDone(taskId,key){return !!state.completions[`${taskId}@${key}`];}
function completionKey(taskId,key){return `${taskId}@${key}`;}
function deadlineVisible(t,today=dateKey()){
 if(!t.active||t.type!=="DEADLINE"||!t.due)return false;
 return t.due<=addDays(today,Number(state.settings.leadDays||3));
}
function getTodayTasks(){
 const today=dateKey();
 const daily=state.tasks.filter(t=>t.active&&t.type==="DAILY"&&isScheduled(t,today));
 const deadline=state.tasks.filter(t=>deadlineVisible(t,today)&&!t.archived);
 return {daily,deadline};
}
function taskDoneToday(t){return isDone(t.id,dateKey());}
function renderTask(t,{showDue=false,showCheck=true}={}){
 const done=showCheck?taskDoneToday(t):false;
 let due="", badge="";
 if(showDue&&t.due){
  const n=diffDays(t.due,dateKey());
  const dueLabel=n<0?`${Math.abs(n)}日超過`:n===0?"今日":`あと${n}日`;
  due=`期限 ${t.due}（${dueLabel}）`;
  const badgeClass=(n<=0)?"urgent":(n<=3?"soon":"later");
  badge=`<span class="badge ${badgeClass}">${dueLabel}</span>`;
 }
 const check=showCheck?`<button class="check-btn" data-complete="${t.id}" aria-label="完了">${done?"✓":""}</button>`:"";
 const remove=showCheck?"":`<button class="icon-btn" data-delete="${t.id}" aria-label="削除">×</button>`;
 return `<div class="task-row ${done?"done":""}">${check}<div class="task-info"><div class="task-name">${escapeHtml(t.name)}</div><div class="task-meta">${t.type} · ${t.exp} EXP ${due?`· ${escapeHtml(due)}`:""}</div></div>${badge}${remove}</div>`;
}
function bindTaskButtons(){
 document.querySelectorAll("[data-complete]").forEach(b=>b.addEventListener("click",()=>completeTask(b.dataset.complete)));
 document.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteTask(b.dataset.delete)));
}
function renderToday(){
 const {daily,deadline}=getTodayTasks();
 $("todayDaily").innerHTML=daily.length?daily.map(t=>renderTask(t)).join(""):`<div class="empty-note">DAILY QUESTはありません。</div>`;
 $("todayDeadline").innerHTML=deadline.length?deadline.map(t=>renderTask(t,{showDue:true})).join(""):`<div class="empty-note">期限が近いクエストはありません。</div>`;
 const all=[...daily,...deadline],done=all.filter(taskDoneToday).length,exp=all.filter(taskDoneToday).reduce((n,t)=>n+t.exp,0);
 const pct=all.length?Math.round(done/all.length*100):0;
 $("todayPercent").textContent=pct+"%";$("todayBar").style.width=pct+"%";
 $("todayCount").textContent=`${done} / ${all.length} CLEAR`;$("todayExp").textContent=`+${exp} EXP`;
 $("todayEmpty").classList.toggle("hidden",all.length>0);
 $("stageClear").classList.toggle("hidden",all.length===0||done!==all.length);
 $("todayDate").textContent=new Date().toLocaleDateString("ja-JP",{month:"numeric",day:"numeric",weekday:"short"});
 bindTaskButtons();
}
function renderPlanner(){
 const deadlines=state.tasks.filter(t=>t.active&&t.type==="DEADLINE").sort((a,b)=>(a.due||"").localeCompare(b.due||""));
 const dailies=state.tasks.filter(t=>t.active&&t.type==="DAILY");
 $("deadlineList").innerHTML=deadlines.length?deadlines.map(t=>renderTask(t,{showCheck:false,showDue:true})).join(""):`<div class="empty-note">期限付きタスクはありません。</div>`;
 $("dailyList").innerHTML=dailies.length?dailies.map(t=>renderTask(t,{showCheck:false})).join(""):`<div class="empty-note">DAILY QUESTはありません。</div>`;
 bindTaskButtons();
}
function renderWonder(){
 const wonders=state.tasks.filter(t=>t.active&&t.type==="WONDER");
 $("wonderList").innerHTML=wonders.length?wonders.map(t=>renderTask(t,{showCheck:false})).join(""):`<div class="empty-note">まだWONDERはありません。<br>いつかやりたいことを登録してみよう。</div>`;
 bindTaskButtons();
}
function deleteTask(id){
 if(!confirm("このタスクを一覧から削除しますか？"))return;
 const t=state.tasks.find(x=>x.id===id);if(t)t.active=false;
 saveState();renderAll();toast("タスクをしまいました。");
}
function completeTask(id){
 const t=state.tasks.find(x=>x.id===id);if(!t)return;
 const key=completionKey(t.id,dateKey());if(state.completions[key])return;
 state.completions[key]={at:new Date().toISOString(),exp:t.exp,type:t.type};
 const oldLevel=levelFor(state.player.xp);
 state.player.xp+=Number(t.exp||10);state.player.cleared++;
 let reward="";
 if(Math.random()<.35){state.player.gems++;reward=" 💎 GEM GET!"}
 const newLevel=levelFor(state.player.xp);state.player.level=newLevel;
 if(newLevel>oldLevel){state.player.potions++;showModal("★ LEVEL UP! ★",`LEVEL ${newLevel} にアップ！<br>HERB POTIONを獲得しました。`);}
 else toast(`QUEST CLEAR! +${t.exp} EXP${reward}`);
 state.events.unshift({at:new Date().toISOString(),task:t.name,exp:t.exp,type:t.type});
 saveState();renderAll();
}
function periodRange(mode){
 const today=fromKey(dateKey());
 if(mode==="week"){
  const start=new Date(today);const monday=(start.getDay()+6)%7;start.setDate(start.getDate()-monday);
  const end=new Date(start);end.setDate(end.getDate()+6);
  return {start:dateKey(start),end:dateKey(end),days:Array.from({length:7},(_,i)=>dateKey(new Date(start.getFullYear(),start.getMonth(),start.getDate()+i)))};
 }
 const start=new Date(today.getFullYear(),today.getMonth(),1);
 const end=new Date(today.getFullYear(),today.getMonth()+1,0);
 return {start:dateKey(start),end:dateKey(end),days:Array.from({length:end.getDate()},(_,i)=>dateKey(new Date(start.getFullYear(),start.getMonth(),i+1)))};
}
function countScheduledDaily(t,key){return t.active&&t.type==="DAILY"&&isScheduled(t,key);}
function renderChronicle(){
 const range=periodRange(currentPeriod);
 const daily=state.tasks.filter(t=>t.type==="DAILY"&&t.active);
 const deadlines=state.tasks.filter(t=>t.type==="DEADLINE"&&t.active&&t.due>=range.start&&t.due<=range.end);
 let total=0,done=0,exp=0,cleared=0;
 const values=range.days.map(day=>{
  const dCount=daily.filter(t=>countScheduledDaily(t,day)).length;
  const dDone=daily.filter(t=>countScheduledDaily(t,day)&&isDone(t.id,day)).length;
  const dueTasks=deadlines.filter(t=>t.due===day);
  const dueDone=dueTasks.filter(t=>isDone(t.id,day)).length;
  const planned=dCount+dueTasks.length,completed=dDone+dueDone;
  total+=planned;done+=completed;
  exp+=daily.filter(t=>countScheduledDaily(t,day)&&isDone(t.id,day)).reduce((n,t)=>n+t.exp,0);
  exp+=dueTasks.filter(t=>isDone(t.id,day)).reduce((n,t)=>n+t.exp,0);
  cleared+=completed;
  return {day,planned,completed,pct:planned?Math.round(completed/planned*100):0};
 });
 const pct=total?Math.round(done/total*100):0;
 $("periodTitle").textContent=currentPeriod==="week"?"THIS WEEK'S PROGRESS":"THIS MONTH'S PROGRESS";
 $("periodPercent").textContent=pct+"%";$("periodBar").style.width=pct+"%";
 $("periodCount").textContent=`${done} / ${total} CLEAR`;$("periodExp").textContent=`+${exp} EXP`;
 $("periodClear").textContent=cleared;$("periodTotalExp").textContent=exp;
 const show= currentPeriod==="week"?values:values.filter((v,i)=>i%3===0||i===values.length-1);
 $("periodChart").innerHTML=show.map(v=>`<div class="chart-col"><span class="chart-value">${v.planned?v.pct+"%":"—"}</span><div class="chart-track"><div class="chart-fill" style="height:${v.pct}%"></div></div><span class="chart-label">${fromKey(v.day).getDate()}</span></div>`).join("");
}
function renderPlayer(){
 const p=state.player;p.level=levelFor(p.xp);
 $("levelValue").textContent=p.level;$("xpValue").textContent=p.xp;$("gemTotal").textContent=p.gems;
 $("xpProgressLabel").textContent=`${p.xp%100} / 100`;$("xpBar").style.width=(p.xp%100)+"%";
 $("playerLevel").textContent=`LEVEL ${p.level}`;$("playerExp").textContent=p.xp;$("playerClear").textContent=p.cleared;
 $("playerGems").textContent=p.gems;$("playerLevelNum").textContent=p.level;
 $("playerMessage").textContent=p.level>=10?"立派な冒険者になってきた！":p.level>=5?"冒険の経験が積み重なっている！":"冒険は始まったばかり！";
 $("itemGems").textContent=p.gems;$("itemPotions").textContent=p.potions;$("itemKeys").textContent=p.keys;$("itemNotes").textContent=p.notes;
}
function renderAll(){renderToday();renderPlanner();renderWonder();renderChronicle();renderPlayer();applyTheme();}

function setView(name){
 document.querySelectorAll(".view").forEach(v=>v.classList.toggle("hidden",v.id!==`view-${name}`));
 document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
 window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
$("settingsOpen").addEventListener("click",()=>setView("settings"));

$("taskType").addEventListener("change",()=>{
 const type=$("taskType").value;
 $("dueWrap").classList.toggle("hidden",type!=="DEADLINE");
 $("repeatWrap").classList.toggle("hidden",type!=="DAILY");
 $("taskDue").required=type==="DEADLINE";
});
$("taskForm").addEventListener("submit",e=>{
 e.preventDefault();
 const type=$("taskType").value,name=$("taskName").value.trim();
 if(!name)return;
 if(type==="DEADLINE"&&!$("taskDue").value){toast("期限日を設定してください");return;}
 const t={id:uid(),name,type,exp:Number($("taskDifficulty").value),created:dateKey(),active:true};
 if(type==="DAILY")t.repeat=$("taskRepeat").value;
 if(type==="DEADLINE")t.due=$("taskDue").value;
 state.tasks.push(t);$("taskName").value="";$("taskDue").value="";
 saveState();renderAll();toast("NEW QUEST ADDED!");
});
document.querySelectorAll(".period-btn").forEach(b=>b.addEventListener("click",()=>{
 currentPeriod=b.dataset.period;document.querySelectorAll(".period-btn").forEach(x=>x.classList.toggle("active",x===b));renderChronicle();
}));

function applyTheme(){
 const s=state.settings,now=new Date(),mins=now.getHours()*60+now.getMinutes();
 const toMins=v=>{const [h,m]=v.split(":").map(Number);return h*60+m;};
 let night=s.theme==="night";
 if(s.theme==="auto"){
  const n=toMins(s.nightTime||"18:00"),d=toMins(s.dayTime||"07:00");
  night=n>d?(mins>=n||mins<d):(mins>=n&&mins<d);
 }
 document.body.classList.toggle("night",night);
 $("celestial").textContent=night?"☾":"☀";
}
function loadSettingsUI(){
 const s=state.settings;
 document.querySelectorAll(".theme-btn").forEach(b=>b.classList.toggle("active",b.dataset.theme===s.theme));
 $("nightTime").value=s.nightTime||"18:00";$("dayTime").value=s.dayTime||"07:00";$("leadDays").value=String(s.leadDays||3);
}
document.querySelectorAll(".theme-btn").forEach(b=>b.addEventListener("click",()=>{
 state.settings.theme=b.dataset.theme;document.querySelectorAll(".theme-btn").forEach(x=>x.classList.toggle("active",x===b));applyTheme();saveState();
}));
$("saveSettings").addEventListener("click",()=>{
 state.settings.nightTime=$("nightTime").value||"18:00";state.settings.dayTime=$("dayTime").value||"07:00";state.settings.leadDays=Number($("leadDays").value);
 saveState();renderAll();toast("SETTINGS SAVED!");
});

$("exportBtn").addEventListener("click",()=>{
 const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`retro-life-quest-${dateKey()}.json`;a.click();URL.revokeObjectURL(url);toast("BACKUP CREATED!");
});
$("importFile").addEventListener("change",async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  const parsed=JSON.parse(await file.text());
  if(!parsed||!Array.isArray(parsed.tasks)||!parsed.player)throw new Error("invalid");
  if(!confirm("現在のデータをバックアップファイルの内容で置き換えますか？"))return;
  state=normalize(parsed);await saveState();renderAll();loadSettingsUI();toast("DATA RESTORED!");
 }catch(err){alert("JSONファイルを読み込めませんでした。正しいバックアップファイルを選択してください。");}
 e.target.value="";
});
$("resetData").addEventListener("click",async()=>{
 if(!confirm("すべてのタスク・記録・育成データを削除します。この操作は元に戻せません。"))return;
 state=defaultState();await saveState();renderAll();loadSettingsUI();toast("NEW ADVENTURE START!");
});

async function init(){
 state=await loadState();
 renderAll();loadSettingsUI();
 if("serviceWorker" in navigator && location.protocol!=="file:"){
  navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("SW registration failed",e));
 }
 // Re-evaluate time-based theme and deadline list when the page becomes active.
 document.addEventListener("visibilitychange",()=>{if(!document.hidden){applyTheme();renderToday();renderChronicle();}});
}
init();
