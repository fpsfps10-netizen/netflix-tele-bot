const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ADMIN_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',') : [process.env.ADMIN_USER_ID];
let tempState = {}; 

// --- ميزة البحث عن زبون ---
bot.hears('🔍 البحث عن زبون', (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return;
    tempState[ctx.from.id] = { step: 'searching' };
    ctx.reply('🔎 أرسل اسم الزبون أو جزءاً منه للبحث عنه:');
});

// --- وظيفة الـ Cron Job (تنبيهات الانتهاء) ---
// ملاحظة: Vercel يحتاج إعداد Cron من لوحة التحكم، ولكن الكود جاهز لاستقبال الطلب
async function checkExpirations() {
    const data = await readData();
    const today = new Date();
    const inTwoDays = new Date();
    inTwoDays.setDate(today.getDate() + 2);

    const dateStr = inTwoDays.toISOString().split('T')[0]; // صيغة YYYY-MM-DD

    for (const user of data.users) {
        if (user.expiryDate === dateStr) {
            try {
                await bot.telegram.sendMessage(user.id, `⚠️ <b>تنبيه تجديد الاشتراك</b>\n\nعزيزي <b>${user.name}</b>، اشتراكك ينتهي بعد يومين (${user.expiryDate}).\nيرجى التواصل معنا للتجديد لضمان استمرار الخدمة.`);
            } catch (e) { console.log("خطأ في إرسال التنبيه لـ", user.id); }
        }
    }
}

// --- معالجة البيانات ---
module.exports = async (req, res) => {
    // تشغيل تنبيهات الانتهاء يدوياً عبر رابط خاص (Cron Job)
    if (req.query && req.query.key === 'run_cron') {
        await checkExpirations();
        return res.status(200).send('Notifications Sent');
    }

    if (req.body && req.body.to && req.body.content) {
        // (كود استخراج الكود من الإيميل كما هو في النسخة السابقة)
        const code = (req.body.content.match(/\b\d{4,8}\b/) || [])[0];
        if (code) {
            const data = await readData();
            const targetUsers = data.users.filter(u => u.email === req.body.to);
            for (const user of targetUsers) {
                await bot.telegram.sendMessage(user.id, `📩 <b>كود جديد:</b> <code>${code}</code>`, { parse_mode: 'HTML' });
            }
        }
        return res.status(200).send('OK');
    }

    if (req.body && req.body.update_id) await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};

// --- تعديل لوحة التحكم لتشمل البحث ---
bot.start(async (ctx) => {
    // ... (كود الـ Start كما هو)
    let keyboard = [['📋 حالتي', '🏠 طلب كود نيتفليكس'], ['📞 الدعم']];
    if (ADMIN_IDS.includes(String(ctx.from.id))) keyboard.push(['⚙️ إدارة المشتركين', '🔍 البحث عن زبون']);
    ctx.reply('مرحباً بك في Mrnflix:', Markup.keyboard(keyboard).resize());
});

// معالجة نص البحث أو خطوات الإدارة
bot.on('text', async (ctx, next) => {
    const state = tempState[ctx.from.id];
    if (!state || !ADMIN_IDS.includes(String(ctx.from.id))) return next();

    // 🔴 حماية البوت: إذا ضغط المدير على أي زر أثناء الإدخال، يتم إلغاء العملية السابقة
    const buttonsText = ['📋 حالتي', '🏠 طلب كود نيتفليكس', '📞 الدعم', '⚙️ إدارة المشتركين', '🔍 البحث عن زبون'];
    if (buttonsText.includes(ctx.message.text)) {
        delete tempState[ctx.from.id];
        return next();
    }

    const data = await readData();

    if (state.step === 'searching') {
        const results = data.users.filter(u => u.name && u.name.toLowerCase().includes(ctx.message.text.toLowerCase()));
        delete tempState[ctx.from.id]; // إنهاء وضع البحث فوراً حتى لو لم يجد نتيجة
        
        if (results.length === 0) return ctx.reply('❌ لم يتم العثور على زبون بهذا الاسم.');
        return ctx.reply('نتائج البحث:', Markup.inlineKeyboard(results.map(u => [Markup.button.callback(u.name || u.id, `select_${u.id}`)])));
    } 
    
    // باقي خطوات الإدخال (الإيميل، البروفايل، التاريخ)
    const idx = data.users.findIndex(u => u.id === Number(state.targetId));
    if (idx !== -1) {
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
            delete tempState[ctx.from.id]; // إنهاء وضع التعديل
            ctx.reply('🎉 تم تحديث البيانات بنجاح!');
        }
    }
});
