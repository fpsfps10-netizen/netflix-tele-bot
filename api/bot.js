const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ADMIN_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',') : [process.env.ADMIN_USER_ID];
let tempState = {};

// --- 1. معالج الـ Webhook (Instaddr + Telegram) ---
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

// --- 2. الأوامر المباشرة (الأزرار الرئيسية) ---

bot.start(async (ctx) => {
    const data = await readData();
    let isNew = false;
    if (!data.users.find(u => u.id === ctx.from.id)) {
        data.users.push({ id: ctx.from.id, name: ctx.from.first_name, email: '', profileName: '', expiryDate: '' });
        await writeData(data);
        isNew = true;
    }
    const keyboard = [
        ['📋 حالتي', '🏠 طلب كود نيتفليكس'],
        ['📞 الدعم', '🔄 تجديد الاشتراك']
    ];
    if (ADMIN_IDS.includes(String(ctx.from.id))) keyboard.push(['⚙️ إدارة المشتركين', '🔍 البحث عن زبون']);
    // رسالة ترحيب خاصة للمستخدم الجديد
    if (isNew)
        ctx.reply('👋 أهلاً بك في بوت Mrnflix!\nيمكنك البدء بطلب كود نيتفليكس أو التواصل مع الدعم في أي وقت.');
    ctx.reply('مرحباً بك في Mrnflix:', Markup.keyboard(keyboard).resize());
});

bot.hears('🔄 تجديد الاشتراك', (ctx) => {
    ctx.reply('🔔 للتجديد يرجى التواصل مع الدعم أو ��رسال بياناتك هنا وسيتم خدمتك بأقرب وقت.');
});

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

bot.hears('📋 حالتي', async (ctx) => {
    delete tempState[ctx.from.id];
    const data = await readData();
    const user = data.users.find(u => u.id === ctx.from.id);
    if (!user || !user.expiryDate) return ctx.reply('ℹ️ لا يوجد اشتراك مسجل.');

    // حساب الأيام المتبقية
    const today = new Date();
    const expiry = new Date(user.expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let msg = `👤 البروفايل: ${user.profileName}\n📅 الانتهاء: <code>${user.expiryDate}</code>`;
    if (diffDays >= 0)
        msg += `\n⏳ المتبقي: <b>${diffDays}</b> يوم`;
    else
        msg += `\n❗️ انتهى الاشتراك منذ <b>${Math.abs(diffDays)}</b> يوم`;
    ctx.replyWithHTML(msg);
});

bot.hears('🏠 طلب كود نيتفليكس', (ctx) => {
    delete tempState[ctx.from.id];
    ctx.reply('✅ نظام الأكواد التلقائي نشط.');
});

// --- 3. معالجة التفاعلات (Inline) ---
bot.action(/select_(.+)/, (ctx) => {
    tempState[ctx.from.id] = { targetId: ctx.match[1], step: 'email' };
    ctx.answerCbQuery();
    ctx.reply('📧 أرسل إيميل Instaddr لهذا المشترك:');
});

// --- 4. معالج النصوص (البحث وإدخال البيانات) - يوضع دائماً في الأخير ---
bot.on('text', async (ctx, next) => {
    const state = tempState[ctx.from.id];
    if (!state || !ADMIN_IDS.includes(String(ctx.from.id))) return next();

    const data = await readData();

    if (state.step === 'searching') {
        const query = ctx.message.text.toLowerCase();
        const results = data.users.filter(u => u.name && u.name.toLowerCase().includes(query));
        delete tempState[ctx.from.id];
        if (results.length === 0) return ctx.reply('❌ لم يتم العثور على زبون.');
        return ctx.reply('نتائج البحث:', Markup.inlineKeyboard(results.map(u => [Markup.button.callback(u.name, `select_${u.id}`)])));
    }

    const targetIdx = data.users.findIndex(u => u.id === Number(state.targetId));
    if (targetIdx !== -1) {
        if (state.step === 'email') {
            data.users[targetIdx].email = ctx.message.text;
            state.step = 'profile';
            await writeData(data);
            ctx.reply('✅ تم حفظ الإيميل. الآن أرسل اسم البروفايل:');
        } else if (state.step === 'profile') {
            data.users[targetIdx].profileName = ctx.message.text;
            state.step = 'date';
            await writeData(data);
            ctx.reply('✅ تم حفظ البروفايل. الآن أرسل تاريخ الانتهاء (YYYY-MM-DD):');
        } else if (state.step === 'date') {
            data.users[targetIdx].expiryDate = ctx.message.text;
            await writeData(data);
            delete tempState[ctx.from.id];
            ctx.reply('🎉 تم تحديث بيانات الزبون بنجاح!');
        }
    }
});
