const express = require('express');
const mysql = require('mysql2');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const cors = require('cors');
app.use(cors({
  origin: ['http://mitsukomarket.s3-website.eu-north-1.amazonaws.com' , 'http://localhost:3000']
}));

app.use(express.json());

// Database connection
const db = mysql.createConnection({
  host: 'database-2.cvmk6i0u8fqm.eu-north-1.rds.amazonaws.com',
  user: 'admin',
  password: 'Hn4fZGQvvW6u75g',
  database: 'mmdb',
  port: '3306',
});

db.connect(err => {
  if (err) throw err;
  console.log('Connected to MySQL database');
});

// Middleware to verify JWT
const authenticateJWT = (req, res, next) => {
    const token = req.header('Authorization')?.split(' ')[1];
    
    if (token) {
      jwt.verify(token, 'your_jwt_secret_key', (err, user) => {
        if (err) {
          console.error('JWT verification error:', err);
          return res.sendStatus(403);
        }
        req.user = user;
        next();
      });
    } else {
      res.sendStatus(401);
    }
  };  

// Routes
app.post('/register', async (req, res) => {
    try {
      const { username, password } = req.body;
  
      // Validate input
      if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
      }
  
      // Check if user already exists
      const [existingUser] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
      if (existingUser.length > 0) {
        return res.status(400).json({ message: 'User already exists' });
      }
  
      // Hash password and insert new user
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hashedPassword]);
  
      res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
      console.error('Error inserting user into database:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  
  

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    // Select the user based on the username
    db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
      if (err) return res.status(500).send('Error retrieving user');
      
      // Check if any user was found
      if (results.length === 0) return res.status(401).send('Invalid credentials');
      
      const user = results[0];
      
      // Compare the input password with the hashed password in the database
      bcrypt.compare(password, user.password_hash, (err, isMatch) => {
        if (err) return res.status(500).send('Error comparing passwords');
        if (!isMatch) return res.status(401).send('Invalid credentials');
        
        // Generate and return a JWT token if password matches
        const token = jwt.sign({ id: user.user_id }, 'your_jwt_secret_key');
        res.json({ token });
      });
    });
  });
  

// Publicly accessible endpoint
app.get('/listings', (req, res) => {
  db.query('SELECT * FROM listings', (err, results) => {
    if (err) return res.status(500).send('Error retrieving listings');
    res.json(results);
  });
});

app.get('/listing/:id', (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM listings WHERE listing_id = ?', [id], (err, results) => {
      if (err) return res.status(500).send('Error retrieving listing');
      if (results.length === 0) return res.status(404).send('Listing not found');
      res.json(results[0]);
    });
  });

app.post('/listing', authenticateJWT, (req, res) => {
  const { title, description, price } = req.body;
  db.query('INSERT INTO listings (title, description, price) VALUES (?, ?, ?)', [title, description, price], (err, result) => {
    if (err) return res.status(500).send('Error creating listing');
    const newListing = { id: result.insertId, title, description, price };
    io.emit('new_listing', newListing);  // Emit event to WebSocket clients
    res.status(201).json(newListing);
  });
});

app.put('/listing/:id', authenticateJWT, (req, res) => {
  const { id } = req.params;
  const { title, description, price } = req.body;
  db.query('UPDATE listings SET title = ?, description = ?, price = ? WHERE id = ?', [title, description, price, id], (err) => {
    if (err) return res.status(500).send('Error updating listing');
    res.send('Listing updated');
  });
});

app.delete('/listing/:id', authenticateJWT, (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM listings WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).send('Error deleting listing');
    res.send('Listing deleted');
  });
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('New client connected');
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

server.listen(5000, () => {
  console.log('Server running on port 5000');
});
