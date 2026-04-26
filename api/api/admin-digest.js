const { Telegraf } = require('telegraf');
const { readData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

module.exports = async (req, res) => {
    try {
        const data = await readData();
        const total = data.users.length;
        const msg = `📊 تقرير الإدارة:\n\n👥 إجمالي المستخدمين: ${total}\n✅ النظام يعمل بشكل جيد.`;
        await bot.telegram.sendMessage(process.env.ADMIN_USER_ID, msg);
        res.status(200).send('Digest sent');
    } catch (e) { res.status(500).send(e.message); }
};
