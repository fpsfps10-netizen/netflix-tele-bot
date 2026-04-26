const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ADMIN_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',') : [process.env.ADMIN_USER_ID];
let tempState = {}; // لحفظ خطوات الإدخال والبحث

// --- 1. وظيفة التحقق من انتهاء الاشتراكات (Cron Job) ---
async function checkExpirations() {
    const data = await readData();
    const today = new Date();
    const inTwoDays = new Date();
    inTwoDays.setDate(today.getDate() + 2);
    const dateStr = inTwoDays.toISOString().split('T')[0];

    for (const user of data.users) {
        if (user.expiryDate === dateStr) {
            try {
                await bot.telegram.sendMessage(user.id, `⚠️ <b>تنبيه تجديد الاشتراك</b>\n\nعزيزي <b>${user.name || 'المشترك'}</b>، اشتراكك (${user.profileName}) ينتهي بعد يومين.\nيرجى التواصل معنا للتجديد لضمان استمرار الخدمة.`, { parse_mode: 'HTML' });
            } catch (e) { console.log("Error sending notice to", user.id); }
        }
    }
}

// --- 2. المعالج الرئيسي (Webhook + Telegram Updates) ---
module.exports = async (req, res) => {
    try {
        // أ. تشغيل فحص التواريخ عبر Vercel Cron
        if (req.query && req.query.key === 'run_cron') {
            await checkExpirations();
            return res.status(200).send('Cron Check Completed');
        }

        // ب. استقبال الإيميلات من Instaddr
        if (req.body && req.body.to && req.body.content) {
            const code = (req.body.content.match(/\b\d{4,8}\b/) || [])[0];
            if (code) {
                const data = await readData();
                const targetUsers = data.users.filter(u => u.email === req.body.to);
                for (const user of targetUsers) {
                    await bot.telegram.sendMessage(user.id, `📩 <b>كود جديد تلقائي!</b>\n\n👤 البروفايل: ${user.profileName || 'غير محدد'}\n🔢 الكود: <code>${code}</code>`, { parse_mode: 'HTML' });
                }
            }
            return res.status(200).send('Email Processed');
        }

        // ج. استقبال رسائل تليجرام
        if (req.body && req.body.update_id) {
            await bot.handleUpdate(req.body);
        }
    } catch (err) { 
        console.error("Error in webhook:", err); 
    }
    
    res.status(200).send('OK');
};

// --- 3. أوامر البوت والأزرار ---
bot.start(async (ctx) => {
    const data = await readData();
    if (!data.users.find(u => u.id === ctx.from.id)) {
        data.users.push({ id: ctx.from.id, name: ctx.from.first_name, email: '', profileName: '', expiryDate: '' });
        await writeData(data);
    }
    
    const keyboard = [['📋 حالتي', '🏠 طلب كود نيتفليكس'], ['📞 الدعم']];
    if (ADMIN_IDS.includes(String(ctx.from.id))) {
        keyboard.push(['⚙️ إدارة المشتركين', '🔍 البحث عن زبون']);
    }
    
    ctx.reply('👋 مرحباً بك في بوت إدارة اشتراكات Mrnflix:', Markup.keyboard(keyboard).resize());
});

bot.hears('📋 حالتي', async (ctx) => {
    const data = await readData();
    const user = data.users.find(u => u.id === ctx.from.id);
    if (!user || !user.expiryDate) return ctx.reply('ℹ️ لا يوجد بيانات اشتراك مسجلة لحسابك حالياً.');
    ctx.replyWithHTML(`👤 البروفايل: ${user.profileName}\n📅 تاريخ الانتهاء: <code>${user.expiryDate}</code>\n📧 الحساب المربوط: ${user.email}`);
});

bot.hears('🏠 طلب كود نيتفليكس', (ctx) => {
    ctx.reply('✅ نظام الأكواد التلقائي نشط.\nاطلب الكود الآن من تطبيق Netflix وسيصلك هنا فوراً.');
});

bot.hears('📞 الدعم', (ctx) => {
    ctx.reply('للتحدث مع الدعم الفني، اضغط على الزر أدناه:', Markup.inlineKeyboard([[Markup.button.url('🟢 مراسلة عبر واتساب', 'https://wa.me/213555862000')]]));
});

bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return;
    const data = await readData();
    ctx.reply('اختر الزبون من القائمة (أحدث المشتركين):', 
        Markup.inlineKeyboard(data.users.slice(-20).map(u => [Markup.button.callback(u.name || String(u.id), `select_${u.id}`)]))
    );
});

bot.hears('🔍 البحث عن زبون', (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return;
    tempState[ctx.from.id] = { step: 'searching' };
    ctx.reply('🔎 أرسل اسم الزبون أو جزءاً منه للبحث عنه:');
});

bot.action(/select_(.+)/, (ctx) => {
    tempState[ctx.from.id] = { targetId: ctx.match[1], step: 'email' };
    ctx.answerCbQuery();
    ctx.reply('📧 أرسل الآن إيميل Instaddr الخاص بهذا المشترك:');
});

// --- 4. معالجة النصوص (حالة البحث وحالة إدخال البيانات) ---
bot.on('text', async (ctx, next) => {
    const state = tempState[ctx.from.id];
    if (!state || !ADMIN_IDS.includes(String(ctx.from.id))) return next();

    // 🔴 حماية البوت: إلغاء العملية فوراً إذا ضغط المدير على أي زر رئيسي
    const mainButtons = ['📋 حالتي', '🏠 طلب كود نيتفليكس', '📞 الدعم', '⚙️ إدارة المشتركين', '🔍 البحث عن زبون'];
    if (mainButtons.includes(ctx.message.text)) {
        delete tempState[ctx.from.id];
        return next();
    }

    const data = await readData();

    // حالة البحث
    if (state.step === 'searching') {
        const results = data.users.filter(u => u.name && u.name.toLowerCase().includes(ctx.message.text.toLowerCase()));
        delete tempState[ctx.from.id]; // ننهي البحث
        
        if (results.length === 0) return ctx.reply('❌ لم يتم العثور على زبون بهذا الاسم.');
        return ctx.reply('نتائج البحث:', Markup.inlineKeyboard(results.map(u => [Markup.button.callback(u.name || String(u.id), `select_${u.id}`)])));
    }

    // حالة إدخال البيانات
    const idx = data.users.findIndex(u => u.id === Number(state.targetId));
    if (idx !== -1) {
        if (state.step === 'email') {
            data.users[idx].email = ctx.message.text;
            state.step = 'profile';
            await writeData(data);
            ctx.reply('✅ تم حفظ الإيميل. أرسل الآن "اسم البروفايل":');
        } else if (state.step === 'profile') {
            data.users[idx].profileName = ctx.message.text;
            state.step = 'date';
            await writeData(data);
            ctx.reply('✅ تم حفظ البروفايل. أرسل الآن "تاريخ الانتهاء" (YYYY-MM-DD):');
        } else if (state.step === 'date') {
            data.users[idx].expiryDate = ctx.message.text;
            await writeData(data);
            delete tempState[ctx.from.id]; // ننهي الإدخال
            ctx.reply(`🎉 تم التحديث بنجاح للزبون ${data.users[idx].name}!`);
        }
    }
});
