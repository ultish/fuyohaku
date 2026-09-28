CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '#projects',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO projects (id, title, description, image, url, sort_order) VALUES
  ('weather-now', 'Weather Now', 'A simple, fast weather app with a clean interface and minimal permissions.', 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=900&q=80', '#projects', 10),
  ('homelab-tools', 'Homelab Tools', 'Utilities and scripts for managing my homelab and infrastructure.', 'gradient:#111b22,#34434b', '#projects', 20),
  ('note-layer', 'Note Layer', 'A lightweight note-taking app with Markdown and sync.', 'https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=900&q=80', '#projects', 30),
  ('green-thumb', 'Green Thumb', 'A small garden tracker for keeping plants (and me) alive.', 'https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=900&q=80', '#projects', 40),
  ('kotlin-experiments', 'Kotlin Experiments', 'Small playgrounds for trying out new ideas and libraries.', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80', '#projects', 50),
  ('and-more', '... and more', 'A few other things in various states of completion.', 'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=900&q=80', '#projects', 60);
