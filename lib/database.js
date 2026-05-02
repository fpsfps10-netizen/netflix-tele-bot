const fs = require('fs').promises;
const path = require('path');

// مسار ملف البيانات (تأكد من وجوده في المجلد الرئيسي للمشروع)
const dataPath = path.join(process.cwd(), 'data.json');

async function readData() {
    try {
        const content = await fs.readFile(dataPath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        // إذا لم يكن الملف موجوداً، ننشئ قاعدة بيانات فارغة كبداية
        return { 
            users: [
                { id: 6197540099, name: "Monsieur NFLIX", clients: {}, expiries: {} }
            ] 
        };
    }
}

async function writeData(data) {
    try {
        await fs.writeFile(dataPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error("خطأ في حفظ البيانات:", error);
    }
}

module.exports = { readData, writeData };
