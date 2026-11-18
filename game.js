// CHAOS RUSH v0.3 — carrera arcade sincronizada con Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAIT61OFGPePtKPD3Z3Aeimks-ttBOd7C4",
  authDomain: "chaos-rush-542cb.firebaseapp.com",
  databaseURL: "https://chaos-rush-542cb-default-rtdb.firebaseio.com",
  projectId: "chaos-rush-542cb",
  storageBucket: "chaos-rush-542cb.firebasestorage.app",
  messagingSenderId: "946275795083",
  appId: "1:946275795083:web:92ffbc91c9493485e0548e",
  measurementId: "G-J0KWV5PDZW"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const $ = id => document.getElementById(id);
const screens = ["setupScreen","lobbyScreen","raceScreen","controllerScreen","finishScreen"];
const COLORS = ["#ff4658","#39c5ff","#ffd447","#8b6cff","#55e69b","#ff8c42","#f56bd8","#e6edf7","#b7ed42","#ff6b6b","#55d6be","#bd93f9","#f1a7a1","#7aa2ff","#e7c46a","#a8dadc"];
let uid=null, roomCode=null, roomRef=null, roomData=null, isHost=false, myName="", myColor=COLORS[0];
let players={}, controls={}, stateListener=null, playerListener=null, controlsListener=null, raceListener=null;
let gameRunning=false, lastFrame=0, lastStatePush=0, countdownActive=false, raceState=null;
let joystick={x:0,y:0}, pressed={gas:false,brake:false,nitro:false}, controlWriteTimer=null;
const TRACK={cx:600,cy:380,rx:430,ry:270,thickness:90};
const TRACK_LENGTH=2*(2*(TRACK.rx-TRACK.ry)+Math.PI*TRACK.ry); // rounded-rectangle approximation
const TOTAL_LAPS=3;

