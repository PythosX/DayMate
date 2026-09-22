let DATA={tasks:[],important:[],tell_later:[],inbox:[]};
const $=id=>document.getElementById(id);
const api=async(url,opt={})=>{const r=await fetch(url,{headers:{"Content-Type":"application/json"},...opt});if(!r.ok)throw new Error(await r.text());return r.json()};
const today=()=>new Date().toISOString().slice(0,10);
const fmt=x=>{if(!x)return "No date set";let d=new Date(x+"T00:00:00");return d.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})};

async function refresh(){DATA=await api("/api/data");renderAll()}
function renderAll(){
  $("dateLabel").textContent=new Date().toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"});
  const todayTasks=DATA.tasks.filter(x=>x.date===today()&&!x.done);
  const todayImportant=DATA.important.filter(x=>x.date===today());

  $("todayCount").textContent=todayTasks.length;
  $("importantCount").textContent=todayImportant.length;

  $("tasksList").innerHTML=DATA.tasks.map(taskHTML).join("")||empty("No tasks yet.");
  $("importantList").innerHTML=DATA.important.map(importantHTML).join("")||empty("Nothing important saved.");
  $("tellList").innerHTML=DATA.tell_later.map(tellHTML).join("")||empty("No Tell Later notes.");
  $("inboxList").innerHTML=DATA.inbox.map(inboxHTML).join("")||empty("Inbox is clear.");

  // Home shows ONLY items scheduled for today's date.
  // Future tasks and future important dates remain in their own tabs.
  const home=[
    ...todayTasks,
    ...todayImportant
  ];

  $("homeItems").innerHTML=home.map(x=>
    todayImportant.includes(x) ? importantHTML(x) : taskHTML(x)
  ).join("")||empty("Nothing scheduled for today. Your mind is clear.");
}
function empty(t){return `<div class="item"><p>${t}</p></div>`}
function taskHTML(x){return `<div class="item ${x.done?"done":""}"><div class="item-head"><div><h3>${esc(x.title)}</h3><p>${esc(x.description||"")}</p></div><button class="small-btn" onclick="toggleTask('${x.id}')">${x.done?"↩":"✓"}</button></div><div class="meta">${fmt(x.date)} ${x.time?("· "+x.time):""} · ${esc(x.category||"general")} <button class="small-btn" onclick="delTask('${x.id}')">Delete</button></div></div>`}
function importantHTML(x){return `<div class="item"><div class="item-head"><div><h3>🔔 ${esc(x.title)}</h3><p>${esc(x.description||"")}</p></div><span class="tag">${esc(x.priority||"medium")}</span></div><div class="meta">${fmt(x.date)} ${x.time?("· "+x.time):""} · ${esc(x.type||"important")} <button class="small-btn" onclick="delImportant('${x.id}')">Delete</button></div></div>`}
function tellHTML(x){return `<div class="item ${x.done?"done":""}"><div class="item-head"><div><h3>🗣️ Tell ${esc(x.person||"someone")}</h3><p>${esc(x.message)}</p></div><button class="small-btn" onclick="toggleTell('${x.id}')">${x.done?"↩":"✓"}</button></div><div class="meta">${fmt(x.date)} ${x.time?("· "+x.time):""} <button class="small-btn" onclick="delTell('${x.id}')">Delete</button></div></div>`}
function inboxHTML(x){return `<div class="item"><p>${esc(x.content)}</p><div class="meta"><button class="small-btn" onclick="delInbox('${x.id}')">Delete</button></div></div>`}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

async function toggleTask(id){await api("/api/tasks/"+id,{method:"PATCH"});refresh()}
async function delTask(id){await api("/api/tasks/"+id,{method:"DELETE"});refresh()}
async function delImportant(id){await api("/api/important/"+id,{method:"DELETE"});refresh()}
async function toggleTell(id){await api("/api/tell-later/"+id,{method:"PATCH"});refresh()}
async function delTell(id){await api("/api/tell-later/"+id,{method:"DELETE"});refresh()}
async function delInbox(id){await api("/api/inbox/"+id,{method:"DELETE"});refresh()}

function showPage(id){document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));$(id).classList.remove("hidden");document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===id));}
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>showPage(b.dataset.page));

$("loginForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/login",{method:"POST",body:JSON.stringify({username:$("username").value,password:$("password").value})});sessionStorage.setItem("daymate","1");$("login").classList.add("hidden");$("app").classList.remove("hidden");refresh()}catch{$("loginError").textContent="Invalid username or password."}};
if(sessionStorage.getItem("daymate")){$("login").classList.add("hidden");$("app").classList.remove("hidden");refresh()}

function tick(){let d=new Date();$("clock").textContent=d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});$("greeting").textContent=d.getHours()<12?"Good morning":d.getHours()<18?"Good afternoon":"Good evening"}setInterval(tick,1000);tick();

$("talkBtn").onclick=()=>openVoice();
$("noteBtn").onclick=()=>openManual("tell");
$("quickBtn").onclick=()=>openManual("inbox");

