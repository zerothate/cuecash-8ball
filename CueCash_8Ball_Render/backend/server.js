require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const dbFile = path.join(__dirname, 'database.sqlite');
const db = new Database(dbFile);

// Initialize tables
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  phone TEXT,
  password TEXT,
  balance INTEGER DEFAULT 0,
  is_admin INTEGER DEFAULT 0,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT,
  amount INTEGER,
  note TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  playerA TEXT,
  playerB TEXT,
  stake INTEGER,
  winner TEXT,
  created_at TEXT
);
`);

// seed users
function seedUser(email, phone, password, balance=0, isAdmin=0){
  const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if(row) return;
  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 8);
  db.prepare('INSERT INTO users (id,email,phone,password,balance,is_admin,created_at) VALUES (?,?,?,?,?,?,datetime("now"))')
    .run(id,email,phone,hash,balance,isAdmin);
  db.prepare('INSERT INTO ledger (id,user_id,type,amount,note,created_at) VALUES (?,?,?,?,?,datetime("now"))')
    .run(uuidv4(), id, 'seed', balance, 'initial balance',);
}

seedUser('kigenkigen455@gmail.com','', 'adminpass123', 0, 1);
seedUser('player1@cuecash.test','', 'pass123', 500, 0);
seedUser('player2@cuecash.test','', 'pass123', 500, 0);
seedUser('player3@cuecash.test','', 'pass123', 500, 0);
seedUser('player4@cuecash.test','', 'pass123', 500, 0);

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
function createToken(user){ return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' }); }
function authMiddleware(req,res,next){
  const h = req.headers.authorization;
  if(!h){ return res.status(401).json({message:'missing token'}) }
  const token = h.split(' ')[1];
  try{
    const data = jwt.verify(token, JWT_SECRET);
    req.user = db.prepare('SELECT id,email,balance,is_admin FROM users WHERE id = ?').get(data.id);
    next();
  }catch(e){ return res.status(401).json({message:'invalid token'}) }
}

// Auth endpoints
app.post('/api/auth/register',(req,res)=>{
  const { email, phone, password } = req.body;
  if(!password || (!email && !phone)) return res.status(400).json({message:'email or phone and password required'});
  const exists = db.prepare('SELECT id FROM users WHERE email = ? OR phone = ?').get(email||'', phone||'');
  if(exists) return res.status(400).json({message:'user exists'});
  const id = uuidv4();
  const hash = bcrypt.hashSync(password,8);
  db.prepare('INSERT INTO users (id,email,phone,password,balance,created_at) VALUES (?,?,?,?,?,datetime("now"))')
    .run(id,email||'',phone||'',hash,0);
  const user = db.prepare('SELECT id,email,balance FROM users WHERE id = ?').get(id);
  const token = createToken(user);
  res.json({ user, token });
});

app.post('/api/auth/login',(req,res)=>{
  const { identifier, password } = req.body;
  if(!identifier || !password) return res.status(400).json({message:'identifier and password required'});
  const user = db.prepare('SELECT * FROM users WHERE email = ? OR phone = ?').get(identifier, identifier);
  if(!user) return res.status(401).json({message:'invalid'});
  if(!bcrypt.compareSync(password, user.password)) return res.status(401).json({message:'invalid'});
  const u = { id: user.id, email: user.email, balance: user.balance, is_admin: user.is_admin };
  const token = createToken(u);
  res.json({ user: u, token });
});

// Wallet endpoints
app.get('/api/wallet', authMiddleware, (req,res)=>{
  res.json({ balance: req.user.balance });
});

app.post('/api/wallet/deposit', authMiddleware, (req,res)=>{
  const { amount, method } = req.body;
  if(!amount || amount <= 0) return res.status(400).json({message:'invalid amount'});
  const txId = uuidv4();
  db.prepare('INSERT INTO ledger (id,user_id,type,amount,note,created_at) VALUES (?,?,?,?,?,datetime("now"))')
    .run(txId, req.user.id, 'deposit_pending', amount, method || 'mpesa');
  res.json({ success:true, txId, instruction: 'Call /mpesa/simulate to simulate sandbox confirmation' });
});

app.post('/mpesa/simulate',(req,res)=>{
  const { txId, userEmail, amount } = req.body;
  if(!txId || !userEmail || !amount) return res.status(400).json({message:'txId,userEmail,amount required'});
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(userEmail);
  if(!user) return res.status(404).json({message:'user not found'});
  db.prepare('UPDATE ledger SET type = ? WHERE id = ?').run('deposit', txId);
  db.prepare('INSERT INTO ledger (id,user_id,type,amount,note,created_at) VALUES (?,?,?,?,?,datetime("now"))')
    .run(uuidv4(), user.id, 'credit', amount, 'mpesa_sandbox_credit');
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, user.id);
  return res.json({ success:true, newBalance: db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id).balance });
});

app.post('/api/wallet/withdraw', authMiddleware, (req,res)=>{
  const { amount, method, destination } = req.body;
  if(!amount || amount < 100) return res.status(400).json({message:'minimum withdrawal is 100 KSh'});
  if(req.user.balance < amount) return res.status(400).json({message:'insufficient balance'});
  db.prepare('INSERT INTO ledger (id,user_id,type,amount,note,created_at) VALUES (?,?,?,?,?,datetime("now"))')
    .run(uuidv4(), req.user.id, 'withdraw', amount, method || 'mpesa');
  db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount, req.user.id);
  return res.json({ success:true, balance: db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id).balance });
});

// Matches endpoints
app.post('/api/match/create', authMiddleware, (req,res)=>{
  const { stake } = req.body;
  if(!stake || stake < 30 || stake > 5000) return res.status(400).json({message:'invalid stake'});
  if(req.user.balance < stake) return res.status(400).json({message:'insufficient balance'});
  const matchId = uuidv4();
  db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(stake, req.user.id);
  db.prepare('INSERT INTO ledger (id,user_id,type,amount,note,created_at) VALUES (?,?,?,?,?,datetime("now"))')
    .run(uuidv4(), req.user.id, 'stake', stake, `match:${matchId}`);
  db.prepare('INSERT INTO matches (id,playerA,playerB,stake,created_at) VALUES (?,?,?, ?, datetime("now"))')
    .run(matchId, req.user.id, null, stake);
  res.json({ success:true, matchId });
});

app.post('/api/match/join', authMiddleware, (req,res)=>{
  const { matchId } = req.body;
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if(!match) return res.status(404).json({message:'match not found'});
  if(match.playerB) return res.status(400).json({message:'match already has two players'});
  if(req.user.balance < match.stake) return res.status(400).json({message:'insufficient balance to join'});
  db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(match.stake, req.user.id);
  db.prepare('INSERT INTO ledger (id,user_id,type,amount,note,created_at) VALUES (?,?,?,?,?,datetime("now"))')
    .run(uuidv4(), req.user.id, 'stake', match.stake, `match:${matchId}`);
  db.prepare('UPDATE matches SET playerB = ? WHERE id = ?').run(req.user.id, matchId);
  res.json({ success:true });
});

app.post('/api/match/result', authMiddleware, (req,res)=>{
  const { matchId, winnerId } = req.body;
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if(!match) return res.status(404).json({message:'match not found'});
  if(match.winner) return res.status(400).json({message:'match already finished'});
  const pot = match.stake * 2;
  const winnerAmount = Math.floor(pot * 0.7);
  const platformFee = pot - winnerAmount;
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(winnerAmount, winnerId);
  db.prepare('INSERT INTO ledger (id,user_id,type,amount,note,created_at) VALUES (?,?,?,?,?,datetime("now"))')
    .run(uuidv4(), winnerId, 'win', winnerAmount, `match:${matchId}`);
  db.prepare('UPDATE matches SET winner = ? WHERE id = ?').run(winnerId, matchId);
  res.json({ success:true, winnerAmount, platformFee });
});

app.get('/api/admin/stats', authMiddleware, (req,res)=>{
  if(!req.user.is_admin) return res.status(403).json({message:'forbidden'});
  const totalGames = db.prepare('SELECT COUNT(*) as c FROM matches').get().c;
  const totalRevenue = db.prepare('SELECT SUM(CASE WHEN type="win" THEN 0 ELSE 0 END) as r FROM ledger').get().r || 0;
  res.json({ totalGames, totalRevenue });
});

// serve frontend
app.get('/', (req,res)=>{
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// socket.io realtime
io.on('connection', socket => {
  console.log('socket connected', socket.id);
  socket.on('join_room', ({ matchId }) => {
    socket.join(matchId);
    io.to(matchId).emit('player_joined', { socketId: socket.id });
  });
  socket.on('shot_fired', ({ matchId, shot }) => socket.to(matchId).emit('opponent_shot', { shot }));
  socket.on('ball_update', ({ matchId, balls }) => socket.to(matchId).emit('opponent_ball_update', { balls }));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, ()=> console.log('CueCash backend running on', PORT));
