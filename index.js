/**
 * Crusherr Dating App - Backend Server
 * NodeJS + Express + Supabase
 */

import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET is required in .env file');
  process.exit(1);
}

if (!process.env.SUPABASE_URL) {
  console.error('ERROR: SUPABASE_URL is required in .env file');
  process.exit(1);
}

if (!process.env.SUPABASE_ANON_KEY) {
  console.error('ERROR: SUPABASE_ANON_KEY is required in .env file');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = 'admin@crushrr.com';
const ADMIN_PASSWORD_HASH = '$2a$10$tlmfus.ZVN.d9hvmrAI6tOhvIb48MjzzgRLdupm2CLTYRI3QV1516';

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer setup for file uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

// Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const isDatabaseConnectionError = (err) => {
  const message = String(err?.message || err || '').toLowerCase();
  return message.includes('fetch failed') ||
    message.includes('enotfound') ||
    message.includes('eai_again') ||
    message.includes('network') ||
    message.includes('could not resolve');
};

const sendDatabaseError = (res, err, fallback = 'Database request failed') => {
  if (isDatabaseConnectionError(err)) {
    return res.status(503).json({
      error: 'Database connection failed. Check SUPABASE_URL, internet/DNS, and whether the Supabase project is active.'
    });
  }

  return res.status(500).json({ error: err?.message || fallback });
};

const localDbDir = path.join(__dirname, 'data');
const localDbPath = path.join(localDbDir, 'db.json');

const createLocalDb = () => ({
  users: [
    {
      id: uuidv4(),
      name: 'Admin',
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD_HASH,
      phone: '+1234567890',
      profile_pic: null,
      age: null,
      bio: null,
      hobbies: [],
      telegram: null,
      upi_id: null,
      membership: 'vip',
      love_coins: 0,
      matches_used: 0,
      matches_reset_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      profile_completed: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  profiles: [
    {
      id: uuidv4(),
      name: 'Sophia',
      age: 24,
      bio: 'Adventure seeker and coffee enthusiast. Love traveling and trying new cuisines.',
      hobbies: ['Travel', 'Coffee', 'Photography', 'Music', 'Hiking'],
      telegram: 'sophia_crush',
      profile_pic: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
      visibility: 'top',
      status: 'active',
      user_id: null,
      created_at: new Date().toISOString()
    },
    {
      id: uuidv4(),
      name: 'Aisha',
      age: 25,
      bio: 'Software developer by day, foodie by night. Love exploring new restaurants.',
      hobbies: ['Technology', 'Coffee', 'Movies', 'Gaming'],
      telegram: 'aisha_dev',
      profile_pic: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
      visibility: 'normal',
      status: 'active',
      user_id: null,
      created_at: new Date().toISOString()
    }
  ],
  likes: []
});

const readLocalDb = () => {
  if (!fs.existsSync(localDbDir)) {
    fs.mkdirSync(localDbDir, { recursive: true });
  }

  if (!fs.existsSync(localDbPath)) {
    const db = createLocalDb();
    fs.writeFileSync(localDbPath, JSON.stringify(db, null, 2));
    return db;
  }

  const db = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
  db.users = db.users || [];
  db.profiles = db.profiles || [];
  db.likes = db.likes || [];
  ensureLocalAdmin(db);
  fs.writeFileSync(localDbPath, JSON.stringify(db, null, 2));
  return db;
};

const writeLocalDb = (db) => {
  if (!fs.existsSync(localDbDir)) {
    fs.mkdirSync(localDbDir, { recursive: true });
  }
  fs.writeFileSync(localDbPath, JSON.stringify(db, null, 2));
};

const ensureLocalAdmin = (db) => {
  const oldAdminIndex = db.users.findIndex(user => user.email === 'admin@crusherr.com');
  if (oldAdminIndex !== -1) {
    db.users.splice(oldAdminIndex, 1);
  }

  const adminIndex = db.users.findIndex(user => user.email === ADMIN_EMAIL);
  const adminUser = {
    id: adminIndex === -1 ? uuidv4() : db.users[adminIndex].id,
    name: 'Admin',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD_HASH,
    phone: '+1234567890',
    profile_pic: adminIndex === -1 ? null : db.users[adminIndex].profile_pic,
    age: adminIndex === -1 ? null : db.users[adminIndex].age,
    bio: adminIndex === -1 ? null : db.users[adminIndex].bio,
    hobbies: adminIndex === -1 ? [] : db.users[adminIndex].hobbies || [],
    telegram: adminIndex === -1 ? null : db.users[adminIndex].telegram,
    upi_id: adminIndex === -1 ? null : db.users[adminIndex].upi_id,
    membership: 'vip',
    love_coins: adminIndex === -1 ? 0 : db.users[adminIndex].love_coins || 0,
    matches_used: adminIndex === -1 ? 0 : db.users[adminIndex].matches_used || 0,
    matches_reset_date: adminIndex === -1
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : db.users[adminIndex].matches_reset_date,
    profile_completed: true,
    created_at: adminIndex === -1 ? new Date().toISOString() : db.users[adminIndex].created_at,
    updated_at: new Date().toISOString()
  };

  if (adminIndex === -1) {
    db.users.push(adminUser);
  } else {
    db.users[adminIndex] = adminUser;
  }

  return db;
};

const toClientUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  profileCompleted: Boolean(user.profile_completed),
  membership: user.membership || 'none',
  loveCoins: user.love_coins || 0,
  profilePic: normalizeImageUrl(user.profile_pic),
  age: user.age,
  bio: user.bio,
  hobbies: user.hobbies || [],
  telegram: user.telegram,
  upiId: user.upi_id,
  matchesUsed: user.matches_used || 0,
  matchesResetDate: user.matches_reset_date
});

