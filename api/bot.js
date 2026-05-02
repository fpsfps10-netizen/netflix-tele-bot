const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    // استجابة فورية لتجنب الـ Timeout في Vercel
    if (req.method !== 'POST') return res.status(200).send('Bot Status: Online');
    res.status(200).send('OK');

    try {
        const data = await readData();

        // معالجة إشعارات الإيميل (Webhook من MailNow)
        if (req.body && req.body.content) {
            const emailContent = req.body.content;
            await bot.telegram.sendMessage(ADMIN_ID, `📩 <b>كود جديد وصل:</b>\n\n<pre>${emailContent}</pre>`, { parse_mode: 'HTML' });
            return;
        }

        // معالجة أوامر تليجرام
        if (req.body.message && req.body.message.text) {
            const chatId = req.body.message.chat.id;
            const text = req.body.message.text;

            if (text === '/start') {
                const menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['⚙️ إدارة المشتركين']];
                await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(menu).resize());
            } 
            else if (text === '⚙️ إدارة المشتركين' && chatId === ADMIN_ID) {
                const customers = data.users.filter(u => u.id !== ADMIN_ID);
                const buttons = customers.map(u => [Markup.button.callback(`${u.name}`, `view_user_${u.id}`)]);
                await bot.telegram.sendMessage(chatId, "⚙️ اختر زبوناً للإدارة:", Markup.inlineKeyboard(buttons));
            }
        }

        // معالجة الأزرار (Callback Queries)
        if (req.body.callback_query) {
            await bot.handleUpdate(req.body);
        }

    } catch (err) {
        console.error("Runtime Error:", err.message);
    }
};
