const axios = require('axios');

// تأكد من إضافة هذه القيم في إعدادات Vercel (Environment Variables)
const BIN_ID = process.env.JSONBIN_BIN_ID; 
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;

const api = axios.create({
    baseURL: `https://api.jsonbin.io/v3/b/${BIN_ID}`,
    headers: {
        'X-Master-Key': MASTER_KEY,
        'Content-Type': 'application/json'
    }
});

async function readData() {
    try {
        const response = await api.get('/latest');
        return response.data.record;
    } catch (error) {
        console.error("خطأ في القراءة:", error.message);
        // بيانات افتراضية في حال الفشل
        return { users: [{ id: 6197540099, name: "Monsieur NFLIX", clients: {} }] };
    }
}

async function writeData(data) {
    try {
        await api.put('', data);
    } catch (error) {
        console.error("خطأ في الحفظ:", error.message);
    }
}

module.exports = { readData, writeData };