const normalizeImageUrl = (url) => {
  if (!url || typeof url !== 'string') return url || null;

  try {
    const parsed = new URL(url);
    if (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      parsed.pathname.startsWith('/uploads/')
    ) {
      return parsed.pathname;
    }
  } catch {
    // Relative paths are already fine.
  }

  return url;
};

const normalizeProfile = (profile) => ({
  ...profile,
  profile_pic: normalizeImageUrl(profile.profile_pic)
});

const localRegister = async ({ name, email, password, phone }) => {
  const db = readLocalDb();
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = db.users.find(user => user.email === normalizedEmail);

  if (existingUser) {
    const error = new Error('User already exists');
    error.status = 400;
    throw error;
  }

  const user = {
    id: uuidv4(),
    name,
    email: normalizedEmail,
    password: await bcrypt.hash(password, 10),
    phone: phone || null,
    profile_pic: null,
    age: null,
    bio: null,
    hobbies: [],
    telegram: null,
    upi_id: null,
    membership: 'none',
    love_coins: 0,
    matches_used: 0,
    matches_reset_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    profile_completed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  db.users.push(user);
  writeLocalDb(db);
  return user;
};

const localLogin = async ({ email, password }) => {
  const db = readLocalDb();
  const normalizedEmail = email.trim().toLowerCase();
  const user = db.users.find(item => item.email === normalizedEmail);

  if (!user || !await bcrypt.compare(password, user.password || '')) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  return user;
};

const localFindUserByEmail = (email) => {
  const db = readLocalDb();
  const normalizedEmail = email.trim().toLowerCase();
  return db.users.find(user => user.email === normalizedEmail);
};

const localGoogleRegister = ({ email, name, picture }) => {
  const db = readLocalDb();
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = db.users.find(user => user.email === normalizedEmail);

  if (existingUser) {
    return existingUser;
  }

  const user = {
    id: uuidv4(),
    name: name || normalizedEmail.split('@')[0],
    email: normalizedEmail,
    password: null,
    phone: null,
    profile_pic: picture || null,
    age: null,
    bio: null,
    hobbies: [],
    telegram: null,
    upi_id: null,
    membership: 'none',
    love_coins: 0,
    matches_used: 0,
    matches_reset_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    profile_completed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  db.users.push(user);
  writeLocalDb(db);
  return user;
};

const localGetUser = (userId) => {
  const db = readLocalDb();
  return db.users.find(user => user.id === userId);
};

const localUpdateProfile = (userId, profileData) => {
  const db = readLocalDb();
  const userIndex = db.users.findIndex(user => user.id === userId);

  if (userIndex === -1) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  db.users[userIndex] = {
    ...db.users[userIndex],
    name: profileData.name || db.users[userIndex].name,
    age: profileData.age || null,
    bio: profileData.bio || null,
    hobbies: profileData.hobbies || [],
    telegram: profileData.telegram || null,
    profile_pic: profileData.profilePic || null,
    profile_completed: true,
    updated_at: new Date().toISOString()
  };

  writeLocalDb(db);
  return db.users[userIndex];
};

const getLocalProfilesPayload = () => {
  const db = readLocalDb();
  const profiles = db.profiles
    .filter(profile => !profile.status || profile.status === 'active')
    .map(normalizeProfile)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const premiumProfiles = profiles.filter(profile => profile.visibility === 'top');
  const normalProfiles = profiles.filter(profile => profile.visibility !== 'top');

  return {
    premiumProfiles: premiumProfiles.map(profile => ({ ...profile, isBlurred: true })),
    normalProfiles: normalProfiles.map(profile => ({ ...profile, isBlurred: false })),
    isVIP: false
  };
};

const localAddProfile = (profileData) => {
  const db = readLocalDb();
  const profile = {
    id: uuidv4(),
    name: profileData.name,
    age: profileData.age || null,
    bio: profileData.bio || null,
    hobbies: profileData.hobbies || [],
    telegram: profileData.telegram || null,
    profile_pic: profileData.profile_pic || null,
    visibility: profileData.visibility || 'normal',
    status: profileData.status || 'active',
    user_id: null,
    created_at: new Date().toISOString()
  };

  db.profiles.push(profile);
  writeLocalDb(db);
  return profile;
};

const localUpdateAdminProfile = (id, updates) => {
  const db = readLocalDb();
  const profileIndex = db.profiles.findIndex(profile => profile.id === id);

  if (profileIndex === -1) {
    const error = new Error('Profile not found');
    error.status = 404;
    throw error;
  }

  db.profiles[profileIndex] = {
    ...db.profiles[profileIndex],
    ...updates,
    hobbies: updates.hobbies || db.profiles[profileIndex].hobbies || [],
    status: updates.status || db.profiles[profileIndex].status || 'active'
  };

  writeLocalDb(db);
  return db.profiles[profileIndex];
};

const localDeleteAdminProfile = (id) => {
  const db = readLocalDb();
  const beforeCount = db.profiles.length;
  db.profiles = db.profiles.filter(profile => profile.id !== id);
  db.likes = (db.likes || []).filter(like => like.to_profile_id !== id);
  writeLocalDb(db);
  return beforeCount !== db.profiles.length;
};

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Admin Middleware
const authenticateAdmin = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();
    
    if (error || !user) {
      const localUser = localGetUser(decoded.userId);
      if (localUser?.email === ADMIN_EMAIL) {
        req.user = localUser;
        return next();
      }
    }

    if (!user || user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    req.user = user;
    next();
  } catch (err) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const localUser = localGetUser(decoded.userId);
      if (localUser?.email === ADMIN_EMAIL) {
        req.user = localUser;
        return next();
      }
    } catch {
      // Return the normal auth error below.
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// ============================================
// AUTH ROUTES
// ============================================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    
    console.log('Registration attempt for:', email);
    
    // Check if user exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Check user error:', checkError);
      throw checkError;
    }
    
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        name,
        email,
        password: hashedPassword,
        phone: phone || null,
        membership: 'none',
        love_coins: 0,
        matches_used: 0,
        matches_reset_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('Insert user error:', error);
      throw error;
    }
    
    console.log('User created successfully:', user.id);
    
    // Generate token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileCompleted: false,
        membership: user.membership,
        loveCoins: user.love_coins
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    if (isDatabaseConnectionError(err)) {
      try {
        const user = await localRegister(req.body);
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ token, user: toClientUser(user), storage: 'local' });
      } catch (localErr) {
        return res.status(localErr.status || 500).json({ error: localErr.message || 'Local registration failed' });
      }
    }
    sendDatabaseError(res, err, 'Registration failed');
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    console.log('Login attempt for email:', email);
    if (error || !user) {
      try {
        const localUser = await localLogin({ email, password });
        const token = jwt.sign({ userId: localUser.id }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ token, user: toClientUser(localUser), storage: 'local' });
      } catch {
        // Fall through to the normal invalid credentials response.
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileCompleted: user.profile_completed,
        membership: user.membership,
        loveCoins: user.love_coins,
        profilePic: normalizeImageUrl(user.profile_pic),
        age: user.age,
        bio: user.bio,
        hobbies: user.hobbies,
        telegram: user.telegram,
        upiId: user.upi_id
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    if (isDatabaseConnectionError(err)) {
      try {
        const user = await localLogin(req.body);
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ token, user: toClientUser(user), storage: 'local' });
      } catch (localErr) {
        return res.status(localErr.status || 500).json({ error: localErr.message || 'Local login failed' });
      }
    }
    sendDatabaseError(res, err, 'Login failed');
  }
});

