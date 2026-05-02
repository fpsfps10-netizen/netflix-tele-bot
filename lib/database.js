const axios = require('axios');

const BIN_ID = process.env.JSONBIN_BIN_ID; 
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;

const api = axios.create({
    baseURL: `https://api.jsonbin.io/v3/b/${BIN_ID}`,
    headers: {
        'X-Master-Key': MASTER_KEY
    }
});

async function readData() {
    try {
        const response = await api.get('/latest');
        return response.data.record;
    } catch (error) {
        console.error("Database Read Error:", error.message);
        // إرجاع بيانات افتراضية لمنع انهيار البوت
        return { users: [{ id: 6197540099, name: "Monsieur NFLIX", clients: {} }] };
    }
}

async function writeData(data) {
    try {
        await api.put('', data);
    } catch (error) {
        console.error("Database Write Error:", error.message);
    }
}

module.exports = { readData, writeData };
