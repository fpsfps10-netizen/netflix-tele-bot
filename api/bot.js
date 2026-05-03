const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099; // معرف الأدمن الخاص بك

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send('Monsieur NFLIX: Online');

    try {
        let data = await readData();
        if (!data || !data.users) data = { users: [] };

        // 1. نظام البداية والترحيب
        bot.start(async (ctx) => {
            const userId = ctx.from.id;
            const userName = ctx.from.first_name || "مستخدم";

            let user = data.users.find(u => u.id === userId);
            if (!user) {
                data.users.push({ id: userId, name: userName, clients: {}, expiries: {} });
                await writeData(data);
            }

            const menu = (userId === ADMIN_ID) 
                ? [['⚙️ إدارة المشتركين', '👥 قائمة المسجلين']] 
                : [['🏠 طلب كود نيتفليكس', '📋 حالتي']];
            
            await ctx.reply(`مرحباً بك في Monsieur NFLIX 🎬`, Markup.keyboard(menu).resize());
        });

        // 2. عرض قائمة المشتركين
        bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
            if (ctx.from.id !== ADMIN_ID) return;
            const customers = data.users.filter(u => u.id !== ADMIN_ID);
            
            if (customers.length === 0) return ctx.reply("❌ لا يوجد زبائن حالياً.");

            const buttons = customers.map(u => [Markup.button.callback(`👤 ${u.name}`, `view_user_${u.id}`)]);
            await ctx.reply("⚙️ قائمة المشتركين المسجلين:", Markup.inlineKeyboard(buttons));
        });

        // 3. معالجة الأزرار التفاعلية
        if (req.body.callback_query) {
            const callbackData = req.body.callback_query.data;
            const fromId = req.body.callback_query.from.id;

            if (fromId === ADMIN_ID) {
                const targetId = callbackData.split('_').pop();

                // عرض خيارات الإدارة للمستخدم المختار (مثل شعيب)
                if (callbackData.startsWith('view_user_')) {
                    const controls = [
                        [Markup.button.callback('📧 ربط إيميل جديد', `ask_link_${targetId}`)],
                        [Markup.button.callback('🔄 تجديد الاشتراك', `ask_date_${targetId}`)],
                        [Markup.button.callback('🗑️ حذف الزبون', `confirm_del_${targetId}`)]
                    ];
                    await bot.telegram.sendMessage(ADMIN_ID, `إدارة حساب ID: ${targetId}`, Markup.inlineKeyboard(controls));
                }

                // الخطوة 1: طلب الإيميل فقط
                if (callbackData.startsWith('ask_link_')) {
                    data.pending_action = { type: 'awaiting_email', targetId: targetId };
                    await writeData(data);
                    await bot.telegram.sendMessage(ADMIN_ID, "📧 من فضلك أرسل الإيميل فقط الآن:");
                }

                // الخطوة 2: طلب اسم البروفايل (اختياري)
                if (callbackData.startsWith('ask_prof_')) {
                    const user = data.users.find(u => u.id === parseInt(targetId));
                    const emails = Object.keys(user.clients || {});
                    const lastEmail = emails[emails.length - 1];
                    
                    if (!lastEmail) return ctx.reply("❌ لا يوجد إيميل مربوط حالياً.");
                    
                    data.pending_action = { type: 'awaiting_profile', targetId: targetId, email: lastEmail };
                    await writeData(data);
                    await bot.telegram.sendMessage(ADMIN_ID, `👤 أرسل اسم البروفايل للحساب (${lastEmail}):`);
                }
            }
        }

        // 4. معالجة الرسائل النصية بناءً على الأزرار
        const message = req.body.message;
        if (message && message.from.id === ADMIN_ID && message.text) {
            const text = message.text;

            // تنفيذ ربط الإيميل
            if (data.pending_action?.type === 'awaiting_email') {
                const targetId = parseInt(data.pending_action.targetId);
                const user = data.users.find(u => u.id === targetId);
                
                if (user) {
                    user.clients[text] = "جاري الضبط.."; 
                    user.expiries[text] = "2026-06-03"; // تاريخ تلقائي (شهر)
                    
                    delete data.pending_action;
                    await writeData(data);
                    
                    const nextButtons = Markup.inlineKeyboard([
                        [Markup.button.callback('👤 إضافة اسم بروفايل', `ask_prof_${targetId}`)],
                        [Markup.button.callback('✅ إنهاء الربط', `view_user_${targetId}`)]
                    ]);
                    await bot.telegram.sendMessage(ADMIN_ID, `✅ تم ربط الإيميل: ${text}\nهل تريد إضافة اسم بروفايل لهذا الحساب؟`, nextButtons);
                }
            }

            // تنفيذ إضافة اسم البروفايل
            if (data.pending_action?.type === 'awaiting_profile') {
                const { targetId, email } = data.pending_action;
                const user = data.users.find(u => u.id === parseInt(targetId));
                
                if (user) {
                    user.clients[email] = text; // تحديث "جاري الضبط" بالاسم الفعلي
                    delete data.pending_action;
                    await writeData(data);
                    await bot.telegram.sendMessage(ADMIN_ID, `✅ تم تحديث البروفايل لـ ${email} بنجاح.`);
                }
            }
        }

        await bot.handleUpdate(req.body);
    } catch (e) {
        console.error("Critical Error:", e.message);
    }
    if (!res.writableEnded) res.status(200).send('OK');
};
