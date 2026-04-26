const axios = require('axios');

const BIN_ID = process.env.JSONBIN_BIN_ID;
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;

const api = axios.create({
    baseURL: `https://api.jsonbin.io/v3/b/${BIN_ID}`,
    headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': MASTER_KEY,
    },
});

async function readData() {
    try {
        const response = await api.get('/latest');
        return response.data.record;
    } catch (error) {
        if (error.response && error.response.status === 404) {
             return { users: [] };
        }
        throw error;
    }
}

async function writeData(data) {
    try {
        const response = await api.put('/', data);
        return response.data;
    } catch (error) {
        throw error;
    }
}

module.exports = { readData, writeData };
