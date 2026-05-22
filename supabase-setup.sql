-- Crusherr Dating App - Supabase Database Schema

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  profile_pic TEXT,
  age INTEGER,
  bio TEXT,
  hobbies TEXT[] DEFAULT '{}',
  telegram VARCHAR(100),
  upi_id VARCHAR(100),
  membership VARCHAR(50) DEFAULT 'none',
  love_coins INTEGER DEFAULT 0,
  matches_used INTEGER DEFAULT 0,
  matches_reset_date TIMESTAMP,
  profile_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create profiles table (dating profiles)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name VARCHAR(255) NOT NULL,
  age INTEGER,
  bio TEXT,
  hobbies TEXT[] DEFAULT '{}',
  telegram VARCHAR(100),
  profile_pic TEXT,
  visibility VARCHAR(50) DEFAULT 'normal',
  status VARCHAR(50) DEFAULT 'active',
  is_vip BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create likes table
CREATE TABLE IF NOT EXISTS likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID REFERENCES users(id),
  to_profile_id UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create matches table
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  profile_id UUID REFERENCES profiles(id),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vip_telegram VARCHAR(100) DEFAULT 'crusherr_vip',
  adult_telegram VARCHAR(100) DEFAULT 'crusherr_adult',
  deposit_telegram VARCHAR(100) DEFAULT 'crusherr_deposit',
  withdraw_telegram VARCHAR(100) DEFAULT 'crusherr_withdraw',
  match_telegram VARCHAR(100) DEFAULT 'crusherr_support',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create transactions table (for Love Coins)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  amount INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  reference_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_visibility ON profiles(visibility);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_likes_from_user ON likes(from_user_id);
CREATE INDEX IF NOT EXISTS idx_likes_to_profile ON likes(to_profile_id);

-- Insert default settings
INSERT INTO settings (vip_telegram, adult_telegram, deposit_telegram, withdraw_telegram, match_telegram)
VALUES ('crusherr_vip', 'crusherr_adult', 'crusherr_deposit', 'crusherr_withdraw', 'crusherr_support')
ON CONFLICT DO NOTHING;

-- Insert admin user (password: ruderjaat01)
INSERT INTO users (name, email, password, phone, membership, profile_completed)
VALUES ('Admin', 'admin@crushrr.com', '$2a$10$tlmfus.ZVN.d9hvmrAI6tOhvIb48MjzzgRLdupm2CLTYRI3QV1516', '+1234567890', 'vip', true)
ON CONFLICT (email) DO NOTHING;
