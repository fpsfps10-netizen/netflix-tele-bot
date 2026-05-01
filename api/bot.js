const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ADMIN_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',') : [process.env.ADMIN_USER_ID];
const WHATSAPP_NUMBER = "213555862000";

// --- دوال مساعدة لحفظ حالة الأدمن في قاعدة البيانات (بديل tempState) ---
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

// --- دالة التذكير التلقائية ---
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
        await ctx.replyWithHTML(`⚠️ اليوم هو آخر يوم في اشتراكك! لتجديد الاشتراك تواصل مع الدعم لتفادي توقف الخدمة.`);
        user.notifiedOnEnd = true;
        await writeData(data);
    }
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

bot.start(async (ctx) => {
    const data = await readData();
    let isNew = false;
    let user = data.users.find(u => u.id === ctx.from.id);
    if (!user) {
        user = { id: ctx.from.id, name: ctx.from.first_name, email: '', profileName: '', expiryDate: '', adminState: null };
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
    await clearAdminState(ctx.from.id);
    const data = await readData();
    const user = data.users.find(u => u.id === ctx.from.id);
    if (!user || !user.expiryDate) return ctx.reply('ℹ️ لا يوجد اشتراك مسجل.');

    await checkReminder(ctx, user, data);
    const today = new Date();
    const expiry = new Date(user.expiryDate);
    today.setHours(0,0,0,0);
    expiry.setHours(0,0,0,0);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    let msg = `👤 البروفايل: ${user.profileName || 'غير مسجل'}\n📅 الانتهاء: <code>${user.expiryDate}</code>`;
    if (diffDays >= 0)
        msg += `\n⏳ المتبقي: <b>${diffDays}</b> يوم`;
    else
        msg += `\n❗️ انتهى الاشتراك منذ <b>${Math.abs(diffDays)}</b> يوم`;
    ctx.replyWithHTML(msg);
});

bot.hears('🏠 طلب كود نيتفليكس', async (ctx) => {
    await clearAdminState(ctx.from.id);
    const data = await readData();
    const user = data.users.find(u => u.id === ctx.from.id);
    await checkReminder(ctx, user, data);
    ctx.reply('✅ نظام الأكواد التلقائي نشط. سيصلك الكود هنا بمجرد طلبه من تطبيق نيتفليكس بشرط أن يكون بريدك الإلكتروني مربوطاً بحسابك.');
});

bot.hears('📞 الدعم', async (ctx) => {
    await clearAdminState(ctx.from.id);
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
    await clearAdminState(ctx.from.id);
    const data = await readData();
    const user = data.users.find(u => u.id === ctx.from.id);
    await checkReminder(ctx, user, data);

    ctx.reply('🔔 لتجديد الاشتراك يرجى التواصل عبر الواتساب مع الدعم.');
});

// --- أوامر الإدارة ---
bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return;
    await clearAdminState(ctx.from.id);
    const data = await readData();
    const list = data.users.slice(-15).map(u => [Markup.button.callback(u.name || String(u.id), `select_${u.id}`)]);
    ctx.reply('⚙️ قائمة آخر المشتركين للتعديل:', Markup.inlineKeyboard(list));
});

bot.hears('🔍 البحث عن زبون', async (ctx) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return;
    await setAdminState(ctx.from.id, { step: 'searching' });
    ctx.reply('🔎 أرسل اسم الزبون أو الإيميل الخاص به للبحث عنه:');
});

// --- عند اختيار زبون من الإدارة ---
bot.action(/select_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    await clearAdminState(ctx.from.id); // مسح أي حالة سابقة
    ctx.answerCbQuery();

    await ctx.reply(
      'اختر الإجراء المرغوب للمشترك:',
      Markup.inlineKeyboard([
        [Markup.button.callback('🗑 حذف هذا المشترك', `delete_${userId}`)],
        [Markup.button.callback('🔁 تجديد / إضافة تاريخ الانتهاء', `renew_${userId}`)],
        [Markup.button.callback('📧 ربط أو تعديل إيميل الأكواد', `email_${userId}`)],
        [Markup.button.callback('👤 تعديل اسم البروفايل', `profile_${userId}`)]
      ])
    );
});

