const e = React.createElement;
const { useState, useEffect, useRef } = React;
const socket = io();

function App(){
  const [page, setPage] = useState('login');
  const [user, setUser] = useState(localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null);
  return e('div',{className:'h-full flex flex-col'},
    e('header',{className:'p-4 text-center text-white font-bold bg-black bg-opacity-25'}, 'CueCash — Play. Win. Earn.'),
    e('main',{className:'flex-1 flex items-center justify-center'},
      !user ? e(Auth,{onLogin:u=>{ setUser(u); localStorage.setItem('user', JSON.stringify(u)); setPage('game'); }, onSwitch:setPage}) : e(Game,{user})
    )
  );
}

function Auth({onLogin, onSwitch}){
  const [mode, setMode] = useState('login');
  const [identifier,setIdentifier]=useState('');
  const [password,setPassword]=useState('');
  async function login(){
    const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier,password})});
    const data=await res.json();
    if(res.ok){ localStorage.setItem('token', data.token); onLogin(data.user); } else { alert(data.message || 'Login failed'); }
  }
  async function register(){
    const email = document.getElementById('regEmail').value;
    const phone = document.getElementById('regPhone').value;
    const pwd = document.getElementById('regPass').value;
    const res = await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,phone,password:pwd})});
    const data = await res.json();
    if(res.ok){ localStorage.setItem('token', data.token); onLogin(data.user); } else alert(data.message || 'Register failed');
  }
  return e('div',{className:'w-full max-w-xl p-6 bg-black bg-opacity-30 rounded'}, 
    e('div', {className:'flex justify-between mb-4'}, e('button',{className:'btn','onClick':()=>setMode('login')}, 'Login'), e('button',{className:'btn','onClick':()=>setMode('register')}, 'Register')),
    mode==='login' ? e('div',null,
      e('input',{placeholder:'Email or phone', className:'w-full p-2 mb-2 rounded', value:identifier, onChange: e=>setIdentifier(e.target.value)}),
      e('input',{type:'password', placeholder:'Password', className:'w-full p-2 mb-2 rounded', value:password, onChange: e=>setPassword(e.target.value)}),
      e('div', {className:'flex gap-2'}, e('button',{className:'bg-yellow-400 px-4 py-2 rounded', onClick:login}, 'Log in'), e('button',{className:'px-4 py-2 rounded border', onClick:()=>setMode('register')}, 'Switch to register'))
    ) : e('div',null,
      e('input',{id:'regEmail', placeholder:'Email (optional)', className:'w-full p-2 mb-2 rounded'}),
      e('input',{id:'regPhone', placeholder:'Phone (optional)', className:'w-full p-2 mb-2 rounded'}),
      e('input',{id:'regPass', type:'password', placeholder:'Password', className:'w-full p-2 mb-2 rounded'}),
      e('button',{className:'bg-yellow-400 px-4 py-2 rounded', onClick:register}, 'Register')
    )
  );
}

