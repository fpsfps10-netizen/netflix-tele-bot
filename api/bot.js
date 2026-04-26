const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ADMIN_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',') : [process.env.ADMIN_USER_ID];
let tempState = {}; 

// --- 1. معالجة البيانات القادمة (Webhook + Telegram) ---
module.exports = async (req, res) => {
    // استقبال إيميلات Instaddr
    if (req.body && req.body.to && req.body.content) {
        const code = (req.body.content.match(/\b\d{4,8}\b/) || [])[0];
        if (code) {
            const data = await readData();
            const targetUsers = data.users.filter(u => u.email === req.body.to);
            for (const user of targetUsers) {
                await bot.telegram.sendMessage(user.id, `📩 <b>وصلك كود جديد تلقائياً!</b>\n\n🔢 الكود: <code>${code}</code>\n👤 الحساب: ${req.body.to}`, { parse_mode: 'HTML' });
            }
        }
        return res.status(200).send('OK');
    }
    // معالجة أوامر التليجرام
    if (req.body && req.body.update_id) {
        await bot.handleUpdate(req.body);
    }
    res.status(200).send('OK');
};

// --- 2. تعريف أوامر الأزرار لتفعيلها ---
bot.start(async (ctx) => {
    const data = await readData();
    if (!data.users.find(u => u.id === ctx.from.id)) {
        data.users.push({ id: ctx.from.id, name: ctx.from.first_name, email: '', profileName: '', expiryDate: '' });
        await writeData(data);
    }
    let keyboard = [['📋 حالتي', '🏠 طلب كود نيتفليكس'], ['📞 الدعم']];
    if (ADMIN_IDS.includes(String(ctx.from.id))) keyboard.push(['⚙️ إدارة المشتركين']);
    ctx.reply('مرحباً بك في Mrnflix:', Markup.keyboard(keyboard).resize());
});

bot.hears('📋 حالتي', async (ctx) => {
    const data = await readData();
    const user = data.users.find(u => u.id === ctx.from.id);
    if (!user || !user.expiryDate) return ctx.reply('ℹ️ لا يوجد اشتراك مسجل.');
    ctx.replyWithHTML(`👤 البروفايل: ${user.profileName}\n📅 ينتهي في: <code>${user.expiryDate}</code>\n📧 الحساب: ${user.email}`);
});

bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return;
    const data = await readData();
    ctx.reply('اختر زبوناً لتعديله:', Markup.inlineKeyboard(data.users.map(u => [Markup.button.callback(u.name || u.id, `select_${u.id}`)])));
});

// نظام الخطوات للإدارة
bot.action(/select_(.+)/, (ctx) => {
    tempState[ctx.from.id] = { targetId: ctx.match[1], step: 'email' };
    ctx.answerCbQuery();
    ctx.reply('📧 أرسل إيميل Instaddr للزبون:');
});

bot.on('text', async (ctx, next) => {
    const state = tempState[ctx.from.id];
    if (!state || !ADMIN_IDS.includes(String(ctx.from.id))) return next();

    const data = await readData();
    const idx = data.users.findIndex(u => u.id === Number(state.targetId));

    if (state.step === 'email') {
        data.users[idx].email = ctx.message.text;
        state.step = 'profile';
        await writeData(data);
        ctx.reply('✅ تم حفظ الإيميل. أرسل الآن اسم البروفايل:');
    } else if (state.step === 'profile') {
        data.users[idx].profileName = ctx.message.text;
        state.step = 'date';
        await writeData(data);
        ctx.reply('✅ تم حفظ البروفايل. أرسل الآن تاريخ الانتهاء (YYYY-MM-DD):');
    } else if (state.step === 'date') {
        data.users[idx].expiryDate = ctx.message.text;
        await writeData(data);
        delete tempState[ctx.from.id];
        ctx.reply('🎉 تم تحديث البيانات بنجاح!');
    }
});

bot.hears('🏠 طلب كود نيتفليكس', (ctx) => ctx.reply('نظام الأكواد التلقائي نشط ✅'));
bot.hears('📞 الدعم', (ctx) => ctx.reply('تواصل معنا عبر واتساب: 0555862000'));
