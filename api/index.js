const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const User = require('./models/User');
const Post = require('./models/Post');
const app = express();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const uploadMiddleware = multer({ dest: 'uploads/' });
const fs = require('fs');

const salt = bcrypt.genSaltSync(10);
const secret = 'ouoi654onodsaqgs';

app.use(cors({ credentials: true, origin: 'http://localhost:3000' }));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(__dirname + '/uploads'));

mongoose.connect('mongodb+srv://mesaravi2003:Kanth2003@cluster0.hpyvrf1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((error) => {
    console.error('Error connecting to MongoDB:', error);
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.create({
      username,
      password: bcrypt.hashSync(password, salt),
    });
    res.json(userDoc);
  } catch (e) {
    console.log(e);
    res.status(400).json(e);
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.findOne({ username });
    if (!userDoc) {
      return res.status(400).json('User not found');
    }
    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign({ username, id: userDoc._id }, secret, {}, (err, token) => {
        if (err) throw err;
        res.cookie('token', token).json({
          id: userDoc._id,
          username,
        });
      });
    } else {
      res.status(400).json('wrong credentials');
    }
  } catch (e) {
    console.log(e);
    res.status(500).json('Internal server error');
  }
});

app.get('/profile', (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, secret, {}, (err, info) => {
    if (err) {
      console.error(err);
      return res.status(401).json('Invalid token');
    }
    res.json(info);
  });
});

app.post('/logout', (req, res) => {
  res.cookie('token', '').json('ok');
});

app.post('/post', uploadMiddleware.single('file'), async (req, res) => {
  try {
    const { originalname, path } = req.file;
    const parts = originalname.split('.');
    const ext = parts[parts.length - 1];
    const newPath = path + '.' + ext;
    fs.renameSync(path, newPath);

    const { token } = req.cookies;
    jwt.verify(token, secret, {}, async (err, info) => {
      if (err) {
        console.error(err);
        return res.status(401).json('Invalid token');
      }
      const { title, summary, content } = req.body;
      const postDoc = await Post.create({
        title,
        summary,
        content,
        cover: newPath,
        author: info.id,
      });
      res.json(postDoc);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create post', error: err.message });
  }
});

app.put('/post', uploadMiddleware.single('file'), async (req, res) => {
  try {
    let newPath = null;
    if (req.file) {
      const { originalname, path } = req.file;
      const parts = originalname.split('.');
      const ext = parts[parts.length - 1];
      newPath = path + '.' + ext;
      fs.renameSync(path, newPath);
    }

    const { token } = req.cookies;
    jwt.verify(token, secret, {}, async (err, info) => {
      if (err) {
        return res.status(401).json({ message: 'Invalid token' });
      }
      const { id, title, summary, content } = req.body;
      const postDoc = await Post.findById(id);
      if (!postDoc) {
        return res.status(404).json({ message: 'Post not found' });
      }
      if (postDoc.author.toString() !== info.id) {
        return res.status(403).json({ message: 'You are not authorized to edit this post' });
      }
      const updatedPost = await Post.findByIdAndUpdate(id, {
        title,
        summary,
        content,
        cover: newPath ? newPath : postDoc.cover,
      }, { new: true });
      res.json(updatedPost);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update post', error: err.message });
  }
});

app.get('/post', async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('author', ['username'])
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch posts', error: err.message });
  }
});

app.get('/post/:id', async (req, res) => {
  console.log('Fetching post with ID:', req.params.id);
  try {
    const { id } = req.params;
    console.log('Searching for post with ID:', id);
    
    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log('Invalid ID format');
      return res.status(400).json({ message: 'Invalid post ID format' });
    }

    // First, try to find the post without populate
    let postDoc = await Post.findById(id);
    console.log('Post found:', postDoc ? 'Yes' : 'No');

    if (!postDoc) {
      console.log('Post not found, sending 404');
      return res.status(404).json({ message: 'Post not found' });
    }

    // If post is found, try to populate author
    try {
      postDoc = await Post.findById(id).populate('author', ['username']);
      console.log('Author populated successfully');
    } catch (populateError) {
      console.error('Error populating author:', populateError);
      // Continue with unpopulated post if populate fails
    }

    console.log('Sending post data');
    res.json(postDoc);
  } catch (err) {
    console.error('Error in /post/:id route:', err);
    if (err.name === 'CastError') {
      console.error('Invalid ID format:', err);
      return res.status(400).json({ message: 'Invalid post ID format' });
    }
    res.status(500).json({ message: 'Failed to fetch post', error: err.message });
  }
});

app.listen(4000, () => {
  console.log('Server running on port 4000');
});
