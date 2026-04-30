const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ADMIN_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',') : [process.env.ADMIN_USER_ID];
let tempState = {};

// رقم الواتساب (الجزائر)
const WHATSAPP_NUMBER = "213555862000";

// دالة التذكير الخاصة
async function checkReminder(ctx, user, data) {
    if (!user || !user.expiryDate) return;
    const today = new Date();
    const expiry = new Date(user.expiryDate);
    today.setHours(0,0,0,0);
    expiry.setHours(0,0,0,0);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // قبل يوم من الانتهاء
    if (diffDays === 1 && user.notifiedBefore !== true) {
        await ctx.replyWithHTML(`⏰ تذكير: باقي يوم واحد فقط على انتهاء اشتراكك. يرجى التجديد لتفادي الانقطاع.`);
        user.notifiedBefore = true;
        await writeData(data);
    }
    // يوم الانتهاء بالضبط
    else if (diffDays === 0 && user.notifiedOnEnd !== true) {
        await ctx.replyWithHTML(`⚠️ اليوم هو آخر يوم في اشتراكك! لتجديد الاشتراك تواصل مع الدعم لتفادي توقف الخدمة.`);
        user.notifiedOnEnd = true;
        await writeData(data);
    }
    // إذا جدد الاشتراك (أعيد التاريخ)، أزل إشعارات التذكير
    if (diffDays > 1 && (user.notifiedBefore || user.notifiedOnEnd)) {
        user.notifiedBefore = false;
        user.notifiedOnEnd = false;
        await writeData(data);
    }
}

// --- معالج الـ Webhook (Instaddr + Telegram) ---
module.exports = async (req, res) => {
    try {
        if (req.body && req.body.to && req.body.content) {
            const code = (req.body.content.match(/\b\d{4,8}\b/) || [])[0];
            if (code) {
                const data = await readData();
                const targetUsers = data.users.filter(u => u.email === req.body.to);
                for (const user of targetUsers) {
                    await bot.telegram.sendMessage(user.id, `📩 <b>وصلك كود جديد!</b>\n🔢 الكود: <code>${code}</code>`, { parse_mode: 'HTML' });
                }
            }
            return res.status(200).send('OK');
        }
        if (req.body && req.body.update_id) { await bot.handleUpdate(req.body); }
    } catch (e) { console.error(e); }
    res.status(200).send('OK');
};

// --- الأوامر المباشرة (الأزرار الرئيسية) ---

bot.start(async (ctx) => {
    const data = await readData();
    let isNew = false;
    let user = data.users.find(u => u.id === ctx.from.id);
    if (!user) {
        user = { id: ctx.from.id, name: ctx.from.first_name, email: '', profileName: '', expiryDate: '' };
        data.users.push(user);
        await writeData(data);
        isNew = true;
    }
    const keyboard = [
        ['📋 حالتي', '🏠 طلب كود نيتفليكس'],
        ['📞 الدعم', '🔄 تجديد الاشتراك']
    ];
    if (ADMIN_IDS.includes(String(ctx.from.id))) keyboard.push(['⚙️ إدارة المشتركين', '🔍 البحث عن زبون']);

    if (isNew)
        await ctx.reply('👋 أهلاً بك في بوت Mrnflix!\nيمكنك البدء بطلب كود نيتفليكس أو التواصل مع الدعم في أي وقت.');

    await ctx.reply('مرحباً بك في Mrnflix:', Markup.keyboard(keyboard).resize());
    await checkReminder(ctx, user, data);
});

bot.hears('📋 حالتي', async (ctx) => {
    delete tempState[ctx.from.id];
    const data = await readData();
    const user = data.users.find(u => u.id === ctx.from.id);
    if (!user || !user.expiryDate) return ctx.reply('ℹ️ لا يوجد اشتراك مسجل.');

    await checkReminder(ctx, user, data);

    // حساب الأيام المتبقية
    const today = new Date();
    const expiry = new Date(user.expiryDate);
    today.setHours(0,0,0,0);
    expiry.setHours(0,0,0,0);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let msg = `👤 البروفايل: ${user.profileName}\n📅 الانتهاء: <code>${user.expiryDate}</code>`;
    if (diffDays >= 0)
        msg += `\n⏳ المتبقي: <b>${diffDays}</b> يوم`;
    else
        msg += `\n❗️ انتهى الاشتراك منذ <b>${Math.abs(diffDays)}</b> يوم`;
    ctx.replyWithHTML(msg);
});