function show(id){screens.forEach(s=>$(s).classList.toggle("hidden",s!==id));}
function setError(msg){$("setupError").textContent=msg||"";}
function safeName(v){return (v||"PILOTO").trim().replace(/[.#$\[\]/]/g,"").slice(0,14)||"PILOTO";}
function randomCode(){return Math.random().toString(36).slice(2,8).toUpperCase();}
function roomUrl(){return `${location.origin}${location.pathname}?room=${roomCode}`;}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

async function boot(){
  try{
    const cred=await auth.signInAnonymously();
    uid=cred.user.uid;
    const urlCode=new URLSearchParams(location.search).get("room");
    if(urlCode){$("roomInput").value=urlCode.toUpperCase();}
  }catch(e){setError("No se pudo conectar con Firebase: "+e.message);}
}
$("createBtn").onclick=async()=>{
  setError("");
  if(!uid)return setError("Conectando… espera un segundo.");
  myName=safeName($("hostName").value); isHost=true;
  try{
    let code=randomCode(), ref=db.ref("rooms/"+code);
    let snap=await ref.once("value");
    while(snap.exists()){code=randomCode();ref=db.ref("rooms/"+code);snap=await ref.once("value");}
    roomCode=code;roomRef=ref;myColor=COLORS[0];
    await ref.set({hostUid:uid,createdAt:firebase.database.ServerValue.TIMESTAMP,status:"lobby",maxPlayers:16,totalLaps:TOTAL_LAPS,players:{[uid]:{name:myName,color:myColor,ready:true,joinedAt:firebase.database.ServerValue.TIMESTAMP}}});
    await enterRoom();
  }catch(e){setError("No se pudo crear la sala: "+e.message);}
};
$("joinBtn").onclick=async()=>{
  setError("");
  if(!uid)return setError("Conectando… espera un segundo.");
  roomCode=$("roomInput").value.trim().toUpperCase();
  myName=safeName($("joinName").value);
  if(roomCode.length!==6)return setError("El código debe tener 6 caracteres.");
  roomRef=db.ref("rooms/"+roomCode);isHost=false;
  try{
    const snap=await roomRef.once("value");
    if(!snap.exists())return setError("No encontramos esa sala. Revisa el código.");
    const data=snap.val();
    if(data.status!=="lobby")return setError("La carrera ya comenzó.");
    if(Object.keys(data.players||{}).length>=16)return setError("La sala está llena.");
    const used=Object.keys(data.players||{}).length;
    myColor=COLORS[used%COLORS.length];
    await roomRef.child("players/"+uid).set({name:myName,color:myColor,ready:false,joinedAt:firebase.database.ServerValue.TIMESTAMP});
    await enterRoom();
  }catch(e){setError("No se pudo entrar: "+e.message);}
};

async function enterRoom(){
  history.replaceState({}, "", roomUrl());
  $("roomCodeLabel").textContent=roomCode;$("shareCode").textContent=roomCode;
  $("controllerRoom").textContent=roomCode;$("raceRoom").textContent="SALA "+roomCode;
  $("hostActions").classList.toggle("hidden",!isHost);
  $("controllerActions").classList.toggle("hidden",isHost);
  $("lobbyHint").textContent=isHost?"Comparte el código o el link. Los pilotos entran desde sus celulares.":"Ya estás en la parrilla. Marca que estás listo.";
  show("lobbyScreen");
  roomRef.child("players").on("value",snap=>{players=snap.val()||{};renderPlayers();});
  roomRef.child("status").on("value",snap=>{
    const status=snap.val();
    if(status==="racing"||status==="countdown"){if(isHost)startHostRace();else enterController();}
    if(status==="finished"){if(isHost)showResults();else enterController();}
  });
  roomRef.child("raceState").on("value",snap=>{
    raceState=snap.val();
    if(!isHost&&raceState)updateMobileRaceInfo(raceState);
    if(isHost&&raceState&&raceState.finished)showResults();
  });
}
function renderPlayers(){
  const arr=Object.entries(players);
  $("playerCount").textContent=arr.length+" / 16";
  $("playerList").innerHTML=arr.map(([id,p],i)=>`<div class="player-row"><span class="car-dot" style="background:${p.color||COLORS[i%16]};color:${p.color||COLORS[i%16]}"></span><span class="player-name">${escapeHtml(p.name||"PILOTO")}</span><span class="player-tag">${id===roomData?.hostUid||id===uid&&isHost?"HOST":""}</span><span class="${p.ready?"ready-tag":"ready-tag not-ready"}">${p.ready?"LISTO":"ESPERANDO"}</span></div>`).join("");
  if(isHost)$("startBtn").disabled=arr.length<2||!arr.every(([,p])=>p.ready);
}
$("copyBtn").onclick=async()=>{try{await navigator.clipboard.writeText(roomUrl());$("copyBtn").textContent="¡COPIADO!";setTimeout(()=>$("copyBtn").textContent="COPIAR LINK",1500);}catch(e){prompt("Copia este enlace:",roomUrl());}};
$("readyBtn").onclick=async()=>{
  const ref=roomRef.child("players/"+uid+"/ready");
  const snap=await ref.once("value");await ref.set(!snap.val());
  $("readyBtn").textContent=snap.val()?"¡ESTOY LISTO!":"CANCELAR LISTO";
};
$("startBtn").onclick=async()=>{
  if(!isHost)return;
  const snap=await roomRef.child("players").once("value"), ps=snap.val()||{}, entries=Object.entries(ps);
  if(entries.length<2||!entries.every(([,p])=>p.ready))return;
  const initial={};
  entries.forEach(([id,p],i)=>{initial[id]={uid:id,name:p.name,color:p.color||COLORS[i%16],progress:-i*38,lane:(i%2?1:-1)*12,speed:0,lap:0,finished:false,finishTime:0,place:0};});
  await roomRef.child("raceState").set({startedAt:Date.now(),lastEvent:"",cars:initial,finished:false,phase:"countdown"});
  await roomRef.child("status").set("racing");
};

function enterController(){
  show("controllerScreen");
  $("controllerPlayer").textContent=myName.toUpperCase();
  $("mobileRaceMessage").textContent="¡PISA EL ACELERADOR!";
  if(!controlWriteTimer)controlWriteTimer=setInterval(writeControls,90);
}
function writeControls(){
  if(!roomRef||isHost||!uid)return;
  roomRef.child("controls/"+uid).update({steer:joystick.x,gas:pressed.gas?1:0,brake:pressed.brake?1:0,nitro:pressed.nitro?1:0,t:Date.now()}).catch(()=>{});
}
function bindPedal(id,key){
  const el=$(id);
  const down=e=>{e.preventDefault();pressed[key]=true;el.classList.add("active");};
  const up=e=>{e.preventDefault();pressed[key]=false;el.classList.remove("active");};
  el.addEventListener("pointerdown",down);["pointerup","pointercancel","pointerleave"].forEach(ev=>el.addEventListener(ev,up));
}
bindPedal("gasBtn","gas");bindPedal("brakeBtn","brake");bindPedal("nitroBtn","nitro");
const stick=$("joystick"), knob=$("joystickKnob");
let stickPointer=null;
function moveStick(e){
  const r=stick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  let dx=(e.clientX-cx)/(r.width*.34),dy=(e.clientY-cy)/(r.height*.34);
  const mag=Math.hypot(dx,dy);if(mag>1){dx/=mag;dy/=mag;}
  joystick.x=Math.max(-1,Math.min(1,dx));
  knob.style.left=(50+joystick.x*34)+"%";knob.style.top=(50+Math.max(-1,Math.min(1,dy))*34)+"%";
}
stick.addEventListener("pointerdown",e=>{e.preventDefault();stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);});
stick.addEventListener("pointermove",e=>{if(e.pointerId===stickPointer)moveStick(e);});
function releaseStick(e){if(e.pointerId!==stickPointer)return;stickPointer=null;joystick.x=0;knob.style.left="50%";knob.style.top="50%";}
stick.addEventListener("pointerup",releaseStick);stick.addEventListener("pointercancel",releaseStick);

const keys={};
window.addEventListener("keydown",e=>{keys[e.key.toLowerCase()]=true;if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key))e.preventDefault();});
window.addEventListener("keyup",e=>keys[e.key.toLowerCase()]=false);
function keyboardControl(){return {steer:(keys.a||keys.arrowleft?-1:0)+(keys.d||keys.arrowright?1:0),gas:keys.w||keys.arrowup?1:0,brake:keys.s||keys.arrowdown?1:0,nitro:keys.shift?1:0};}

