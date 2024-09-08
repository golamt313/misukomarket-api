const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const cors = require('cors');
app.use(cors({
  origin: ['http://mitsukomarket.s3-website.eu-north-1.amazonaws.com', 'http://localhost:3000']
}));

app.use(express.json());

// Database connection
const db = mysql.createPool({
  host: 'database-2.cvmk6i0u8fqm.eu-north-1.rds.amazonaws.com',
  user: 'admin',
  password: 'Hn4fZGQvvW6u75g',
  database: 'mmdb',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
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

// Utility function to generate a random username
const generateRandomUsername = () => {
    const randomNumber = Math.floor(Math.random() * 10000000000); // Generates a random number with up to 10 digits
    return `user-${randomNumber}`;
};
  

// Routes
app.post('/register', async (req, res) => {
    try {
      const { email, password } = req.body;
  
      console.log('Received data:', { email, password });
  
      // Validate input
      if (!email || !password) {
        console.error('Validation error: Email and password are required');
        return res.status(400).json({ message: 'Email and password are required' });
      }
  
      // Generate a random username
      const generatedUsername = generateRandomUsername();
  
      // Check if user already exists
      const [existingUser] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      if (existingUser.length > 0) {
        console.error('User already exists with email:', email);
        return res.status(400).json({ message: 'User already exists' });
      }
  
      // Hash password and insert new user
      const hashedPassword = await bcrypt.hash(password, 10);
      const [result] = await db.query('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [generatedUsername, email, hashedPassword]);
  
      // Generate JWT token
      const token = jwt.sign({ id: result.insertId }, 'your_jwt_secret_key', { expiresIn: '1h' });
  
      // Return JWT token
      res.status(201).json({ message: 'User registered successfully', token });
    } catch (error) {
      console.error('Error inserting user into database:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });


  app.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // Validate input
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }
  
      // Fetch user from database
      const [user] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      if (user.length === 0) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
  
      // Verify password
      const isMatch = await bcrypt.compare(password, user[0].password_hash);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
  
      // Generate JWT token
      const token = jwt.sign({ userId: user[0].id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  
      // Respond with token and username
      res.json({
        token,
        username: user[0].username
      });
    } catch (error) {
      console.error('Error logging in:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

// Publicly accessible endpoint
app.get('/listings', async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM listings');
    res.json(results);
  } catch (err) {
    console.error('Error retrieving listings:', err);
    res.status(500).send('Error retrieving listings');
  }
});

app.get('/listing/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const [results] = await db.query('SELECT * FROM listings WHERE listing_id = ?', [id]);
      if (results.length === 0) return res.status(404).send('Listing not found');
      res.json(results[0]);
    } catch (err) {
      console.error('Error retrieving listing:', err);
      res.status(500).send('Error retrieving listing');
    }
  });

app.post('/listing', authenticateJWT, async (req, res) => {
  const { title, description, price } = req.body;
  try {
    const [result] = await db.query('INSERT INTO listings (title, description, price) VALUES (?, ?, ?)', [title, description, price]);
    const newListing = { id: result.insertId, title, description, price };
    io.emit('new_listing', newListing);  // Emit event to WebSocket clients
    res.status(201).json(newListing);
  } catch (err) {
    console.error('Error creating listing:', err);
    res.status(500).send('Error creating listing');
  }
});

app.put('/listing/:id', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  const { title, description, price } = req.body;
  try {
    await db.query('UPDATE listings SET title = ?, description = ?, price = ? WHERE listing_id = ?', [title, description, price, id]);
    res.send('Listing updated');
  } catch (err) {
    console.error('Error updating listing:', err);
    res.status(500).send('Error updating listing');
  }
});

app.delete('/listing/:id', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM listings WHERE listing_id = ?', [id]);
    res.send('Listing deleted');
  } catch (err) {
    console.error('Error deleting listing:', err);
    res.status(500).send('Error deleting listing');
  }
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
