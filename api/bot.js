const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ADMIN_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',') : [process.env.ADMIN_USER_ID];
let tempState = {}; 

bot.start(async (ctx) => {
    const data = await readData();
    if (!data.users.find(u => u.id === ctx.from.id)) {
        data.users.push({ id: ctx.from.id, name: ctx.from.first_name, email: '', profileName: '', expiryDate: '' });
        await writeData(data);
    }
    
    // الأزرار الرئيسية التي تظهر في الأسفل
    let keyboard = [['📋 حالتي', '🏠 طلب كود نيتفليكس'], ['📞 الدعم']];
    
    // إضافة زر الإدارة فقط إذا كنت أنت المدير
    if (ADMIN_IDS.includes(String(ctx.from.id))) {
        keyboard.push(['⚙️ إدارة المشتركين']);
    }

    ctx.reply('مرحباً بك في Mrnflix! استخدم الأزرار أدناه للتحكم:', 
        Markup.keyboard(keyboard).resize()
    );
});

// --- قسم الإدارة ---
bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return;
    const data = await readData();
    ctx.reply('اختر الزبون لتعديل بياناته:', 
        Markup.inlineKeyboard(data.users.map(u => [Markup.button.callback(u.name || u.id, `select_${u.id}`)]))
    );
});

bot.action(/select_(.+)/, (ctx) => {
    const userId = ctx.match[1];
    tempState[ctx.from.id] = { targetId: userId, step: 'email' };
    ctx.answerCbQuery();
    ctx.reply(`📧 ممتاز، أرسل الآن إيميل Instaddr الخاص بهذا المشترك:`);
});

bot.on('text', async (ctx, next) => {
    const state = tempState[ctx.from.id];
    if (!state) return next(); // إذا لم يكن هناك إدخال بيانات، انتقل للأوامر العادية

    const data = await readData();
    const idx = data.users.findIndex(u => u.id === Number(state.targetId));

    if (state.step === 'email') {
        data.users[idx].email = ctx.message.text;
        state.step = 'profile';
        await writeData(data);
        ctx.reply(`✅ تم حفظ الإيميل. الآن أرسل "اسم البروفايل" في نتفلكس:`);
    } else if (state.step === 'profile') {
        data.users[idx].profileName = ctx.message.text;
        state.step = 'date';
        await writeData(data);
        ctx.reply(`✅ تم حفظ البروفايل. الآن أرسل "تاريخ الانتهاء" (مثال: 2026-05-30):`);
    } else if (state.step === 'date') {
        data.users[idx].expiryDate = ctx.message.text;
        await writeData(data);
        delete tempState[ctx.from.id];
        ctx.reply(`🎉 تم تحديث بيانات المشترك بنجاح!`);
    }
});

// الأوامر العادية
bot.hears('📋 حالتي', async (ctx) => {
    const data = await readData();
    const user = data.users.find(u => u.id === ctx.from.id);
    if (!user || !user.expiryDate) return ctx.reply('ℹ️ لا يوجد اشتراك مسجل حالياً.');
    ctx.replyWithHTML(`👤 البروفايل: ${user.profileName}\n📅 التاريخ: <code>${user.expiryDate}</code>\n📧 الحساب: ${user.email}`);
});

bot.hears('🏠 طلب كود نيتفليكس', (ctx) => {
    ctx.reply('سيصلك الكود هنا تلقائياً فور طلبه من نيتفليكس.');
});

bot.hears('📞 الدعم', (ctx) => {
    ctx.reply('للدعم الفني:', Markup.inlineKeyboard([[Markup.button.url('🟢 واتساب', 'https://wa.me/213555862000')]]));
});

module.exports = async (req, res) => {
    if (req.body && req.body.update_id) await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
