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
let joystick={x:0,y:0}, pressed={gas:false,brake:false,nitro:false,drift:false,item:false}, controlWriteTimer=null;
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
  entries.forEach(([id,p],i)=>{initial[id]={uid:id,name:p.name,color:p.color||COLORS[i%16],progress:-i*38,lane:(i%2?1:-1)*12,speed:0,lap:0,finished:false,finishTime:0,place:0,itemReady:false,lastItemInput:0,boostUntil:0,shockUntil:0,lastPadLap:-1};});
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
  roomRef.child("controls/"+uid).update({steer:joystick.x,gas:pressed.gas?1:0,brake:pressed.brake?1:0,nitro:pressed.nitro?1:0,drift:pressed.drift?1:0,item:pressed.item?1:0,t:Date.now()}).catch(()=>{});
}
function bindPedal(id,key){
  const el=$(id);
  const down=e=>{e.preventDefault();pressed[key]=true;el.classList.add("active");};
  const up=e=>{e.preventDefault();pressed[key]=false;el.classList.remove("active");};
  el.addEventListener("pointerdown",down);["pointerup","pointercancel","pointerleave"].forEach(ev=>el.addEventListener(ev,up));
}
bindPedal("gasBtn","gas");bindPedal("brakeBtn","brake");bindPedal("nitroBtn","nitro");bindPedal("driftBtn","drift");bindPedal("itemBtn","item");
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
function keyboardControl(){return {steer:(keys.a||keys.arrowleft?-1:0)+(keys.d||keys.arrowright?1:0),gas:keys.w||keys.arrowup?1:0,brake:keys.s||keys.arrowdown?1:0,nitro:keys.shift?1:0,drift:keys.space?1:0,item:keys.e?1:0};}

