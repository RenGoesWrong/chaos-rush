(() => {
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id);
const lapEl=$('lap'),timeEl=$('time'),speedEl=$('speed'),overlay=$('overlay'),finish=$('finish'),pauseLayer=$('pauseLayer');
let W=0,H=0,dpr=1,raf=0,last=0,running=false,paused=false,finished=false;
let elapsed=0,lap=1,lapProgress=0,nitro=3,nitroTime=0,steer=0,keys={};
const track={cx:0,cy:0,rx:0,ry:0,innerX:0,innerY:0};
const car={angle:-Math.PI/2,x:0,y:0,speed:0,max:245,turn:2.65,trail:[]};
const pickups=[];
function resize(){const r=canvas.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,2);W=Math.max(1,r.width);H=Math.max(1,r.height);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);layoutTrack();draw()}
function layoutTrack(){track.cx=W/2;track.cy=H/2;const scale=Math.min(W/900,H/560);track.rx=Math.max(120,Math.min(W*.39,390*scale));track.ry=Math.max(90,Math.min(H*.36,220*scale));track.innerX=track.rx*.57;track.innerY=track.ry*.53;if(!running){car.x=track.cx;car.y=track.cy-track.ry;}}
function format(t){let m=Math.floor(t/60),s=(t%60).toFixed(1);return String(m).padStart(2,'0')+':'+s.padStart(4,'0')}
function reset(){elapsed=0;lap=1;lapProgress=0;nitro=3;nitroTime=0;car.angle=-Math.PI/2;car.x=track.cx;car.y=track.cy-track.ry+22;car.speed=0;car.trail=[];finished=false;paused=false;running=true;overlay.classList.add('hidden');finish.classList.add('hidden');pauseLayer.classList.add('hidden');updateHud()}
function updateHud(){lapEl.textContent=Math.min(lap,3)+' / 3';timeEl.textContent=format(elapsed);speedEl.textContent=Math.round(car.speed*0.7);$('nitroCount').textContent=nitro+' CARGAS'}
function onTrack(x,y){let dx=(x-track.cx),dy=(y-track.cy);let outer=(dx*dx)/(track.rx*track.rx)+(dy*dy)/(track.ry*track.ry);let inner=(dx*dx)/(track.innerX*track.innerX)+(dy*dy)/(track.innerY*track.innerY);return outer<=1&&inner>=1}
function drawTrack(){ctx.fillStyle='#183a32';ctx.fillRect(0,0,W,H);
 // decorative grass dots
 ctx.fillStyle='#ffffff0a';for(let i=0;i<100;i++){let x=(i*137)%W,y=(i*83)%H;ctx.fillRect(x,y,2,2)}
 ctx.beginPath();ctx.ellipse(track.cx,track.cy,track.rx,track.ry,0,0,Math.PI*2);ctx.ellipse(track.cx,track.cy,track.innerX,track.innerY,0,0,Math.PI*2,true);ctx.fillStyle='#39434b';ctx.fill('evenodd');
 ctx.lineWidth=5;ctx.strokeStyle='#e9e8d2';ctx.setLineDash([16,12]);ctx.beginPath();ctx.ellipse(track.cx,track.cy,(track.rx+track.innerX)/2,(track.ry+track.innerY)/2,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
 ctx.lineWidth=4;ctx.strokeStyle='#a9b5b7';ctx.beginPath();ctx.ellipse(track.cx,track.cy,track.rx,track.ry,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(track.cx,track.cy,track.innerX,track.innerY,0,0,Math.PI*2);ctx.stroke();
 // start line at top
 const sx=track.cx,sy=track.cy-track.ry;ctx.save();ctx.translate(sx,sy);ctx.rotate(Math.PI/2);for(let i=0;i<8;i++){ctx.fillStyle=i%2?'#17202a':'#f5f5e8';ctx.fillRect(-18+i*5,-9,5,18)}ctx.restore();
 // cones
 for(let i=0;i<8;i++){let a=-1.2+i*.34,x=track.cx+Math.cos(a)*(track.innerX+18),y=track.cy+Math.sin(a)*(track.innerY+18);ctx.fillStyle='#ffb23f';ctx.beginPath();ctx.moveTo(x,y-6);ctx.lineTo(x-5,y+5);ctx.lineTo(x+5,y+5);ctx.closePath();ctx.fill()}
}
function drawCar(){ctx.save();ctx.translate(car.x,car.y);ctx.rotate(car.angle+Math.PI/2);
 // shadow
 ctx.fillStyle='#0007';ctx.beginPath();ctx.ellipse(3,5,12,20,0,0,Math.PI*2);ctx.fill();
 // body
 ctx.fillStyle=nitroTime>0?'#62eaff':'#ff5365';ctx.beginPath();ctx.roundRect(-10,-18,20,36,7);ctx.fill();
 ctx.fillStyle='#18283b';ctx.beginPath();ctx.roundRect(-7,-7,14,12,4);ctx.fill();
 ctx.fillStyle='#ffe36c';ctx.fillRect(-8,-16,5,3);ctx.fillRect(3,-16,5,3);
 ctx.fillStyle='#161d29';ctx.fillRect(-12,-10,3,8);ctx.fillRect(9,-10,3,8);ctx.fillRect(-12,8,3,7);ctx.fillRect(9,8,3,7);
 if(nitroTime>0){ctx.fillStyle='#62eaff';ctx.beginPath();ctx.moveTo(-5,17);ctx.lineTo(0,29+Math.random()*8);ctx.lineTo(5,17);ctx.fill()}
 ctx.restore()}
function draw(){if(!W||!H)return;ctx.clearRect(0,0,W,H);drawTrack();drawCar();if(running&&!finished){ctx.fillStyle='#fff';ctx.font='700 11px Inter';ctx.fillText('CHAOS RUSH • PROTOTIPO',16,22)}}
function update(dt){if(!running||paused||finished)return;elapsed+=dt;const boost=nitroTime>0?1.75:1;nitroTime=Math.max(0,nitroTime-dt);
 const target=car.max*boost;car.speed+=(target-car.speed)*Math.min(1,dt*1.7);
 const direction=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0);const steerInput=Math.abs(steer)>.05?steer:direction;
 car.angle+=steerInput*car.turn*dt*(.45+car.speed/car.max*.65);
 car.x+=Math.cos(car.angle)*car.speed*dt;car.y+=Math.sin(car.angle)*car.speed*dt;
 if(!onTrack(car.x,car.y)){car.speed*=.965;car.x+=(track.cx-car.x)*dt*.14;car.y+=(track.cy-car.y)*dt*.14}
 // Count progress by angular position around oval, increasing clockwise from top.
 let a=Math.atan2((car.y-track.cy)/track.ry,(car.x-track.cx)/track.rx);let p=(a+Math.PI/2+Math.PI*2)%(Math.PI*2);let delta=(p-lapProgress+Math.PI*3)%(Math.PI*2)-Math.PI;
 if(delta>0&&delta<.16)lapProgress=p;
 if(p<.45&&lapProgress>5.6&&car.y<track.cy-track.ry*.62&&car.x>track.cx-track.rx*.25&&car.x<track.cx+track.rx*.25){lap++;lapProgress=0;if(lap>3){finished=true;running=false;$('finishTime').textContent='Tu tiempo: '+format(elapsed);finish.classList.remove('hidden')}}
 updateHud();draw()}
function loop(ts){if(!last)last=ts;let dt=Math.min((ts-last)/1000,.04);last=ts;update(dt);raf=requestAnimationFrame(loop)}
$('startBtn').addEventListener('click',()=>{reset();last=0});
$('againBtn').addEventListener('click',reset);
$('pauseBtn').addEventListener('click',()=>{if(!running)return;paused=!paused;pauseLayer.classList.toggle('hidden',!paused)});
$('nitroBtn').addEventListener('pointerdown',e=>{e.preventDefault();if(running&&!paused&&nitro>0){nitro--;nitroTime=1.35;updateHud()}});
window.addEventListener('keydown',e=>{keys[e.key]=true;if(['ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault()});
window.addEventListener('keyup',e=>keys[e.key]=false);
const zone=$('stickZone'),knob=$('stickKnob');let pointer=null;
function stick(e){const r=zone.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;let max=27,len=Math.hypot(dx,dy);if(len>max){dx=dx/len*max;dy=dy/len*max}knob.style.transform=`translate(${dx}px,${dy}px)`;steer=Math.max(-1,Math.min(1,dx/max))}
zone.addEventListener('pointerdown',e=>{pointer=e.pointerId;zone.setPointerCapture(pointer);stick(e)});
zone.addEventListener('pointermove',e=>{if(pointer===e.pointerId)stick(e)});
function release(){pointer=null;steer=0;knob.style.transform='translate(0,0)'}
zone.addEventListener('pointerup',release);zone.addEventListener('pointercancel',release);window.addEventListener('resize',resize);
resize();requestAnimationFrame(loop);
})();