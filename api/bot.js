const { Telegraf, Markup } = require('telegraf');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_IDS = process.env.ADMIN_USER_IDS 
  ? process.env.ADMIN_USER_IDS.split(',').map(id => id.trim()) 
  : [process.env.ADMIN_USER_ID];

const adminOnly = (ctx, next) => {
    if (ADMIN_IDS.includes(String(ctx.from.id))) return next();
    return ctx.reply('⚠️ هذا الأمر للمسؤولين فقط.');
};

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const data = await readData();
    if (!data.users.find(u => u.id === userId)) {
        data.users.push({ id: userId, name: ctx.from.first_name, addedAt: new Date().toISOString(), tag: 'جديد' });
        await writeData(data);
    }
    ctx.replyWithHTML(`👋 مرحباً بك!\nID الخاص بك هو: <code>${userId}</code>`, 
    Markup.keyboard([['📋 حالتي', '📞 الدعم']]).resize());
});

bot.hears('📋 حالتي', async (ctx) => {
    const data = await readData();
    const user = data.users.find(u => u.id === ctx.from.id);
    if (!user || !user.expiryDate) return ctx.reply('ℹ️ لا يوجد اشتراك مسجل حالياً.');
    ctx.replyWithHTML(`👤 بروفايل: ${user.tag}\n📅 ينتهي: ${user.expiryDate}`);
});

bot.command('setexpire', adminOnly, async (ctx) => {
    const args = ctx.message.text.split(' ');
    const data = await readData();
    const idx = data.users.findIndex(u => u.id === Number(args[1]));
    if (idx !== -1) {
        data.users[idx].expiryDate = args[2];
        await writeData(data);
        ctx.reply('✅ تم تحديث التاريخ بنجاح.');
    }
});

module.exports = async (req, res) => {
    if (req.body) await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
