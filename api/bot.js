const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send('Bot is Live');
    
    try {
        const data = await readData();

        // أوامر البوت الأساسية
        bot.start(async (ctx) => {
            const menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['⚙️ إدارة المشتركين']];
            await ctx.reply("مرحباً بك في Monsieur NFLIX:", Markup.keyboard(menu).resize());
        });

        bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
            if (ctx.from.id === ADMIN_ID) {
                const customers = (data.users || []).filter(u => u.id !== ADMIN_ID);
                if (customers.length > 0) {
                    const buttons = customers.map(u => [Markup.button.callback(u.name, `view_${u.id}`)]);
                    await ctx.reply("⚙️ اختر زبوناً:", Markup.inlineKeyboard(buttons));
                } else {
                    await ctx.reply("❌ لا يوجد زبائن حالياً.");
                }
            }
        });

        // معالجة الطلب القادم من تليجرام
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');

    } catch (err) {
        console.error("Global Error:", err.message);
        res.status(200).send('Error Handled');
    }
};
