const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ADMIN_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',') : [process.env.ADMIN_USER_ID];
const WHATSAPP_NUMBER = "213555862000";

// --- دوال إدارة الحالة (لضمان الاستقرار على Vercel) ---
async function setAdminState(userId, stateObj) {
    const data = await readData();
    let user = data.users.find(u => String(u.id) === String(userId));
    if (user) {
        user.adminState = stateObj;
        await writeData(data);
    }
}

async function getAdminState(userId) {
    const data = await readData();
    const user = data.users.find(u => String(u.id) === String(userId));
    return user ? user.adminState : null;
}

async function clearAdminState(userId) {
    await setAdminState(userId, null);
}

// --- دالة التذكير والتحقق من التواريخ ---
async function checkReminder(ctx, user, data) {
    if (!user || !user.expiryDate) return;
    const today = new Date();
    const expiry = new Date(user.expiryDate);
    today.setHours(0,0,0,0);
    expiry.setHours(0,0,0,0);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1 && user.notifiedBefore !== true) {
        await ctx.replyWithHTML(`⏰ تذكير: باقي يوم واحد فقط على انتهاء اشتراكك. يرجى التجديد لتفادي الانقطاع.`);
        user.notifiedBefore = true;
        await writeData(data);
    }
    else if (diffDays === 0 && user.notifiedOnEnd !== true) {
        await ctx.replyWithHTML(`⚠️ اليوم هو آخر يوم في اشتراكك! لتجديد الاشتراك تواصل مع الدعم.`);
        user.notifiedOnEnd = true;
        await writeData(data);
    }
}

// --- معالج الـ Webhook (استقبال الأكواد والتحديثات) ---
module.exports = async (req, res) => {
    try {
        if (req.body && req.body.to && req.body.content) {
            const code = (req.body.content.match(/\b\d{4,8}\b/) || [])[0];
            if (code) {
                const data = await readData();
                const targetUsers = data.users.filter(u => u.email === req.body.to);
                for (const user of targetUsers) {
                    // فحص إذا كان اشتراك المستخدم مازال سارياً قبل إرسال الكود
                    const today = new Date();
                    const expiry = new Date(user.expiryDate || 0);
                    if (expiry >= today) {
                        await bot.telegram.sendMessage(user.id, `📩 <b>وصلك كود جديد!</b>\n🔢 الكود: <code>${code}</code>`, { parse_mode: 'HTML' });
                    }
                }
            }
            return res.status(200).send('OK');
        }
        if (req.body && req.body.update_id) { await bot.handleUpdate(req.body); }
    } catch (e) { console.error(e); }
    res.status(200).send('OK');
};

// --- الأوامر الأساسية ---
bot.start(async (ctx) => {
    const data = await readData();
    let user = data.users.find(u => u.id === ctx.from.id);
    if (!user) {
        user = { id: ctx.from.id, name: ctx.from.first_name, email: '', profileName: '', expiryDate: '', adminState: null };
        data.users.push(user);
        await writeData(data);
    }
    const keyboard = [
        ['📋 حالتي', '🏠 طلب كود نيتفليكس'],
        ['📞 الدعم', '🔄 تجديد الاشتراك']
    ];
    if (ADMIN_IDS.includes(String(ctx.from.id))) keyboard.push(['⚙️ إدارة المشتركين', '🔍 البحث عن زبون']);
    
    await ctx.reply('مرحباً بك في Mrnflix:', Markup.keyboard(keyboard).resize());
});

bot.hears('📋 حالتي', async (ctx) => {
    await clearAdminState(ctx.from.id);
    const data = await readData();
    const user = data.users.find(u => u.id === ctx.from.id);
    if (!user || !user.expiryDate) return ctx.reply('ℹ️ لا يوجد اشتراك مسجل حالياً.');

    const today = new Date();
    const expiry = new Date(user.expiryDate);
    today.setHours(0,0,0,0);
    expiry.setHours(0,0,0,0);
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    
    let msg = `👤 البروفايل: ${user.profileName || 'غير محدد'}\n📅 الانتهاء: <code>${user.expiryDate}</code>`;
    msg += diffDays >= 0 ? `\n⏳ المتبقي: <b>${diffDays}</b> يوم` : `\n❗️ انتهى منذ: <b>${Math.abs(diffDays)}</b> يوم`;
    ctx.replyWithHTML(msg);
});