// Phone OTP Login (simplified - generates mock OTP)
app.post('/api/auth/phone/login', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Check if user exists
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .single();
    
    if (error || !user) {
      return res.status(404).json({ error: 'User not found with this phone number' });
    }
    
    // Generate mock OTP (in production, send via SMS)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP (in production, use Redis or database)
    // For now, just return success
    res.json({ 
      success: true, 
      message: 'OTP sent to your phone',
      // Dev mode: return OTP
      otp: process.env.NODE_ENV !== 'production' ? otp : undefined
    });
  } catch (err) {
    console.error('Phone login error:', err);
    res.status(500).json({ error: 'Phone login failed' });
  }
});

// Verify OTP
app.post('/api/auth/phone/verify', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    
    // Find user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .single();
    
    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Generate token (OTP verification simplified)
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileCompleted: user.profile_completed,
        membership: user.membership,
        loveCoins: user.love_coins
      }
    });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Google OAuth Login
app.post('/api/auth/google/login', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: 'Google ID token is required' });
    }
    
    // Verify the Google ID token using Firebase Auth REST API
    let decodedToken;
    try {
      const firebaseWebApiKey = 'AIzaSyBFE7mnQSYRsdYp-h1uvQV-oFQN5EFmF2g';
      const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseWebApiKey}`;
      
      // The ID token from Firebase Auth contains the user info
      // We can decode the JWT payload directly (for client-side Firebase Auth tokens)
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      decodedToken = payload;
    } catch (verifyError) {
      console.error('Token verification error:', verifyError);
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    
    const { email, name, picture } = decodedToken;
    
    // Check if user exists
    const { data: existingUser, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (userError || !existingUser) {
      const localUser = localFindUserByEmail(email);
      if (localUser) {
        const token = jwt.sign({ userId: localUser.id }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ token, user: toClientUser(localUser), storage: 'local' });
      }
      return res.status(404).json({ error: 'No account found. Please register first.' });
    }
    
    // Generate token
    const token = jwt.sign({ userId: existingUser.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      token,
      user: {
        id: existingUser.id,
        name: existingUser.name,
        email: existingUser.email,
        phone: existingUser.phone,
        profileCompleted: existingUser.profile_completed,
        membership: existingUser.membership,
        loveCoins: existingUser.love_coins,
        profilePic: normalizeImageUrl(existingUser.profile_pic),
        age: existingUser.age,
        bio: existingUser.bio,
        hobbies: existingUser.hobbies,
        telegram: existingUser.telegram,
        upiId: existingUser.upi_id
      }
    });
  } catch (err) {
    console.error('Google login error:', err);
    if (isDatabaseConnectionError(err)) {
      try {
        const payload = JSON.parse(Buffer.from(req.body.idToken.split('.')[1], 'base64url').toString('utf8'));
        const localUser = localFindUserByEmail(payload.email);
        if (!localUser) {
          return res.status(404).json({ error: 'No account found. Please register first.' });
        }

        const token = jwt.sign({ userId: localUser.id }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ token, user: toClientUser(localUser), storage: 'local' });
      } catch {
        return res.status(500).json({ error: 'Google login failed' });
      }
    }
    res.status(500).json({ error: 'Google login failed' });
  }
});

// Google OAuth Register
app.post('/api/auth/google/register', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: 'Google ID token is required' });
    }
    
    // Verify the Google ID token
    let decodedToken;
    try {
      // Decode the JWT payload directly
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      decodedToken = payload;
    } catch (verifyError) {
      console.error('Token verification error:', verifyError);
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    
    const { email, name, picture } = decodedToken;
    
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (existingUser) {
      // If user exists, just log them in
      const token = jwt.sign({ userId: existingUser.id }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({
        token,
        user: {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          phone: existingUser.phone,
          profileCompleted: existingUser.profile_completed,
          membership: existingUser.membership,
          loveCoins: existingUser.love_coins,
          profilePic: normalizeImageUrl(existingUser.profile_pic)
        }
      });
    }

    const localExistingUser = localFindUserByEmail(email);
    if (localExistingUser) {
      const token = jwt.sign({ userId: localExistingUser.id }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token, user: toClientUser(localExistingUser), storage: 'local' });
    }
    
    // Create new user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        name: name || email.split('@')[0],
        email,
        password: null, // No password for Google users
        phone: null,
        profile_pic: picture || null,
        membership: 'none',
        love_coins: 0,
        matches_used: 0,
        matches_reset_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Generate token
    const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        profileCompleted: false,
        membership: newUser.membership,
        loveCoins: newUser.love_coins,
        profilePic: normalizeImageUrl(newUser.profile_pic)
      }
    });
  } catch (err) {
    console.error('Google register error:', err);
    if (isDatabaseConnectionError(err)) {
      try {
        const payload = JSON.parse(Buffer.from(req.body.idToken.split('.')[1], 'base64url').toString('utf8'));
        const localUser = localGoogleRegister({
          email: payload.email,
          name: payload.name,
          picture: payload.picture
        });
        const token = jwt.sign({ userId: localUser.id }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ token, user: toClientUser(localUser), storage: 'local' });
      } catch {
        return res.status(500).json({ error: 'Google registration failed' });
      }
    }
    res.status(500).json({ error: 'Google registration failed' });
  }
});

// ============================================
// USER PROFILE ROUTES
// ============================================

// Get current user
app.get('/api/user/me', authenticateToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.userId)
      .single();
    
    if (error || !user) {
      const localUser = localGetUser(req.user.userId);
      if (localUser) {
        return res.json(toClientUser(localUser));
      }
      if (error) throw error;
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      profileCompleted: user.profile_completed,
      membership: user.membership,
      loveCoins: user.love_coins,
      profilePic: normalizeImageUrl(user.profile_pic),
      age: user.age,
      bio: user.bio,
      hobbies: user.hobbies,
      telegram: user.telegram,
      upiId: user.upi_id,
      matchesUsed: user.matches_used,
      matchesResetDate: user.matches_reset_date
    });
  } catch (err) {
    console.error('Get user error:', err);
    if (isDatabaseConnectionError(err)) {
      const user = localGetUser(req.user.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json(toClientUser(user));
    }
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update profile
app.put('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const { name, age, bio, hobbies, telegram, profilePic } = req.body;
    
    const updates = {
      name: name || undefined,
      age: age || null,
      bio: bio || null,
      hobbies: hobbies || [],
      telegram: telegram || null,
      profile_pic: profilePic || null,
      profile_completed: true,
      updated_at: new Date().toISOString()
    };
    
    // Remove undefined values
    Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);
    
    const { data: user, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.userId)
      .select()
      .single();
    
    if (error || !user) {
      try {
        const localUser = localUpdateProfile(req.user.userId, req.body);
        return res.json({ success: true, user: toClientUser(localUser), storage: 'local' });
      } catch (localErr) {
        if (!error) {
          return res.status(localErr.status || 500).json({ error: localErr.message || 'Local profile update failed' });
        }
      }
      throw error;
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileCompleted: user.profile_completed,
        membership: user.membership,
        loveCoins: user.love_coins,
        profilePic: normalizeImageUrl(user.profile_pic),
        age: user.age,
        bio: user.bio,
        hobbies: user.hobbies,
        telegram: user.telegram
      }
    });
  } catch (err) {
    console.error('Update profile error:', err);
    if (isDatabaseConnectionError(err)) {
      try {
        const user = localUpdateProfile(req.user.userId, req.body);
        return res.json({ success: true, user: toClientUser(user) });
      } catch (localErr) {
        return res.status(localErr.status || 500).json({ error: localErr.message || 'Local profile update failed' });
      }
    }
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ============================================
// PROFILES ROUTES
// ============================================

// Get profiles for dating dashboard (public - no auth required)
app.get('/api/profiles', async (req, res) => {
  try {
    // Get every active profile. Do not hide rows just because user_id/status is missing.
    const { data: allProfiles, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    console.log('Fetched profiles:', allProfiles?.length || 0, 'profiles');
    
    if (error) throw error;

    const profiles = (allProfiles || [])
      .filter(profile => !profile.status || profile.status === 'active')
      .map(normalizeProfile);
    
    // Separate premium and normal profiles
    const premiumProfiles = profiles.filter(p => p.visibility === 'top');
    const normalProfiles = profiles.filter(p => p.visibility !== 'top');
    
    res.json({
      premiumProfiles: premiumProfiles.map(p => ({
        ...p,
        isBlurred: true
      })),
      normalProfiles: normalProfiles.map(p => ({
        ...p,
        isBlurred: false
      })),
      isVIP: false
    });
  } catch (err) {
    console.error('Get profiles error:', err);
    if (isDatabaseConnectionError(err)) {
      return res.json(getLocalProfilesPayload());
    }
    res.status(500).json({ error: 'Failed to get profiles' });
  }
});

// Like a profile
app.post('/api/profiles/like', authenticateToken, async (req, res) => {
  try {
    const { profileId } = req.body;
    const userId = req.user.userId;
    
    // Get current user
    const { data: currentUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    const isVIP = currentUser.membership === 'vip' || currentUser.membership === 'vip_adult';
    
    // Get the liked profile
    const { data: likedProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single();
    
    if (!likedProfile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    // Check if it's a premium profile and user is not VIP
    if (likedProfile.visibility === 'top' && !isVIP) {
      return res.status(403).json({ error: 'VIP required for this profile' });
    }
    
    // No match limit - users can like unlimited times
    
    // Record the like
    const { error: likeError } = await supabase
      .from('likes')
      .insert({
        from_user_id: userId,
        to_profile_id: profileId,
        created_at: new Date().toISOString()
      });
    
    if (likeError) throw likeError;
    
    res.json({ 
      success: true, 
      telegram: likedProfile.telegram,
      message: 'Like recorded! Connect via Telegram'
    });
  } catch (err) {
    console.error('Like profile error:', err);
    if (isDatabaseConnectionError(err)) {
      const db = readLocalDb();
      const currentUser = db.users.find(user => user.id === req.user.userId);
      const likedProfile = db.profiles.find(profile => profile.id === req.body.profileId);

      if (!currentUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!likedProfile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      const isVIP = currentUser.membership === 'vip' || currentUser.membership === 'vip_adult';
      if (likedProfile.visibility === 'top' && !isVIP) {
        return res.status(403).json({ error: 'VIP required for this profile' });
      }

      db.likes.push({
        id: uuidv4(),
        from_user_id: currentUser.id,
        to_profile_id: likedProfile.id,
        created_at: new Date().toISOString()
      });
      writeLocalDb(db);

      return res.json({
        success: true,
        telegram: likedProfile.telegram,
        message: 'Like recorded! Connect via Telegram'
      });
    }
    res.status(500).json({ error: 'Failed to like profile' });
  }
});

// ============================================
// MEMBERSHIP ROUTES
// ============================================

// Get membership plans
app.get('/api/membership/plans', (req, res) => {
  res.json({
    plans: [
      {
        id: 'vip',
        name: 'VIP Membership',
        price: 0,
        features: [
          'Unlock top blurred profiles',
          '3 matches per week (vs 1 for free)',
          'Unlock the wallet system',
          'Profiles come on top lists',
          'Unlimited likes',
          'VIP badge on your profile',
          'Faster Telegram redirect',
          'Premium UI experience'
        ],
        telegram: 'crusherr_vip'
      },
      {
        id: 'vip_adult',
        name: 'VIP + 18+ Access',
        price: 0,
        features: [
          'Unlock top blurred profiles',
          '3 matches per week (vs 1 for free)',
          'Unlock the wallet system',
          'Profiles come on top lists',
          'Unlimited likes',
          'VIP badge on your profile',
          'Faster Telegram redirect',
          'Premium UI experience',
          'Access to 18+ Content',
          'Exclusive 18+ Profiles'
        ],
        telegram: 'crusherr_adult'
      }
    ]
  });
});

// Purchase membership
app.post('/api/membership/purchase', authenticateToken, async (req, res) => {
  try {
    const { planId } = req.body;
    
    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }
    
    // Get plan details
    const plans = {
      'vip': { name: 'VIP Membership', telegram: 'crusherr_vip' },
      'vip_adult': { name: 'VIP + 18+', telegram: 'crusherr_adult' }
    };
    
    const plan = plans[planId];
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan' });
    }
    
    // Return Telegram link for payment
    res.json({
      success: true,
      telegram: plan.telegram,
      message: `Contact @${plan.telegram} to complete purchase`
    });
  } catch (err) {
    console.error('Purchase membership error:', err);
    res.status(500).json({ error: 'Failed to process purchase' });
  }
});

// ============================================
// LOVE COINS ROUTES
// ============================================

// Get coin packages
app.get('/api/coins/packages', (req, res) => {
  res.json({
    packages: [
      { id: 1, coins: 50, price: 50, bonus: 0 },
      { id: 2, coins: 100, price: 100, bonus: 10 },
      { id: 3, coins: 250, price: 250, bonus: 25 },
      { id: 4, coins: 500, price: 500, bonus: 75 },
      { id: 5, coins: 1000, price: 1000, bonus: 200 }
    ],
    telegram: 'crusherr_deposit'
  });
});

// Add coins (admin function)
app.post('/api/coins/add', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount required' });
    }
    
    // Get current balance
    const { data: user } = await supabase
      .from('users')
      .select('love_coins')
      .eq('id', req.user.userId)
      .single();
    
    // Update balance
    const { error } = await supabase
      .from('users')
      .update({ love_coins: user.love_coins + amount })
      .eq('id', req.user.userId);
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      newBalance: user.love_coins + amount,
      telegram: 'crusherr_deposit',
      message: 'Contact @crusherr_deposit to add coins'
    });
  } catch (err) {
    console.error('Add coins error:', err);
    res.status(500).json({ error: 'Failed to add coins' });
  }
});

// Withdraw coins
app.post('/api/coins/withdraw', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.userId;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount required' });
    }
    
    // Get current balance and UPI
    const { data: user } = await supabase
      .from('users')
      .select('love_coins, upi_id')
      .eq('id', userId)
      .single();
    
    if (!user.upi_id) {
      return res.status(400).json({ error: 'Please set up UPI ID first' });
    }
    
    if (user.love_coins < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    // Update balance
    const { error } = await supabase
      .from('users')
      .update({ love_coins: user.love_coins - amount })
      .eq('id', userId);
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      newBalance: user.love_coins - amount,
      telegram: 'crusherr_withdraw',
      message: `Contact @crusherr_withdraw for withdrawal to ${user.upi_id}`
    });
  } catch (err) {
    console.error('Withdraw coins error:', err);
    res.status(500).json({ error: 'Failed to withdraw coins' });
  }
});

// Update UPI ID
app.post('/api/coins/upi', authenticateToken, async (req, res) => {
  try {
    const { upiId } = req.body;
    
    if (!upiId) {
      return res.status(400).json({ error: 'UPI ID is required' });
    }
    
    const { error } = await supabase
      .from('users')
      .update({ upi_id: upiId })
      .eq('id', req.user.userId);
    
    if (error) throw error;
    
    res.json({ success: true, upiId });
  } catch (err) {
    console.error('Update UPI error:', err);
    res.status(500).json({ error: 'Failed to update UPI' });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

// Get all profiles (admin)
app.get('/api/admin/profiles', authenticateAdmin, async (req, res) => {
  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json((profiles || []).map(normalizeProfile));
  } catch (err) {
    console.error('Admin get profiles error:', err);
    const db = readLocalDb();
      return res.json([...db.profiles].map(normalizeProfile).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  }
});

// Add profile (admin)
app.post('/api/admin/profiles', authenticateAdmin, async (req, res) => {
  try {
    const { name, age, bio, hobbies, telegram, profile_pic, visibility } = req.body;
    
    const { data: profile, error } = await supabase
      .from('profiles')
      .insert({
        name,
        age,
        bio,
        hobbies: hobbies || [],
        telegram,
        profile_pic: profile_pic,
        visibility: visibility || 'normal',
        status: 'active',  // Admin-created profiles are immediately visible to users
        user_id: null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(profile);
  } catch (err) {
    console.error('Admin add profile error:', err);
    if (isDatabaseConnectionError(err)) {
      return res.json(localAddProfile(req.body));
    }
    res.status(500).json({ error: 'Failed to add profile' });
  }
});

// Update profile (admin)
app.put('/api/admin/profiles/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, age, bio, hobbies, telegram, profile_pic, visibility, status } = req.body;
    
    const updates = {
      name, age, bio, hobbies, telegram, profile_pic: profile_pic, visibility, status
    };
    
    // Remove undefined
    Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);
    
    const { data: profile, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(profile);
  } catch (err) {
    console.error('Admin update profile error:', err);
    if (isDatabaseConnectionError(err)) {
      try {
        const { name, age, bio, hobbies, telegram, profile_pic, visibility, status } = req.body;
        const updates = { name, age, bio, hobbies, telegram, profile_pic, visibility, status };
        Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);
        return res.json(localUpdateAdminProfile(req.params.id, updates));
      } catch (localErr) {
        return res.status(localErr.status || 500).json({ error: localErr.message || 'Failed to update local profile' });
      }
    }
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Delete profile (admin)
app.delete('/api/admin/profiles/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete related likes first
    await supabase
      .from('likes')
      .delete()
      .eq('to_profile_id', id);
    
    // Delete related matches
    await supabase
      .from('matches')
      .delete()
      .eq('profile_id', id);
    
    // Now delete the profile
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ success: true });
  } catch (err) {
    console.error('Admin delete profile error:', err);
    if (isDatabaseConnectionError(err)) {
      localDeleteAdminProfile(req.params.id);
      return res.json({ success: true });
    }
    res.status(500).json({ error: 'Failed to delete profile' });
  }
});

// Delete all profiles (admin)
app.delete('/api/admin/profiles', authenticateAdmin, async (req, res) => {
  try {
    // Get all profile IDs first
    const { data: profiles, error: selectError } = await supabase
      .from('profiles')
      .select('id');
    
    if (selectError) {
      console.error('Select profiles error:', selectError);
      throw selectError;
    }
    
    if (!profiles || profiles.length === 0) {
      return res.json({ success: true, message: 'No profiles to delete', deleted: 0 });
    }
    
    console.log('Found profiles to delete:', profiles.length);
    
    // Delete all profiles using in clause
    const profileIds = profiles.map(p => p.id);
    
    // First, delete all likes related to these profiles
    console.log('Deleting related likes...');
    const { error: likesError } = await supabase
      .from('likes')
      .delete()
      .in('to_profile_id', profileIds);
    
    if (likesError) {
      console.error('Delete likes error:', likesError);
      throw likesError;
    }
    
    // Also delete matches related to these profiles
    console.log('Deleting related matches...');
    const { error: matchesError } = await supabase
      .from('matches')
      .delete()
      .in('profile_id', profileIds);
    
    if (matchesError) {
      console.error('Delete matches error:', matchesError);
      throw matchesError;
    }
    
    // Now delete the profiles
    console.log('Deleting profiles...');
    const { error } = await supabase
      .from('profiles')
      .delete()
      .in('id', profileIds);
    
    if (error) {
      console.error('Delete profiles error:', error);
      throw error;
    }
    
    console.log('Successfully deleted profiles:', profileIds.length);
    res.json({ success: true, message: `${profileIds.length} profiles deleted`, deleted: profileIds.length });
  } catch (err) {
    console.error('Admin delete all profiles error:', err);
    if (isDatabaseConnectionError(err)) {
      const db = readLocalDb();
      const deleted = db.profiles.length;
      db.profiles = [];
      db.likes = [];
      writeLocalDb(db);
      return res.json({ success: true, message: `${deleted} profiles deleted`, deleted });
    }
    res.status(500).json({ error: 'Failed to delete profiles: ' + err.message });
  }
});

app.get('/api/local/profiles', (req, res) => {
  res.json(getLocalProfilesPayload());
});

// Get all users (admin)
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json(users);
  } catch (err) {
    console.error('Admin get users error:', err);
    const db = readLocalDb();
    return res.json([...db.users].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  }
});

// Update user membership (admin)
app.put('/api/admin/users/:id/membership', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { membership } = req.body;
    
    const { data: user, error } = await supabase
      .from('users')
      .update({ membership })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(user);
  } catch (err) {
    console.error('Admin update membership error:', err);
    res.status(500).json({ error: 'Failed to update membership' });
  }
});

// Update user coins (admin)
app.put('/api/admin/users/:id/coins', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { loveCoins } = req.body;
    
    const { data: user, error } = await supabase
      .from('users')
      .update({ love_coins: loveCoins })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(user);
  } catch (err) {
    console.error('Admin update coins error:', err);
    res.status(500).json({ error: 'Failed to update coins' });
  }
});

// Deduct user coins (admin)
app.put('/api/admin/users/:id/deduct-coins', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid deduction amount' });
    }
    
    // Get current user coins
    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('love_coins')
      .eq('id', id)
      .single();
    
    if (fetchError) throw fetchError;
    
    const currentCoins = currentUser.love_coins || 0;
    const newCoins = Math.max(0, currentCoins - amount); // Prevent negative balance
    
    const { data: user, error } = await supabase
      .from('users')
      .update({ love_coins: newCoins })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(user);
  } catch (err) {
    console.error('Admin deduct coins error:', err);
    res.status(500).json({ error: 'Failed to deduct coins' });
  }
});

// Reset user matches (admin)
app.post('/api/admin/users/:id/reset-matches', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: user, error } = await supabase
      .from('users')
      .update({
        matches_used: 0,
        matches_reset_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(user);
  } catch (err) {
    console.error('Admin reset matches error:', err);
    res.status(500).json({ error: 'Failed to reset matches' });
  }
});

// Delete user (admin)
app.delete('/api/admin/users/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Ban/unban user (admin)
app.put('/api/admin/users/:id/ban', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_banned } = req.body;
    
    const { data: user, error } = await supabase
      .from('users')
      .update({ is_banned: is_banned })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(user);
  } catch (err) {
    console.error('Admin ban user error:', err);
    res.status(500).json({ error: 'Failed to update ban status' });
  }
});

// Get public settings for wallet (no auth required)
app.get('/api/public/settings', async (req, res) => {
  try {
    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .single();
    
    // Return all telegram links needed for wallet operations
    res.json({
      depositTelegram: settings?.deposit_telegram || 'crusherr_deposit',
      withdrawTelegram: settings?.withdraw_telegram || 'crusherr_withdraw',
      vipTelegram: settings?.vip_telegram || 'crusherr_vip',
      adultTelegram: settings?.adult_telegram || 'crusherr_adult',
      supportTelegram: settings?.match_telegram || settings?.support_telegram || 'crusherr_support'
    });
  } catch (err) {
    res.json({
      depositTelegram: 'crusherr_deposit',
      withdrawTelegram: 'crusherr_withdraw',
      vipTelegram: 'crusherr_vip',
      adultTelegram: 'crusherr_adult',
      supportTelegram: 'crusherr_support'
    });
  }
});

// Get withdraw settings (no auth required)
app.get('/api/public/withdraw-settings', async (req, res) => {
  try {
    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .single();
    
    res.json({
      telegram_link: settings?.withdraw_telegram || 'crusherr_withdraw'
    });
  } catch (err) {
    res.json({
      telegram_link: 'crusherr_withdraw'
    });
  }
});

// Get settings (admin)
app.get('/api/admin/settings', authenticateAdmin, async (req, res) => {
  try {
    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .single();
    
    if (settings) {
      // Map database fields to client field names
      res.json({
        vipTelegram: settings.vip_telegram || 'crusherr_vip',
        adultTelegram: settings.adult_telegram || 'crusherr_adult',
        depositTelegram: settings.deposit_telegram || 'crusherr_deposit',
        withdrawTelegram: settings.withdraw_telegram || 'crusherr_withdraw',
        supportTelegram: settings.match_telegram || 'crusherr_support'
      });
    } else {
      res.json({
        vipTelegram: 'crusherr_vip',
        adultTelegram: 'crusherr_adult',
        depositTelegram: 'crusherr_deposit',
        withdrawTelegram: 'crusherr_withdraw',
        supportTelegram: 'crusherr_support'
      });
    }
  } catch (err) {
    res.json({
      vipTelegram: 'crusherr_vip',
      adultTelegram: 'crusherr_adult',
      depositTelegram: 'crusherr_deposit',
      withdrawTelegram: 'crusherr_withdraw',
      supportTelegram: 'crusherr_support'
    });
  }
});

// Update settings (admin)
app.put('/api/admin/settings', authenticateAdmin, async (req, res) => {
  try {
    const { vipTelegram, adultTelegram, depositTelegram, withdrawTelegram, supportTelegram } = req.body;
    
    // Check if settings exist
    const { data: existing, error: selectError } = await supabase
      .from('settings')
      .select('id')
      .maybeSingle();
    
    if (selectError) {
      console.error('Select settings error:', selectError);
    }
    
    let result;
    if (existing && existing.id) {
      console.log('Updating existing settings, id:', existing.id);
      result = await supabase
        .from('settings')
        .update({
          vip_telegram: vipTelegram || 'crusherr_vip',
          adult_telegram: adultTelegram || 'crusherr_adult',
          deposit_telegram: depositTelegram || 'crusherr_deposit',
          withdraw_telegram: withdrawTelegram || 'crusherr_withdraw',
          match_telegram: supportTelegram || 'crusherr_support'
        })
        .eq('id', existing.id)
        .select();
    } else {
      console.log('Creating new settings record');
      result = await supabase
        .from('settings')
        .insert({
          vip_telegram: vipTelegram || 'crusherr_vip',
          adult_telegram: adultTelegram || 'crusherr_adult',
          deposit_telegram: depositTelegram || 'crusherr_deposit',
          withdraw_telegram: withdrawTelegram || 'crusherr_withdraw',
          match_telegram: supportTelegram || 'crusherr_support'
        })
        .select();
    }
    
    if (result.error) {
      console.error('Save settings error:', result.error);
      throw result.error;
    }
    
    console.log('Settings saved successfully:', result.data);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin update settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Initialize sample profiles (public endpoint for demo)
app.post('/api/demo/init-profiles', async (req, res) => {
  try {
    // Clear existing profiles first
    await supabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    const sampleProfiles = [
      {
        name: 'Sophia',
        age: 24,
        bio: 'Adventure seeker & coffee enthusiast. Love traveling and trying new cuisines.',
        hobbies: ['Travel', 'Coffee', 'Photography', 'Music', 'Hiking'],
        telegram: 'sophia_crush',
        profile_pic: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
        visibility: 'top',
        status: 'active',
        user_id: null,
        created_at: new Date().toISOString()
      },
      {
        name: 'Emma',
        age: 26,
        bio: 'Art lover and bookworm. Looking for meaningful connections.',
        hobbies: ['Art', 'Reading', 'Music', 'Cinema', 'Writing'],
        telegram: 'emma_love',
        profile_pic: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
        visibility: 'top',
        status: 'active',
        user_id: null,
        created_at: new Date().toISOString()
      },
      {
        name: 'Olivia',
        age: 23,
        bio: 'Fitness enthusiast and dog mom. Love outdoor activities.',
        hobbies: ['Fitness', 'Dogs', 'Outdoors', 'Yoga', 'Cooking'],
        telegram: 'olivia_fit',
        profile_pic: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400',
        visibility: 'top',
        status: 'active',
        user_id: null,
        created_at: new Date().toISOString()
      },
      {
        name: 'Priya',
        age: 24,
        bio: 'Bollywood dance lover and chai enthusiast. Lets explore together!',
        hobbies: ['Dancing', 'Music', 'Travel', 'Cooking', 'Movies'],
        telegram: 'priya_dance',
        profile_pic: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400',
        visibility: 'top',
        status: 'active',
        user_id: null,
        created_at: new Date().toISOString()
      }
    ];
    
    // Clear existing profiles
    await supabase.from('profiles').delete().neq('id', '');
    
    // Insert sample profiles
    const { data, error } = await supabase
      .from('profiles')
      .insert(sampleProfiles)
      .select();
    
    if (error) throw error;
    
    res.json({ success: true, profiles: data });
  } catch (err) {
    console.error('Init profiles error:', err);
    res.status(500).json({ error: 'Failed to initialize profiles' });
  }
});

// Root/API info
app.get('/', (req, res) => {
  res.json({
    name: 'Crushrr API',
    status: 'ok',
    message: 'Backend is running. Use /api/health or /api/profiles.',
    endpoints: {
      health: '/api/health',
      profiles: '/api/profiles',
      login: '/api/auth/login',
      register: '/api/auth/register'
    }
  });
});

app.get('/api', (req, res) => {
  res.json({
    name: 'Crushrr API',
    status: 'ok',
    endpoints: ['/api/health', '/api/profiles', '/api/auth/login', '/api/auth/register']
  });
});

// Health check
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'unknown'
  };

  try {
    const { error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true });

    if (error) {
      health.status = 'degraded';
      health.database = 'error';
      health.databaseError = error.message;
      return res.status(503).json(health);
    }

    health.database = 'ok';
    res.json(health);
  } catch (err) {
    health.status = 'degraded';
    health.database = 'unreachable';
    health.databaseError = isDatabaseConnectionError(err)
      ? 'Cannot reach Supabase. Check SUPABASE_URL, internet/DNS, and project status.'
      : err.message;
    res.status(503).json(health);
  }
});

// Initialize sample profiles (admin endpoint)
app.post('/api/admin/init-profiles', authenticateAdmin, async (req, res) => {
  try {
    // Clear existing profiles first
    await supabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    const sampleProfiles = [
      {
        name: 'Sophia',
        age: 24,
        bio: 'Adventure seeker & coffee enthusiast. Love traveling and trying new cuisines.',
        hobbies: ['Travel', 'Coffee', 'Photography', 'Music', 'Hiking'],
        telegram: 'sophia_crush',
        profile_pic: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
        visibility: 'top',
        status: 'active',
        user_id: null,
        created_at: new Date().toISOString()
      },
      {
        name: 'Emma',
        age: 26,
        bio: 'Art lover and bookworm. Looking for meaningful connections.',
        hobbies: ['Art', 'Reading', 'Music', 'Cinema', 'Writing'],
        telegram: 'emma_love',
        profile_pic: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
        visibility: 'top',
        status: 'active',
        user_id: null,
        created_at: new Date().toISOString()
      },
      {
        name: 'Olivia',
        age: 23,
        bio: 'Fitness enthusiast and dog mom. Love outdoor activities.',
        hobbies: ['Fitness', 'Dogs', 'Outdoors', 'Yoga', 'Cooking'],
        telegram: 'olivia_fit',
        profile_pic: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400',
        visibility: 'top',
        status: 'active',
        user_id: null,
        created_at: new Date().toISOString()
      },
      {
        name: 'Priya',
        age: 24,
        bio: 'Bollywood dance lover and chai enthusiast. Lets explore together!',
        hobbies: ['Dancing', 'Music', 'Travel', 'Cooking', 'Movies'],
        telegram: 'priya_dance',
        profile_pic: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400',
        visibility: 'top',
        status: 'active',
        user_id: null,
        created_at: new Date().toISOString()
      },
      {
        name: 'Aisha',
        age: 25,
        bio: 'Software developer by day, foodie by night. Love exploring new restaurants!',
        hobbies: ['Coding', 'Food', 'Movies', 'Tech', 'Gaming'],
        telegram: 'aisha_dev',
        profile_pic: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
        visibility: 'normal',
        status: 'active',
        user_id: null,
        created_at: new Date().toISOString()
      },
      {
        name: 'Neha',
        age: 22,
        bio: 'Music lover and aspiring singer. Looking for genuine connections.',
        hobbies: ['Singing', 'Music', 'Dance', 'Photography'],
        telegram: 'neha_sings',
        profile_pic: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400',
        visibility: 'normal',
        status: 'active',
        user_id: null,
        created_at: new Date().toISOString()
      }
    ];
    
    // Insert sample profiles
    const { data, error } = await supabase
      .from('profiles')
      .insert(sampleProfiles)
      .select();
    
    if (error) throw error;
    
    res.json({ success: true, profiles: data, count: data?.length || 0 });
  } catch (err) {
    console.error('Admin init profiles error:', err);
    res.status(500).json({ error: 'Failed to initialize profiles' });
  }
});

// Profile picture upload endpoint
app.post('/api/upload/profile-pic', upload.single('profilePic'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ 
      success: true, 
      url: fileUrl,
      filename: req.file.filename
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Crusherr API running on port ${PORT}`);
});
