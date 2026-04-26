const { Telegraf, Markup } = require('telegraf');
const { readData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

module.exports = async (req, res) => {
    try {
        const data = await readData();
        const today = new Date();
        for (const user of data.users) {
            if (!user.expiryDate) continue;
            const expiry = new Date(user.expiryDate);
            const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
            
            if (diff === 3 || diff === 1) {
                await bot.telegram.sendMessage(user.id, `⚠️ تنبيه: اشتراكك ينتهي خلال ${diff} يوم.`, 
                Markup.inlineKeyboard([[Markup.button.url('🟢 تجديد الآن', 'https://wa.me/213555862000')]]));
            }
        }
        res.status(200).send('Alerts processed');
    } catch (e) { res.status(500).send(e.message); }
};