bot.hears('🏠 طلب كود نيتفليكس', async (ctx) => {
    await clearAdminState(ctx.from.id);
    const data = await readData();
    const user = data.users.find(u => u.id === ctx.from.id);
    
    if (!user || !user.expiryDate) return ctx.reply('⚠️ ليس لديك اشتراك نشط.');

    const today = new Date();
    const expiry = new Date(user.expiryDate);
    today.setHours(0,0,0,0);
    expiry.setHours(0,0,0,0);

    if (expiry < today) {
        return ctx.replyWithHTML(`🚫 <b>اشتراكك منتهٍ!</b>\nانتهى بتاريخ: <code>${user.expiryDate}</code>\nيرجى التجديد لتفعيل طلب الأكواد.`);
    }

    if (!user.email) return ctx.reply('⚠️ حسابك غير مربوط ببريد إلكتروني. تواصل مع الإدارة.');

    ctx.reply('✅ نظام الأكواد نشط. سيصلك الكود هنا فور طلبه من التطبيق.');
});

bot.hears('📞 الدعم', (ctx) => ctx.reply(`📞 للدوام عبر الواتساب: https://wa.me/${WHATSAPP_NUMBER}`));

bot.hears('🔄 تجديد الاشتراك', (ctx) => ctx.reply('🔔 لتجديد الاشتراك يرجى التواصل مع الدعم الفني.'));

// --- قسم الإدارة ---
bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return;
    const data = await readData();
    const list = data.users.slice(-15).map(u => [Markup.button.callback(u.name || String(u.id), `select_${u.id}`)]);
    ctx.reply('⚙️ قائمة آخر المشتركين:', Markup.inlineKeyboard(list));
});

bot.hears('🔍 البحث عن زبون', async (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return;
    await setAdminState(ctx.from.id, { step: 'searching' });
    ctx.reply('🔎 أرسل اسم الزبون أو الإيميل للبحث:');
});

bot.action(/select_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    ctx.answerCbQuery();
    ctx.reply('اختر الإجراء:', Markup.inlineKeyboard([
        [Markup.button.callback('🗑 حذف', `delete_${userId}`)],
        [Markup.button.callback('🔁 تجديد (YYYY-MM-DD)', `renew_${userId}`)],
        [Markup.button.callback('📧 ربط إيميل', `email_${userId}`)],
        [Markup.button.callback('👤 اسم البروفايل', `profile_${userId}`)]
    ]));
});

bot.action(/delete_(.+)/, async (ctx) => {
    const data = await readData();
    data.users = data.users.filter(u => String(u.id) !== String(ctx.match[1]));
    await writeData(data);
    ctx.answerCbQuery('تم الحذف');
    ctx.reply('✅ تم حذف المشترك.');
});

bot.action(/renew_(.+)/, async (ctx) => {
    await setAdminState(ctx.from.id, { targetId: ctx.match[1], step: 'renew' });
    ctx.answerCbQuery();
    ctx.reply('🗓 أرسل التاريخ الجديد (YYYY-MM-DD):');
});

bot.action(/email_(.+)/, async (ctx) => {
    await setAdminState(ctx.from.id, { targetId: ctx.match[1], step: 'email' });
    ctx.answerCbQuery();
    ctx.reply('📧 أرسل الإيميل الجديد:');
});

bot.action(/profile_(.+)/, async (ctx) => {
    await setAdminState(ctx.from.id, { targetId: ctx.match[1], step: 'profile' });
    ctx.answerCbQuery();
    ctx.reply('👤 أرسل اسم البروفايل:');
});

// --- معالج النصوص لعمليات الإدارة ---
bot.on('text', async (ctx, next) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return next();
    const state = await getAdminState(ctx.from.id);
    if (!state) return next();

    const data = await readData();
    if (state.step === 'searching') {
        const query = ctx.message.text.toLowerCase();
        const results = data.users.filter(u => (u.name && u.name.toLowerCase().includes(query)) || (u.email && u.email.toLowerCase().includes(query)));
        await clearAdminState(ctx.from.id);
        if (results.length === 0) return ctx.reply('❌ لا توجد نتائج.');
        return ctx.reply('نتائج البحث:', Markup.inlineKeyboard(results.map(u => [Markup.button.callback(u.name, `select_${u.id}`)])));
    }

    const targetIdx = data.users.findIndex(u => String(u.id) === String(state.targetId));
    if (targetIdx === -1) return await clearAdminState(ctx.from.id);

    if (state.step === 'renew') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ctx.message.text)) return ctx.reply('❌ خطأ في الصيغة.');
        data.users[targetIdx].expiryDate = ctx.message.text;
        data.users[targetIdx].notifiedBefore = false;
        data.users[targetIdx].notifiedOnEnd = false;
    } else if (state.step === 'email') {
        data.users[targetIdx].email = ctx.message.text.trim();
    } else if (state.step === 'profile') {
        data.users[targetIdx].profileName = ctx.message.text.trim();
    }

    await writeData(data);
    await clearAdminState(ctx.from.id);
    ctx.reply('✅ تم التحديث بنجاح.');
});