function startHostRace(){
  if(gameRunning)return;
  show("raceScreen");gameRunning=true;countdownActive=true;
  $("raceStatus").textContent="PREPÁRATE";$("raceMessage").textContent="WASD · ESPACIO DERRAPE · E OBJETO · SHIFT NITRO";
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
// Cámara arcade en perspectiva: carretera pseudo-3D detrás del kart.
const VIEW={w:1280,h:720,horizon:190,roadHalf:76,far:1900};
function projectRoad(lateral,forward){
  const z=Math.max(0,forward),scale=900/(z+80);
  return {x:VIEW.w/2+lateral*scale,y:Math.min(VIEW.h+30,VIEW.horizon+60000/(z+80)),scale};
}
function cameraBasis(me){
  const p=trackPoint(me.progress,me.lane||0);
  return {p,rx:-p.ty,ry:p.tx};
}
function worldToCamera(world,basis){
  const dx=world.x-basis.p.x,dy=world.y-basis.p.y;
  return dx*basis.rx+dy*basis.ry;
}
function drawBackground(ctx){
  const sky=ctx.createLinearGradient(0,0,0,VIEW.h);sky.addColorStop(0,"#65c9ed");sky.addColorStop(.58,"#d3eff0");sky.addColorStop(.59,"#75b94e");sky.addColorStop(1,"#347b38");ctx.fillStyle=sky;ctx.fillRect(0,0,VIEW.w,VIEW.h);
  // Montañas y nubes de fondo
  ctx.fillStyle="#6d9c9b";ctx.beginPath();ctx.moveTo(0,245);for(let x=0;x<=VIEW.w;x+=90)ctx.lineTo(x,205+Math.sin(x*.009)*28+Math.sin(x*.021)*13);ctx.lineTo(VIEW.w,330);ctx.lineTo(0,330);ctx.fill();
  ctx.fillStyle="#f4ffff";[[150,92,1],[470,125,.7],[960,80,.9],[1120,145,.55]].forEach(([x,y,s])=>{ctx.globalAlpha=.72;ctx.beginPath();ctx.arc(x,y,24*s,0,Math.PI*2);ctx.arc(x+25*s,y-8*s,30*s,0,Math.PI*2);ctx.arc(x+55*s,y,22*s,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;
  ctx.fillStyle="#4c9b49";ctx.fillRect(0,300,VIEW.w,420);
  // Franjas de césped dan sensación de velocidad
  for(let i=0;i<18;i++){const y=310+i*i*1.25;ctx.fillStyle=i%2?"#4b9846":"#438e40";ctx.fillRect(0,y,VIEW.w,Math.min(34+i*2,VIEW.h-y));}
}
function poly(ctx,pts,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.closePath();ctx.fill();}
function drawScenery(ctx,me,basis){
  for(let d=90;d<VIEW.far;d+=115){
    for(const side of [-1,1]){
      const w=trackPoint(me.progress+d,0),lat=worldToCamera(w,basis)+side*155,p=projectRoad(lat,d),s=Math.max(.18,Math.min(2.2,210/(d+90)));
      if(p.y>VIEW.h+50)continue;
      const x=p.x,y=p.y;
      // Árboles redondos tipo circuito de karts
      ctx.fillStyle="#67462d";ctx.fillRect(x-5*s,y-36*s,10*s,38*s);
      ctx.fillStyle=side<0?"#176b3c":"#1d7840";ctx.beginPath();ctx.arc(x,y-49*s,22*s,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#42a957";ctx.beginPath();ctx.arc(x-8*s,y-56*s,12*s,0,Math.PI*2);ctx.fill();
      if(d%345<120){ctx.fillStyle="#fff";ctx.fillRect(x-26*s,y-94*s,52*s,22*s);ctx.fillStyle="#e83c4d";ctx.font=`900 ${Math.max(7,12*s)}px sans-serif`;ctx.textAlign="center";ctx.fillText("CHAOS!",x,y-79*s);}
    }
  }
}
function drawRoad(ctx,me,basis){
  const samples=[];for(let d=0;d<=VIEW.far;d+=20){const w=trackPoint(me.progress+d,0);samples.push({d,lat:worldToCamera(w,basis)});}
  // Del fondo hacia la cámara para que los segmentos cercanos tapen a los lejanos
  for(let i=samples.length-2;i>=0;i--){
    const a=samples[i],b=samples[i+1],al=projectRoad(a.lat-VIEW.roadHalf,a.d),ar=projectRoad(a.lat+VIEW.roadHalf,a.d),bl=projectRoad(b.lat-VIEW.roadHalf,b.d),br=projectRoad(b.lat+VIEW.roadHalf,b.d);
    const stripe=Math.floor(a.d/40)%2===0;
    const curb=12;
    poly(ctx,[{x:al.x-curb*al.scale,y:al.y},{x:ar.x+curb*ar.scale,y:ar.y},{x:br.x+curb*br.scale,y:br.y},{x:bl.x-curb*bl.scale,y:bl.y}],stripe?"#f2f0e8":"#e74742");
    poly(ctx,[al,ar,br,bl],stripe?"#50545a":"#484c52");
    // Línea central discontinua
    if(Math.floor(a.d/90)%2===0){const c1=projectRoad(a.lat,a.d),c2=projectRoad(b.lat,b.d);ctx.strokeStyle="#f7edbd";ctx.lineWidth=Math.max(1,4*c1.scale);ctx.beginPath();ctx.moveTo(c1.x,c1.y);ctx.lineTo(c2.x,c2.y);ctx.stroke();}
  }
  // Franjas de turbo visibles en la pista para anticipar el impulso.
  for(const pad of [.27,.73]){
    const target=pad*TRACK_LEN;
    const ahead=((target-(me.progress%TRACK_LEN))+TRACK_LEN)%TRACK_LEN;
    if(ahead<650){
      const w=trackPoint(me.progress+ahead,0),lat=worldToCamera(w,basis),p=projectRoad(lat,ahead);
      const width=Math.min(500,VIEW.roadHalf*1.45*p.scale),h=Math.max(3,9*p.scale);
      ctx.save();ctx.translate(p.x,p.y-4);ctx.fillStyle="#48e8ff";
      for(let k=0;k<5;k++)ctx.fillRect(-width/2+k*width/5,-h/2,width/5-2,h);
      ctx.restore();
    }
  }
  // Cajas de objeto visibles en la carretera antes de recogerlas.
  const nextBox=(Math.floor(Math.max(0,me.progress)/390)+1)*390;
  const boxAhead=nextBox-me.progress;
  if(boxAhead>45&&boxAhead<1000){
    const slot=Math.floor(nextBox/390),lane=(slot%2? -24:24);
    const w=trackPoint(me.progress+boxAhead,lane),lat=worldToCamera(w,basis),p=projectRoad(lat,boxAhead);
    const size=Math.max(5,Math.min(30,360/(boxAhead+40)));
    ctx.save();ctx.translate(p.x,p.y-size*1.2);ctx.rotate(Math.sin(performance.now()/180)*.12);
    ctx.shadowColor="#5cecff";ctx.shadowBlur=18;ctx.fillStyle="#42dff5";
    ctx.fillRect(-size/2,-size/2,size,size);ctx.shadowBlur=0;
    ctx.strokeStyle="#ffffff";ctx.lineWidth=Math.max(1,size*.09);ctx.strokeRect(-size/2,-size/2,size,size);
    ctx.fillStyle="#06354a";ctx.font=`900 ${Math.max(8,size*.9)}px sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("?",0,1);
    ctx.restore();
  }
  // Línea de salida a cuadros cuando está cerca
  const startDist=((TRACK_LEN-(me.progress%TRACK_LEN))%TRACK_LEN);if(startDist<420){const a=trackPoint(me.progress+startDist,0),lat=worldToCamera(a,basis),p=projectRoad(lat,startDist);const width=Math.min(650,VIEW.roadHalf*2*p.scale);ctx.save();ctx.translate(p.x,p.y-2);ctx.fillStyle="#fff";for(let i=0;i<12;i++)if(i%2===0)ctx.fillRect(-width/2+i*width/12,-Math.max(4,10*p.scale),width/12,Math.max(4,10*p.scale));ctx.restore();}
}
function drawRival(ctx,car,basis,me){
  let ahead=(car.progress-me.progress+TRACK_LEN)%TRACK_LEN;if(ahead<12||ahead>1250)return;
  const w=trackPoint(car.progress,car.lane||0),lat=worldToCamera(w,basis),p=projectRoad(lat,ahead),s=Math.max(.14,Math.min(1.65,210/(ahead+100)));
  if(p.x<-100||p.x>VIEW.w+100||p.y>VIEW.h+30)return;
  const cw=42*s,ch=58*s,x=p.x,y=p.y-ch*.55;
  ctx.save();ctx.translate(x,y);ctx.fillStyle="#0007";ctx.beginPath();ctx.ellipse(0,ch*.45,cw*.8,ch*.24,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#17191d";ctx.fillRect(-cw*.58,-ch*.12,cw*.25,ch*.43);ctx.fillRect(cw*.33,-ch*.12,cw*.25,ch*.43);
  ctx.fillStyle=car.color||"#ff4658";ctx.beginPath();ctx.moveTo(-cw*.48,ch*.38);ctx.lineTo(-cw*.42,-ch*.18);ctx.quadraticCurveTo(0,-ch*.48,cw*.42,-ch*.18);ctx.lineTo(cw*.48,ch*.38);ctx.closePath();ctx.fill();
  ctx.fillStyle="#172a3b";ctx.beginPath();ctx.moveTo(-cw*.29,-ch*.08);ctx.lineTo(-cw*.2,-ch*.31);ctx.lineTo(cw*.2,-ch*.31);ctx.lineTo(cw*.29,-ch*.08);ctx.fill();
  ctx.fillStyle="#fff2c8";ctx.fillRect(-cw*.39,ch*.22,cw*.18,ch*.08);ctx.fillRect(cw*.21,ch*.22,cw*.18,ch*.08);
  if(ahead<300){ctx.fillStyle="#fff";ctx.font=`800 ${Math.max(8,10*s)}px sans-serif`;ctx.textAlign="center";ctx.fillText(car.name||"PILOTO",0,-ch*.55);}
  ctx.restore();
}
function drawPlayerKart(ctx,car){
  const x=VIEW.w/2+(car.steerVisual||0)*18,y=VIEW.h-116;ctx.save();ctx.translate(x,y);ctx.rotate((car.steerVisual||0)*-.055);
  // sombra, ruedas, chasis, asiento, casco y alerón
  ctx.fillStyle="#0008";ctx.beginPath();ctx.ellipse(0,40,72,24,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#17191d";ctx.fillRect(-65,-8,20,58);ctx.fillRect(45,-8,20,58);
  ctx.fillStyle="#30343b";ctx.fillRect(-62,0,14,38);ctx.fillRect(48,0,14,38);
  ctx.fillStyle="#151a22";ctx.fillRect(-48,-55,96,20);
  ctx.fillStyle=car.color||"#ff4658";ctx.beginPath();ctx.moveTo(-47,34);ctx.lineTo(-40,-30);ctx.quadraticCurveTo(-32,-63,0,-68);ctx.quadraticCurveTo(32,-63,40,-30);ctx.lineTo(47,34);ctx.quadraticCurveTo(0,56,-47,34);ctx.fill();
  ctx.fillStyle="#9fe5f5";ctx.beginPath();ctx.moveTo(-25,-31);ctx.quadraticCurveTo(0,-57,25,-31);ctx.lineTo(20,-5);ctx.lineTo(-20,-5);ctx.fill();
  ctx.fillStyle="#202b38";ctx.beginPath();ctx.arc(0,-35,16,0,Math.PI*2);ctx.fill();ctx.fillStyle="#f5c84d";ctx.fillRect(-10,-40,20,7);
  ctx.fillStyle="#fff4c4";ctx.fillRect(-37,22,15,9);ctx.fillRect(22,22,15,9);
  ctx.fillStyle="#252a32";ctx.fillRect(-51,-59,102,8);ctx.fillRect(-43,-67,86,7);
  if(car.nitroFlash){ctx.fillStyle="#ffb12d";ctx.beginPath();ctx.moveTo(-19,45);ctx.lineTo(-11,91+Math.random()*12);ctx.lineTo(0,47);ctx.fill();ctx.beginPath();ctx.moveTo(7,47);ctx.lineTo(17,88+Math.random()*12);ctx.lineTo(23,43);ctx.fill();}
  ctx.restore();
}
function drawRace(){
  const canvas=$("raceCanvas"),ctx=canvas.getContext("2d");
  const cars=raceState?.cars||{},me=cars[uid]||Object.values(cars)[0];
  if(!me){drawBackground(ctx);return;}
  const basis=cameraBasis(me);drawBackground(ctx);drawScenery(ctx,me,basis);drawRoad(ctx,me,basis);
  Object.values(cars).filter(c=>c!==me).forEach(c=>drawRival(ctx,c,basis,me));
  drawPlayerKart(ctx,me);
  // Viñeta sutil y HUD de velocidad
  const v=ctx.createRadialGradient(640,360,230,640,360,760);v.addColorStop(0,"#0000");v.addColorStop(1,"#07101a55");ctx.fillStyle=v;ctx.fillRect(0,0,VIEW.w,VIEW.h);
}

function useRaceItem(id, car, cars, now){
  if(!car.itemReady || now-(car.lastItemUse||0)<900)return;
  car.itemReady=false;car.lastItemUse=now;
  // Un objeto sencillo y legible: turbo propio o pulso que frena rivales.
  const roll=Math.random();
  if(roll<.62){
    car.boostUntil=now+1900;
    car.speed=Math.min(430,car.speed+115);
    raceState.lastEvent=(car.name||"PILOTO")+" ACTIVÓ TURBO";
  }else{
    Object.entries(cars).forEach(([otherId,other])=>{
      if(otherId!==id&&!other.finished){
        other.shockUntil=now+950;
        other.speed=Math.max(80,(other.speed||0)*.72);
      }
    });
    raceState.lastEvent=(car.name||"PILOTO")+" LANZÓ UN PULSO";
  }
}
function updateTrackFeatures(car, oldProgress, now){
  // Dos bandas de turbo por vuelta: cruzarlas da un pequeño impulso automático.
  const lap=Math.floor(Math.max(0,car.progress)/TRACK_LEN);
  const oldLap=Math.floor(Math.max(0,oldProgress)/TRACK_LEN);
  const padA=.27, padB=.73;
  for(let l=oldLap;l<=lap;l++){
    const prev=oldProgress-l*TRACK_LEN, curr=car.progress-l*TRACK_LEN;
    for(const pad of [padA,padB]){
      const target=pad*TRACK_LEN;
      if(prev<target && curr>=target && car.lastPadLap!==l*10+(pad===padA?1:2)){
        car.lastPadLap=l*10+(pad===padA?1:2);
        car.speed=Math.min(430,car.speed+62);
        car.boostUntil=now+700;
      }
    }
  }
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
      const drifting=Number(input.drift)||0;
      const oldProgress=c.progress;
      // Manejo arcade: acelera rápido, frena sin clavarse y conserva inercia.
      const maxSpeed=nitro||now<(c.boostUntil||0)?430:340;
      c.speed=Math.max(0,Math.min(maxSpeed,c.speed+(gas*285-brake*330-(gas?7:34))*dt));
      if(nitro&&c.speed>28)c.speed=Math.min(445,c.speed+205*dt);
      if(now<(c.shockUntil||0))c.speed=Math.max(85,c.speed-175*dt);
      c.laneVel=c.laneVel||0;
      const grip=drifting?.72:7.2;
      const steeringPower=drifting?255:190;
      c.laneVel+=(steer*steeringPower-c.laneVel*grip)*dt;
      c.lane=Math.max(-62,Math.min(62,(c.lane||0)+c.laneVel*dt));
      const edge=Math.abs(c.lane)>53;
      if(edge){c.speed=Math.max(115,c.speed-72*dt);c.laneVel*=-.22;}
      c.steerVisual=steer;
      c.progress+=c.speed*dt*(nitro?1.13:1);
      updateTrackFeatures(c,oldProgress,now);
      if(Number(input.item)>.5 && !c.lastItemInput)useRaceItem(id,c,cars,now);
      c.lastItemInput=Number(input.item)>.5;
      // Las cajas aparecen en puntos fijos: el primer cruce entrega un objeto.
      const pickupSlot=Math.floor(Math.max(0,c.progress)/390);
      if(pickupSlot>(c.lastPickupSlot??-1)){c.lastPickupSlot=pickupSlot;c.itemReady=true;}
      c.nitroFlash=!!nitro||now<(c.boostUntil||0);
      c.drifting=!!drifting&&Math.abs(steer)>.12;
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
  const mine=raceState.cars[uid];if(mine){
    $("hostLap").textContent=Math.min(TOTAL_LAPS,mine.lap+1)+" / "+TOTAL_LAPS;
    $("raceMessage").textContent=mine.itemReady?"¡OBJETO LISTO! PRESIONA E · SHIFT = NITRO":"WASD / FLECHAS · ESPACIO DERRAPE · CAJAS ? = OBJETOS · SHIFT NITRO";
  }
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
