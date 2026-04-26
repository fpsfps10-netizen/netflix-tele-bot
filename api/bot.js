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
    if (!data.users.find(u => u.id === ctx.from.id)) {
        data.users.push({ id: ctx.from.id, name: ctx.from.first_name, email: '', profileName: '', expiryDate: '' });
        await writeData(data);
    }
    const keyboard = [['📋 حالتي', '🏠 طلب كود نيتفليكس'], ['📞 الدعم']];
    if (ADMIN_IDS.includes(String(ctx.from.id))) keyboard.push(['⚙️ إدارة المشتركين', '🔍 البحث عن زبون']);
    ctx.reply('مرحباً بك في Mrnflix:', Markup.keyboard(keyboard).resize());
});

// مصلح: وضعنا زر الإدارة قبل معالج النصوص لضمان عمله فوراً
bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return;
    delete tempState[ctx.from.id]; // تصفير أي حالة بحث قديمة
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
    ctx.replyWithHTML(`👤 البروفايل: ${user.profileName}\n📅 الانتهاء: <code>${user.expiryDate}</code>`);
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