// --- حذف المشترك ---
bot.action(/delete_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    const data = await readData();
    const idx = data.users.findIndex(u => String(u.id) === String(userId));
    if (idx !== -1) {
        const deletedUser = data.users[idx];
        data.users.splice(idx, 1);
        await writeData(data);
        ctx.reply(`✅ تم حذف المشترك (${deletedUser.name || deletedUser.id}) بنجاح!`);
    } else {
        ctx.reply('❌ لم يتم العثور على هذا المشترك.');
    }
    await clearAdminState(ctx.from.id);
    ctx.answerCbQuery();
});

// --- تجهيز حالات الإدارة من أزرار الإنلاين ---
bot.action(/renew_(.+)/, async (ctx) => {
    await setAdminState(ctx.from.id, { targetId: ctx.match[1], step: 'renew' });
    ctx.answerCbQuery();
    ctx.reply('🗓 أرسل تاريخ الانتهاء الجديد بصيغة (YYYY-MM-DD) مثال: 2026-07-01');
});

bot.action(/email_(.+)/, async (ctx) => {
    await setAdminState(ctx.from.id, { targetId: ctx.match[1], step: 'email' });
    ctx.answerCbQuery();
    ctx.reply('📧 أرسل البريد الإلكتروني (Instaddr) لربطه بهذا الزبون:');
});

bot.action(/profile_(.+)/, async (ctx) => {
    await setAdminState(ctx.from.id, { targetId: ctx.match[1], step: 'profile' });
    ctx.answerCbQuery();
    ctx.reply('👤 أرسل اسم البروفايل الخاص بهذا الزبون:');
});

// --- معالج النصوص (لبحث، تجديد، إيميل، بروفايل) ---
bot.on('text', async (ctx, next) => {
    if (!ADMIN_IDS.includes(String(ctx.from.id))) return next();

    const state = await getAdminState(ctx.from.id);
    if (!state || !state.step) return next();

    const data = await readData();

    // البحث المتقدم عن زبون
    if (state.step === 'searching') {
        const query = ctx.message.text.toLowerCase();
        // البحث بالاسم أو الإيميل
        const results = data.users.filter(u => 
            (u.name && u.name.toLowerCase().includes(query)) || 
            (u.email && u.email.toLowerCase().includes(query))
        );
        await clearAdminState(ctx.from.id);
        if (results.length === 0) return ctx.reply('❌ لم يتم العثور على زبون يحمل هذا الاسم أو الإيميل.');
        
        return ctx.reply('نتائج البحث:', Markup.inlineKeyboard(
            results.map(u => [Markup.button.callback(`${u.name} ${u.email ? `(${u.email})` : ''}`, `select_${u.id}`)])
        ));
    }

    // المعالجات التي تتطلب معرفة الزبون المستهدف
    const targetIdx = data.users.findIndex(u => String(u.id) === String(state.targetId));
    if (targetIdx === -1) {
        await clearAdminState(ctx.from.id);
        return ctx.reply('❌ حدث خطأ، لم يتم العثور على الزبون في قاعدة البيانات.');
    }

    // التجديد
    if (state.step === 'renew') {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(ctx.message.text)) {
            return ctx.reply('❌ صيغة التاريخ غير صحيحة! الرجاء كتابة التاريخ بصيغة السنة-الشهر-اليوم (مثال: 2026-07-01).');
        }
        data.users[targetIdx].expiryDate = ctx.message.text;
        data.users[targetIdx].notifiedBefore = false;
        data.users[targetIdx].notifiedOnEnd = false;
        await writeData(data);
        await clearAdminState(ctx.from.id);
        return ctx.reply(`✅ تم تجديد اشتراك الزبون بنجاح!\nتاريخ الانتهاء الجديد: ${ctx.message.text}`);
    }

    // ربط الإيميل
    if (state.step === 'email') {
        data.users[targetIdx].email = ctx.message.text.trim();
        await writeData(data);
        await clearAdminState(ctx.from.id);
        return ctx.reply(`✅ تم ربط الإيميل بنجاح!\nالإيميل المسجل: ${data.users[targetIdx].email}`);
    }

    // ربط البروفايل
    if (state.step === 'profile') {
        data.users[targetIdx].profileName = ctx.message.text.trim();
        await writeData(data);
        await clearAdminState(ctx.from.id);
        return ctx.reply(`✅ تم تحديث اسم البروفايل بنجاح!\nالاسم الجديد: ${data.users[targetIdx].profileName}`);
    }
});
