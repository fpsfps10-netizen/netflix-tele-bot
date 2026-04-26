const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ADMIN_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',') : [process.env.ADMIN_USER_ID];
let tempState = {}; // لتخزين الحالة المؤقتة أثناء الإدخال

bot.start(async (ctx) => {
    const data = await readData();
    if (!data.users.find(u => u.id === ctx.from.id)) {
        data.users.push({ id: ctx.from.id, name: ctx.from.first_name, email: '', profileName: '', expiryDate: '' });
        await writeData(data);
    }
    let buttons = [['📋 حالتي', '🏠 طلب كود نيتفليكس'], ['📞 الدعم']];
    if (ADMIN_IDS.includes(String(ctx.from.id))) buttons.push(['⚙️ إدارة المشتركين']);
    ctx.reply('مرحباً بك في Mrnflix:', Markup.keyboard(buttons).resize());
});

// --- لوحة التحكم للمدير ---
bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return;
    const data = await readData();
    ctx.reply('اختر الزبون لتعديل بياناته:', 
        Markup.inlineKeyboard(data.users.map(u => [Markup.button.callback(u.name, `select_${u.id}`)]))
    );
});

// الخطوة 1: طلب الإيميل
bot.action(/select_(.+)/, (ctx) => {
    const userId = ctx.match[1];
    tempState[ctx.from.id] = { targetId: userId, step: 'email' };
    ctx.answerCbQuery();
    ctx.reply(`📧 أرسل الآن إيميل Instaddr الخاص بالزبون (ID: ${userId}):`);
});

// الخطوة 2 و 3: معالجة الرسائل المرسلة من المدير
bot.on('text', async (ctx) => {
    const state = tempState[ctx.from.id];
    if (!state || !ADMIN_IDS.includes(String(ctx.from.id))) return;

    const data = await readData();
    const idx = data.users.findIndex(u => u.id === Number(state.targetId));

    if (state.step === 'email') {
        data.users[idx].email = ctx.message.text;
        state.step = 'profile';
        await writeData(data);
        ctx.reply(`✅ تم حفظ الإيميل. الآن أرسل "اسم البروفايل" (مثلاً: Ahmad):`);
    } 
    else if (state.step === 'profile') {
        data.users[idx].profileName = ctx.message.text;
        state.step = 'date';
        await writeData(data);
        ctx.reply(`✅ تم حفظ البروفايل. الآن أرسل "تاريخ الانتهاء" بصيغة (YYYY-MM-DD):`);
    } 
    else if (state.step === 'date') {
        data.users[idx].expiryDate = ctx.message.text;
        await writeData(data);
        delete tempState[ctx.from.id]; // إنهاء العملية
        ctx.reply(`🎉 تم اكتمال الإعداد بنجاح!\nالزبون: ${data.users[idx].name}\nالحساب: ${data.users[idx].email}\nالتاريخ: ${ctx.message.text}`);
    }
});

// --- استقبال