function Game({user}){
  const canvasRef = useRef();
  const [balance, setBalance] = useState(0);
  const [matchId, setMatchId] = useState('');
  useEffect(()=>{
    const token = localStorage.getItem('token');
    if(token){
      fetch('/api/wallet', { headers: { Authorization: 'Bearer '+token } }).then(r=>r.json()).then(d=> setBalance(d.balance || 0));
    }
  },[]);
  useEffect(()=>{
    const { Engine, Render, Runner, World, Bodies, Body, Events, Mouse, MouseConstraint } = Matter;
    const width = 1000, height = 560, ballRadius = 12;
    const engine = Engine.create();
    const world = engine.world;
    const canvas = canvasRef.current;
    const render = Render.create({ canvas, engine, options: { width, height, wireframes:false, background:'#0b5a2b' } });
    Render.run(render); Runner.run(Runner.create(), engine);
    World.add(world, [
      Bodies.rectangle(width/2,0,width,20,{isStatic:true, render:{fillStyle:'#3b2b1b'}}),
      Bodies.rectangle(width/2,height,width,20,{isStatic:true, render:{fillStyle:'#3b2b1b'}}),
      Bodies.rectangle(0,height/2,20,height,{isStatic:true, render:{fillStyle:'#3b2b1b'}}),
      Bodies.rectangle(width,height/2,20,height,{isStatic:true, render:{fillStyle:'#3b2b1b'}})
    ]);
    const cueBall = Bodies.circle(200, height/2, ballRadius, { restitution:0.98, friction:0.01, render:{fillStyle:'#ffffff'} });
    World.add(world, cueBall);
    const rackX = 700, rackY = height/2;
    const numbers = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
    const colors = {1:'#FFD700',2:'#0057B7',3:'#D62828',4:'#008000',5:'#FFA500',6:'#008000',7:'#800000',8:'#000000',9:'#FFD700',10:'#0057B7',11:'#D62828',12:'#8A2BE2',13:'#FFA500',14:'#008000',15:'#800000'};
    let idx = 0;
    for(let row=0; row<5; row++){
      for(let col=0; col<=row; col++){
        const x = rackX + row*(ballRadius*2+1);
        const y = rackY - row*ballRadius + col*(ballRadius*2);
        const num = numbers[idx++];
        const ball = Bodies.circle(x,y,ballRadius,{ restitution:0.98, friction:0.01, render:{fillStyle:colors[num]} });
        ball.label = 'ball-'+num;
        World.add(world, ball);
      }
    }
    const overlay = document.createElement('canvas');
    overlay.width = width; overlay.height = height;
    overlay.style.position = 'absolute'; overlay.style.left = canvas.getBoundingClientRect().left+'px'; overlay.style.top = canvas.getBoundingClientRect().top+'px'; overlay.style.pointerEvents='none';
    canvas.parentNode.appendChild(overlay);
    const octx = overlay.getContext('2d');
    const mouse = Mouse.create(render.canvas);
    const mc = MouseConstraint.create(engine, { mouse, constraint:{ stiffness:0.2, render:{ visible:false } } });
    World.add(world, mc); render.mouse = mouse;
    let aiming = false; let aimStart = null; let power = 0;
    Events.on(mc, 'startdrag', (ev)=>{ if(ev.body === cueBall){ aiming = true; aimStart = {x: ev.mouse.position.x, y: ev.mouse.position.y}; } });
    Events.on(mc, 'enddrag', (ev)=>{ if(ev.body === cueBall && aiming){ aiming=false; const dx = cueBall.position.x - ev.mouse.position.x; const dy = cueBall.position.y - ev.mouse.position.y; Body.applyForce(cueBall, cueBall.position, { x: dx * 0.004 * (power/50+0.5), y: dy * 0.004 * (power/50+0.5) }); power = 0; if(localStorage.getItem('currentMatchId')){ socket.emit('shot_fired',{ matchId: localStorage.getItem('currentMatchId'), shot:{dx,dy} }); } } });
    function renderOverlay(){
      octx.clearRect(0,0,overlay.width,overlay.height);
      if(aiming && aimStart){
        const mx = mouse.position.x, my = mouse.position.y;
        const angle = Math.atan2(my - cueBall.position.y, mx - cueBall.position.x);
        octx.save();
        octx.translate(cueBall.position.x, cueBall.position.y);
        octx.rotate(angle);
        octx.fillStyle = '#8b5a2b';
        octx.fillRect(-5, -3, 220, 6);
        octx.restore();
        power = Math.min(100, Math.hypot(mx - aimStart.x, my - aimStart.y));
        octx.fillStyle = 'rgba(0,0,0,0.6)';
        octx.fillRect(20,20,120,12);
        octx.fillStyle = '#f2c94c';
        octx.fillRect(20,20, Math.max(6, power*1.2),12);
      }
      requestAnimationFrame(renderOverlay);
    }
    renderOverlay();
    socket.on('opponent_shot', ({ shot })=>{
      Body.applyForce(cueBall, cueBall.position, { x: shot.dx*0.004, y: shot.dy*0.004 });
    });
    return ()=>{ try{ Render.stop(render); }catch(e){} overlay.remove(); }
  },[]);

  async function createMatch(){
    const stake = parseInt(prompt('Enter stake (30-5000 KSh):','30'));
    const token = localStorage.getItem('token');
    const res = await fetch('/api/match/create',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body: JSON.stringify({ stake }) });
    const data = await res.json();
    if(res.ok){ localStorage.setItem('currentMatchId', data.matchId); setMatchId(data.matchId); socket.emit('join_room',{ matchId: data.matchId }); alert('Match created: '+data.matchId); } else alert(data.message||'Failed');
  }
  async function joinMatch(){
    const id = document.getElementById('matchInput').value || prompt('Enter match id to join');
    const token = localStorage.getItem('token');
    const res = await fetch('/api/match/join',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body: JSON.stringify({ matchId: id }) });
    const data = await res.json();
    if(res.ok){ localStorage.setItem('currentMatchId', id); setMatchId(id); socket.emit('join_room',{ matchId:id }); alert('Joined'); } else alert(data.message||'Failed to join');
  }

  return e('div',{className:'w-full max-w-5xl p-4 bg-black bg-opacity-20 rounded flex flex-col items-center'},
    e('div',{className:'mb-2 text-white'}, 'Logged in as: '+ (user.email || 'player')),
    e('div',{className:'flex gap-2 mb-2'}, e('input',{id:'matchInput', placeholder:'Match ID', className:'p-2 rounded'}), e('button',{className:'bg-yellow-400 px-3 py-2 rounded', onClick:createMatch}, 'Create Match'), e('button',{className:'px-3 py-2 rounded border', onClick:joinMatch}, 'Join Match')),
    e('div',{className:'relative'}, e('canvas',{ref:canvasRef, width:1000, height:560}))
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