function startHostRace(){
  if(gameRunning)return;
  show("raceScreen");gameRunning=true;countdownActive=true;
  $("raceStatus").textContent="PREPÁRATE";$("raceMessage").textContent="3… 2… 1… ¡CAOS!";
  let count=3;$("countdown").textContent=count;$("countdown").classList.remove("hidden");
  const timer=setInterval(async()=>{
    count--;
    if(count>0){$("countdown").textContent=count;return;}
    clearInterval(timer);$("countdown").textContent="¡YA!";
    setTimeout(()=>$("countdown").classList.add("hidden"),650);
    countdownActive=false;$("raceStatus").textContent="EN CARRERA";
    const snap=await roomRef.child("raceState").once("value");
    const st=snap.val();if(st){st.phase="racing";await roomRef.child("raceState").update({phase:"racing"});raceState=st;}
    lastFrame=performance.now();requestAnimationFrame(gameLoop);
  },1000);
  roomRef.child("controls").on("value",snap=>{controls=snap.val()||{};});
  drawRace();
}
const TRACK_LEN = 2*(430+190) + 2*Math.PI*175;
function trackPoint(distance,lane=0){
  // Centro de la pista: rectángulo con esquinas redondeadas.
  const left=385, right=815, top=110, bottom=650, r=175;
  const h=right-left, v=(bottom-top)-2*r, arc=Math.PI*r/2;
  let d=((distance%TRACK_LEN)+TRACK_LEN)%TRACK_LEN;
  let x,y,tx,ty;
  if(d<h){x=left+d;y=top;tx=1;ty=0;}
  else if((d-=h)<arc){const a=-Math.PI/2+d/r;x=right+r*Math.cos(a);y=top+r+r*Math.sin(a);tx=-Math.sin(a);ty=Math.cos(a);}
  else if((d-=arc)<v){x=right+r;y=top+r+d;tx=0;ty=1;}
  else if((d-=v)<arc){const a=d/r;x=right+r*Math.cos(a);y=bottom-r+r*Math.sin(a);tx=-Math.sin(a);ty=Math.cos(a);}
  else if((d-=arc)<h){x=right-d;y=bottom;tx=-1;ty=0;}
  else if((d-=h)<arc){const a=Math.PI/2+d/r;x=left-r+r*Math.cos(a);y=bottom-r+r*Math.sin(a);tx=-Math.sin(a);ty=Math.cos(a);}
  else if((d-=arc)<v){x=left-r;y=bottom-r-d;tx=0;ty=-1;}
  else {d-=v;const a=Math.PI+d/r;x=left+r*Math.cos(a);y=top+r+r*Math.sin(a);tx=-Math.sin(a);ty=Math.cos(a);}
  return {x:x-ty*lane,y:y+tx*lane,tx,ty};
}
function drawTrack(ctx){
  ctx.fillStyle="#14251f";ctx.fillRect(0,0,1200,760);
  // subtle grass grid
  ctx.strokeStyle="#ffffff08";ctx.lineWidth=1;
  for(let x=0;x<1200;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,760);ctx.stroke();}
  for(let y=0;y<760;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1200,y);ctx.stroke();}
  ctx.lineCap="round";ctx.lineJoin="round";
  const p=new Path2D();p.moveTo(385,110);p.lineTo(815,110);p.quadraticCurveTo(990,110,990,285);p.lineTo(990,475);p.quadraticCurveTo(990,650,815,650);p.lineTo(385,650);p.quadraticCurveTo(210,650,210,475);p.lineTo(210,285);p.quadraticCurveTo(210,110,385,110);
  ctx.strokeStyle="#090d12";ctx.lineWidth=132;ctx.stroke(p);
  ctx.strokeStyle="#343b45";ctx.lineWidth=118;ctx.stroke(p);
  ctx.strokeStyle="#e7e9e8";ctx.lineWidth=4;ctx.setLineDash([22,18]);ctx.stroke(p);ctx.setLineDash([]);
  // curbs
  ctx.strokeStyle="#f4f4f4";ctx.lineWidth=9;ctx.setLineDash([18,18]);ctx.stroke(p);ctx.setLineDash([]);
  // Start/finish
  ctx.save();ctx.translate(600,110);ctx.fillStyle="#fff";for(let i=0;i<8;i++){ctx.fillRect(-38+i*10,-5,10,14);}ctx.restore();
  // track title
  ctx.fillStyle="#ffffff12";ctx.font="900 44px sans-serif";ctx.textAlign="center";ctx.fillText("CHAOS RUSH",600,385);
  ctx.fillStyle="#ffffff30";ctx.font="800 12px sans-serif";ctx.fillText("DON'T BRAKE. DON'T THINK.",600,410);
}
function drawCar(ctx,car,index){
  const p=trackPoint(car.progress,car.lane||0);
  const angle=Math.atan2(p.ty,p.tx);
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);
  ctx.fillStyle="#0009";ctx.fillRect(-20,-10,44,25);
  ctx.fillStyle=car.color||COLORS[index%16];ctx.beginPath();ctx.roundRect(-22,-12,44,24,7);ctx.fill();
  ctx.fillStyle="#101722";ctx.fillRect(-7,-10,16,20);
  ctx.fillStyle="#dff5ff";ctx.fillRect(7,-8,8,16);
  ctx.fillStyle="#fff";ctx.fillRect(16,-8,5,5);ctx.fillRect(16,3,5,5);
  ctx.fillStyle="#151922";ctx.fillRect(-16,-15,9,4);ctx.fillRect(8,-15,9,4);ctx.fillRect(-16,11,9,4);ctx.fillRect(8,11,9,4);
  if(car.nitroFlash){ctx.fillStyle="#ffb52e";ctx.beginPath();ctx.moveTo(-22,-6);ctx.lineTo(-38,0);ctx.lineTo(-22,6);ctx.fill();}
  ctx.restore();
  ctx.fillStyle="#fff";ctx.font="bold 12px sans-serif";ctx.textAlign="center";ctx.fillText(car.name||"PILOTO",p.x,p.y-22);
}
function drawRace(){
  const canvas=$("raceCanvas"),ctx=canvas.getContext("2d");
  drawTrack(ctx);
  const cars=raceState?.cars||{};
  Object.values(cars).sort((a,b)=>a.progress-b.progress).forEach((car,i)=>drawCar(ctx,car,i));
}
function gameLoop(now){
  if(!gameRunning)return;
  const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;
  if(!countdownActive&&raceState?.cars){
    const cars=raceState.cars, ids=Object.keys(cars);
    ids.forEach((id,i)=>{
      const c=cars[id];if(c.finished)return;
      let input=id===uid?keyboardControl():(controls[id]||{});
      const steer=Math.max(-1,Math.min(1,Number(input.steer)||0));
      const gas=Number(input.gas)||0,brake=Number(input.brake)||0,nitro=Number(input.nitro)||0;
      c.speed=Math.max(0,Math.min(340,c.speed+(gas*210-brake*300-38)*dt));
      if(nitro&&c.speed>35)c.speed=Math.min(410,c.speed+170*dt);
      c.lane=Math.max(-58,Math.min(58,(c.lane||0)+steer*145*dt));
      const edge=Math.abs(c.lane)>39;
      if(edge)c.speed=Math.max(70,c.speed-100*dt);
      c.progress+=c.speed*dt*(nitro?1.13:1);
      c.nitroFlash=!!nitro;
      c.lap=Math.max(0,Math.floor(c.progress/TRACK_LEN));
      if(c.lap>=TOTAL_LAPS){c.finished=true;c.finishTime=Date.now();c.place=Object.values(cars).filter(x=>x.finished).length;}
    });
    // Light contact: cars close in progress and lane push each other apart.
    for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){
      const ca=cars[ids[a]],cb=cars[ids[b]];
      const gap=Math.abs(ca.progress-cb.progress);
      if(gap<22&&Math.abs(ca.lane-cb.lane)<23&&!ca.finished&&!cb.finished){
        ca.speed=Math.max(0,ca.speed-38*dt);cb.speed=Math.max(0,cb.speed-38*dt);
        const push=(ca.lane<=cb.lane?-1:1);ca.lane+=push*30*dt;cb.lane-=push*30*dt;
      }
    }
    const ordered=Object.values(cars).slice().sort((a,b)=>(b.finished?1e12+b.finishTime:b.progress)-(a.finished?1e12+a.finishTime:a.progress));
    ordered.forEach((c,i)=>c.position=i+1);
    raceState.cars=cars;
    if(ids.every(id=>cars[id].finished)){
      raceState.finished=true;raceState.phase="finished";
      roomRef.child("raceState").set(raceState);roomRef.child("status").set("finished");
      showResults();return;
    }
    if(now-lastStatePush>100){lastStatePush=now;roomRef.child("raceState").set(raceState).catch(()=>{});}
    updateHostHUD();
  }
  drawRace();requestAnimationFrame(gameLoop);
}
function updateHostHUD(){
  const arr=Object.values(raceState.cars).sort((a,b)=>a.position-b.position);
  const mine=raceState.cars[uid];if(mine)$("hostLap").textContent=Math.min(TOTAL_LAPS,mine.lap+1)+" / "+TOTAL_LAPS;
  $("standings").innerHTML=arr.map(c=>`<div class="standing-row"><b>${c.position||"—"}</b><span>${escapeHtml(c.name)}</span><small>${c.finished?"FIN":Math.floor(c.speed)+" km/h"}</small></div>`).join("");
}
function updateMobileRaceInfo(st){
  const mine=st.cars?.[uid];if(!mine)return;
  $("mobileLap").textContent=Math.min(TOTAL_LAPS,mine.lap+1)+" / "+TOTAL_LAPS;
  $("mobilePosition").textContent=(mine.position||"—")+"°";
  $("mobileSpeed").textContent=Math.floor(mine.speed||0);
  $("mobileRaceMessage").textContent=mine.finished?"¡LLEGASTE A LA META!":st.phase==="countdown"?"PREPÁRATE PARA SALIR":"¡MANTÉN EL ACELERADOR!";
}
function showResults(){
  if(!isHost)return;
  gameRunning=false;show("finishScreen");
  const arr=Object.values(raceState?.cars||{}).sort((a,b)=>(a.place||99)-(b.place||99));
  $("finalResults").innerHTML=arr.map((c,i)=>`<div class="final-row"><b>${i+1}. ${escapeHtml(c.name)}</b><span>${c.finished?"¡META!":"NO TERMINÓ"}</span></div>`).join("");
}
$("backLobbyBtn").onclick=async()=>{
  if(!isHost)return;
  const ps={};Object.entries(players).forEach(([id,p])=>ps[id]={...p,ready:id===uid});
  await roomRef.update({status:"lobby",raceState:null,controls:null,players:ps});
  raceState=null;controls={};gameRunning=false;show("lobbyScreen");$("startBtn").disabled=true;
};

// Reconnect and initial state
boot();
window.addEventListener("beforeunload",()=>{if(controlWriteTimer)clearInterval(controlWriteTimer);});