bot.hears('🏠 طلب كود نيتفليكس', async (ctx) => {
    delete tempState[ctx.from.id];
    const data = await readData();
    const user = data.users.find(u => u.id === ctx.from.id);
    await checkReminder(ctx, user, data);
    ctx.reply('✅ نظام الأكواد التلقائي نشط.');
});

bot.hears('📞 الدعم', async (ctx) => {
    const data = await readData();
    const user = data.users.find(u => u.id === ctx.from.id);
    await checkReminder(ctx, user, data);

    ctx.reply(
        `📞 للدعم عبر الواتساب:\n` +
        `[اضغط هنا للمراسلة](https://wa.me/${WHATSAPP_NUMBER})\n` +
        `أو أرسل على الرقم المباشر: ${WHATSAPP_NUMBER}`,
        { parse_mode: 'Markdown' }
    );
});

bot.hears('🔄 تجديد الاشتراك', async (ctx) => {
    const data = await readData();
    const user = data.users.find(u => u.id === ctx.from.id);
    await checkReminder(ctx, user, data);

    ctx.reply('🔔 لتجديد الاشتراك يرجى التواصل عبر الواتساب مع الدعم.');
});

// --- الإدارة ---
bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return;
    delete tempState[ctx.from.id];
    const data = await readData();
    const list = data.users.slice(-15).map(u => [Markup.button.callback(u.name || String(u.id), `select_${u.id}`)]);
    ctx.reply('⚙️ قائمة آخر المشتركين للتعديل:', Markup.inlineKeyboard(list));
});

bot.hears('🔍 البحث عن زبون', (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return;
    tempState[ctx.from.id] = { step: 'searching' };
    ctx.reply('🔎 أرسل اسم الزبون للبحث عنه:');
});

// --- خاصية التجديد السريع للإدمن ---
bot.action(/select_(.+)/, (ctx) => {
    tempState[ctx.from.id] = { targetId: ctx.match[1], step: 'renew' };
    ctx.answerCbQuery();
    ctx.reply('🗓 أرسل تاريخ الانتهاء الجديد (مثال: 2026-07-01) ليتم التجديد مباشرة:');
});

// --- معالج النصوص (بحث و تجديد فقط) ---
bot.on('text', async (ctx, next) => {
    const state = tempState[ctx.from.id];
    if (!state || !ADMIN_IDS.includes(String(ctx.from.id))) return next();

    const data = await readData();
    const targetIdx = data.users.findIndex(u => u.id === Number(state.targetId));

    // التجديد السريع
    if (state.step === 'renew') {
        data.users[targetIdx].expiryDate = ctx.message.text;
        data.users[targetIdx].notifiedBefore = false;
        data.users[targetIdx].notifiedOnEnd = false;
        await writeData(data);
        delete tempState[ctx.from.id];
        ctx.reply(
            '✅ تم تجديد اشتراك الزبون بنجاح! تاريخ الانتهاء الجديد: ' +
            ctx.message.text
        );
        return;
    }

    // البحث المتقدم عن زبون
    if (state.step === 'searching') {
        const query = ctx.message.text.toLowerCase();
        const results = data.users.filter(u => u.name && u.name.toLowerCase().includes(query));
        delete tempState[ctx.from.id];
        if (results.length === 0) return ctx.reply('❌ لم يتم العثور على زبون.');
        return ctx.reply('نتائج البحث:', Markup.inlineKeyboard(results.map(u => [Markup.button.callback(u.name, `select_${u.id}`)])));
    }
});
