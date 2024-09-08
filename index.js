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
  return `user-${crypto.randomBytes(5).toString('hex')}`;
};

// Routes
app.post('/register', async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // Validate input
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      // Generate a random username
      const username = generateRandomUsername();
  
      // Check if user already exists
      const [existingUser] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      if (existingUser.length > 0) {
        return res.status(400).json({ message: 'User already exists' });
      }
  
      // Hash password and insert new user
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.query('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, hashedPassword]);
  
      res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
      console.error('Error inserting user into database:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
      // Select the user based on the email
      const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
      
      // Check if any user was found
      if (results.length === 0) return res.status(401).send('Invalid credentials');
      
      const user = results[0];
      
      // Compare the input password with the hashed password in the database
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) return res.status(401).send('Invalid credentials');
      
      // Generate and return a JWT token if password matches
      const token = jwt.sign({ id: user.user_id }, 'your_jwt_secret_key');
      res.json({ token });
    } catch (error) {
      console.error('Error logging in:', error);
      res.status(500).send('Internal server error');
    }
  });

// Publicly accessible endpoint
app.get('/listings', async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM listings');
    res.json(results);
  } catch (err) {
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
    res.status(500).send('Error updating listing');
  }
});

app.delete('/listing/:id', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM listings WHERE listing_id = ?', [id]);
    res.send('Listing deleted');
  } catch (err) {
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