function openVoice(){
  $("modalBody").innerHTML=`<h2>Talk to DayMate</h2><div id="orb" class="voice-orb">🎙️</div><div id="voiceStatus" class="muted" style="text-align:center">Tap the microphone and speak naturally.</div><div id="transcript" class="transcript">Your words will appear here.</div><div id="voiceResult"></div><button class="primary" style="width:100%;margin-top:14px" id="startVoice">Start listening</button>`;
  $("modal").classList.remove("hidden");
  $("startVoice").onclick=startVoice;
}
function startVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){$("voiceStatus").textContent="Speech recognition is not supported here. Use the text option below.";return}
  const r=new SR();r.lang="en-IN";r.interimResults=true;r.continuous=false;
  $("orb").classList.add("listening");$("voiceStatus").textContent="Listening…";
  r.onresult=e=>{let final="";for(const z of e.results)final+=z[0].transcript;$("transcript").textContent=final;if(e.results[e.results.length-1].isFinal)processVoice(final)};
  r.onerror=()=>{$("voiceStatus").textContent="Could not hear that. Try again."};
  r.onend=()=>{$("orb").classList.remove("listening")};r.start();
}
async function processVoice(text){
  $("voiceStatus").textContent="DayMate is thinking…";
  const r=await api("/api/voice/parse",{method:"POST",body:JSON.stringify({transcript:text})});
  if(r.type==="clarification"){
    $("voiceResult").innerHTML=`<div class="item" style="margin-top:12px"><b>I need one detail.</b><p>${esc(r.question)}</p><button class="primary" style="margin-top:10px;width:100%" onclick="closeModal()">Continue</button></div>`;
    speak(r.question||"I need one more detail.");
    return;
  }
  $("voiceResult").innerHTML=`<div class="item" style="margin-top:12px"><span class="tag">${esc(r.type)}</span><h3>${esc(r.title)}</h3><p>${esc(r.description)}</p><div class="meta">${r.person?"Tell "+esc(r.person)+" · ":""}${fmt(r.date)} ${r.time?"· "+r.time:""}</div><button class="primary" style="margin-top:12px;width:100%" onclick='saveAI(${JSON.stringify(r).replace(/'/g,"&#39;")})'>Save this</button></div>`;
  $("voiceStatus").textContent="I understood this:";
}
async function saveAI(r){
  if(r.type==="task")await api("/api/tasks",{method:"POST",body:JSON.stringify({title:r.title,description:r.description,date:r.date,time:r.time,priority:r.priority,category:r.category})});
  else if(r.type==="important")await api("/api/important",{method:"POST",body:JSON.stringify({title:r.title,description:r.description,date:r.date,time:r.time,type:r.category,priority:r.priority})});
  else await api("/api/tell-later",{method:"POST",body:JSON.stringify({person:r.person,message:r.description||r.title,date:r.date,time:r.time,priority:r.priority})});
  speak("Done. I've saved that.");
  closeModal();refresh();
}

function openManual(type){
  const title=type==="task"?"Add Task":type==="important"?"Add Important Date":type==="tell"?"Tell Someone Later":"Quick Note";
  let body=`<h2>${title}</h2><form class="form" id="manualForm">`;
  if(type==="tell")body+=`<label>Person</label><input id="mPerson" placeholder="Who do you need to tell?"><label>What should I remember?</label><input id="mMessage" placeholder="What do you want to tell them?">`;
  else if(type==="inbox")body+=`<label>Note</label><input id="mContent" placeholder="Write anything...">`;
  else body+=`<label>Title</label><input id="mTitle" required placeholder="What is it?"><label>Details</label><input id="mDesc" placeholder="Optional details"><label>Date</label><input id="mDate" type="date"><label>Time</label><input id="mTime" type="time">`;
  body+=`<button class="primary" type="submit">Save</button></form>`;$("modalBody").innerHTML=body;$("modal").classList.remove("hidden");
  $("manualForm").onsubmit=async e=>{e.preventDefault();
    if(type==="task")await api("/api/tasks",{method:"POST",body:JSON.stringify({title:$("mTitle").value,description:$("mDesc").value,date:$("mDate").value,time:$("mTime").value,priority:"medium",category:"general"})});
    if(type==="important")await api("/api/important",{method:"POST",body:JSON.stringify({title:$("mTitle").value,description:$("mDesc").value,date:$("mDate").value,time:$("mTime").value,type:"important",priority:"medium"})});
    if(type==="tell")await api("/api/tell-later",{method:"POST",body:JSON.stringify({person:$("mPerson").value,message:$("mMessage").value,date:"",time:"",priority:"medium"})});
    if(type==="inbox")await api("/api/inbox",{method:"POST",body:JSON.stringify({content:$("mContent").value})});
    closeModal();refresh();
  };
}
function closeModal(){$("modal").classList.add("hidden")}
function speak(t){if("speechSynthesis"in window){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(t))}}

$("notifyBtn").onclick=async()=>{if(!("Notification"in window)){alert("Notifications are not supported.");return}let p=await Notification.requestPermission();if(p==="granted")new Notification("DayMate notifications enabled",{body:"DayMate can notify you while this app is open."})};
setInterval(()=>{if(Notification.permission!=="granted")return;const now=new Date();const hm=now.toTimeString().slice(0,5);DATA.tasks.filter(x=>x.date===today()&&x.time===hm&&!x.done).forEach(x=>new Notification("DayMate — Task", {body:x.title}));DATA.tell_later.filter(x=>x.date===today()&&x.time===hm&&!x.done).forEach(x=>new Notification("DayMate — Tell Later",{body:`Tell ${x.person}: ${x.message}`}));},30000);
