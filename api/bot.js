const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ADMIN_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',') : [process.env.ADMIN_USER_ID];
let tempState = {}; // لحفظ خطوات الإدخال والبحث مؤقتاً

// --- 1. وظيفة التحقق من انتهاء الاشتراكات (Cron Job) ---
async function checkExpirations() {
    const data = await readData();
    const today = new Date();
    const inTwoDays = new Date();
    inTwoDays.setDate(today.getDate() + 2);
    const dateStr = inTwoDays.toISOString().split('T')[0];

    for (const user of data.users) {
        if (user.expiryDate === dateStr) {
            try {
                await bot.telegram.sendMessage(user.id, `⚠️ <b>تنبيه تجديد الاشتراك</b>\n\nعزيزي <b>${user.name || 'المشترك'}</b>، اشتراكك (${user.profileName}) ينتهي بعد يومين.\nيرجى التواصل معنا للتجديد لضمان استمرار الخدمة.`, { parse_mode: 'HTML' });
            } catch (e) { console.log("Error sending notice to", user.id); }
        }
    }
}

// --- 2. المعالج الرئيسي (المنسق بين Instaddr و Telegram) ---
module.exports = async (req, res) => {
    try {
        // تشغيل فحص التواريخ عبر رابط Vercel Cron
        if (req.query && req.query.key === 'run_cron') {
            await checkExpirations();
            return res.status(200).send('Cron Check Completed');
        }

        // استقبال الإيميلات من تطبيق Instaddr
        if (req.body && req.body.to && req.body.content) {
            const code = (req.body.content.match(/\b\d{4,8}\b/) || [])[0];
            if (code) {
                const data = await readData();
                const target
