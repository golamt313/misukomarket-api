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
  origin: 'http://mitsukomarket.s3-website.eu-north-1.amazonaws.com'
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
  if (err) {
    console.error('Error connecting to MySQL database:', err);
    process.exit(1); // Exit if unable to connect to the database
  }
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
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      console.error('Error hashing password:', err);
      return res.status(500).send('Error hashing password');
    }
    db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], (err, result) => {
      if (err) {
        console.error('Error registering user:', err);
        return res.status(500).send('Error registering user');
      }
      res.status(201).send('User registered');
    });
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
    if (err) {
      console.error('Error retrieving user:', err);
      return res.status(500).send('Error retrieving user');
    }
    if (results.length === 0) return res.status(401).send('Invalid credentials');
    const user = results[0];
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        console.error('Error comparing passwords:', err);
        return res.status(500).send('Error comparing passwords');
      }
      if (!isMatch) return res.status(401).send('Invalid credentials');
      const token = jwt.sign({ id: user.id }, 'your_jwt_secret_key');
      res.json({ token });
    });
  });
});

app.get('/listings', authenticateJWT, (req, res) => {
  db.query('SELECT * FROM listings', (err, results) => {
    if (err) {
      console.error('Error retrieving listings:', err);
      return res.status(500).send('Error retrieving listings');
    }
    console.log('Listings retrieved:', results); // Debugging: log retrieved listings
    res.json(results);
  });
});

app.post('/listing', authenticateJWT, (req, res) => {
  const { title, description, price } = req.body;
  db.query('INSERT INTO listings (title, description, price) VALUES (?, ?, ?)', [title, description, price], (err, result) => {
    if (err) {
      console.error('Error creating listing:', err);
      return res.status(500).send('Error creating listing');
    }
    const newListing = { id: result.insertId, title, description, price };
    io.emit('new_listing', newListing);  // Emit event to WebSocket clients
    console.log('New listing created:', newListing); // Debugging: log new listing
    res.status(201).json(newListing);
  });
});

app.put('/listing/:id', authenticateJWT, (req, res) => {
  const { id } = req.params;
  const { title, description, price } = req.body;
  db.query('UPDATE listings SET title = ?, description = ?, price = ? WHERE id = ?', [title, description, price, id], (err) => {
    if (err) {
      console.error('Error updating listing:', err);
      return res.status(500).send('Error updating listing');
    }
    console.log('Listing updated:', id); // Debugging: log updated listing
    res.send('Listing updated');
  });
});

app.delete('/listing/:id', authenticateJWT, (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM listings WHERE id = ?', [id], (err) => {
    if (err) {
      console.error('Error deleting listing:', err);
      return res.status(500).send('Error deleting listing');
    }
    console.log('Listing deleted:', id); // Debugging: log deleted listing
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
