const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'sessions', 'db.json');

// Ensure the sessions directory exists
if (!fs.existsSync(path.join(__dirname, 'sessions'))) {
    fs.mkdirSync(path.join(__dirname, 'sessions'), { recursive: true });
}

// Initialize database file if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({}));
}

const database = {
    async saveSession(key, data) {
        try {
            const db = JSON.parse(fs.readFileSync(DB_FILE));
            db[key] = data;
            fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving session:', error);
            return false;
        }
    },

    async getSession(key) {
        try {
            const db = JSON.parse(fs.readFileSync(DB_FILE));
            return db[key] || null;
        } catch (error) {
            console.error('Error getting session:', error);
            return null;
        }
    },

    async deleteSession(key) {
        try {
            const db = JSON.parse(fs.readFileSync(DB_FILE));
            delete db[key];
            fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
            return true;
        } catch (error) {
            console.error('Error deleting session:', error);
            return false;
        }
    }
};

module.exports = database; 
