const fs = require('fs').promises;
const path = require('path');

const DB_FILE = path.join(__dirname, 'users.json');

// Initialize database file if it doesn't exist
async function initDB() {
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify({ users: [] }, null, 2));
  }
}

// Read database
async function readDB() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { users: [] };
  }
}

// Write database
async function writeDB(data) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

// User operations
async function createUser(username, hashedPassword) {
  const db = await readDB();

  // Check if user already exists
  if (db.users.find(u => u.username === username)) {
    throw new Error('User already exists');
  }

  const user = {
    id: Date.now().toString(),
    username,
    password: hashedPassword,
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  await writeDB(db);

  return { id: user.id, username: user.username };
}

async function findUserByUsername(username) {
  const db = await readDB();
  return db.users.find(u => u.username === username);
}

async function findUserById(id) {
  const db = await readDB();
  return db.users.find(u => u.id === id);
}

module.exports = {
  initDB,
  createUser,
  findUserByUsername,
  findUserById
};
