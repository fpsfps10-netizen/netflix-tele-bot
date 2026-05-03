const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send('Monsieur NFLIX System: Active');

    try {
        const data = await readData();

        // 1. نظام طلب الكود مع المنع التلقائي (للمشتركين)
        bot.hears('🏠 طلب كود نيتفليكس', async (ctx) => {
            const user = data.users.find(u => u.id === ctx.from.id);
            if (!user) return ctx.reply("❌ نتا مزال ماكش مسجل عندنا. تواصل مع @Monsieur_NFLIX.");

            const emails = Object.keys(user.clients || {});
            if (emails.length === 0) return ctx.reply("❌ ليس لديك حسابات نشطة حالياً.");

            const today = new Date();
            let activeAccounts = [];

            // فحص الصلاحية لكل إيميل مرتبط بالزبون
            for (const email of emails) {
                const expiryStr = (user.expiries && user.expiries[email]) ? user.expiries[email] : null;
                const expiryDate = expiryStr ? new Date(expiryStr) : null;

                if (expiryDate && expiryDate >= today) {
                    activeAccounts.push(email);
                }
            }

            if (activeAccounts.length === 0) {
                return ctx.reply("⚠️ <b>الاشتراك تاعك خلاص!</b>\nتواصل مع الدعم للتجديد.", { parse_mode: 'HTML' });
            }

            // عرض الحسابات النشطة فقط للزبون
            const buttons = activeAccounts.map(email => [
                Markup.button.callback(`📺 طلب كود: ${user.clients[email]}`, `get_code_${email}`)
            ]);
            await ctx.reply("اختر الحساب المطلوب:", Markup.inlineKeyboard(buttons));
        });

        // 2. معالجة الأزرار (Admin & User)
        if (req.body.callback_query) {
            const callbackData = req.body.callback_query.data;
            const fromId = req.body.callback_query.from.id;

            // تنفيذ طلب الكود للزبون
            if (callbackData.startsWith('get_code_')) {
                const email = callbackData.replace('get_code_', '');
                await bot.telegram.sendMessage(fromId, `✅ تم إرسال طلب الكود لحساب: ${email}. تفقد بريدك أو شاشة التلفاز.`);
            }

            // إدارة الأدمن (لوحة التحكم)
            if (fromId === ADMIN_ID) {
                if (callbackData.startsWith('view_user_')) {
                    const targetId = parseInt(callbackData.replace('view_user_', ''));
                    const targetUser = data.users.find(u => u.id === targetId);
                    if (targetUser) {
                        const emails = Object.keys(targetUser.clients || {});
                        const emailButtons = emails.map(email => [
                            Markup.button.callback(`📧 ${email}`, `manage_mail_${targetId}_${email}`)
                        ]);
                        emailButtons.push([Markup.button.callback('➕ ربط إيميل جديد', `ask_link_${targetId}`)]);
                        emailButtons.push([Markup.button.callback('⬅️ عودة', 'admin_list')]);
                        await bot.telegram.sendMessage(fromId, `👤 <b>إدارة:</b> ${targetUser.name}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(emailButtons) });
                    }
                }

                if (callbackData.startsWith('manage_mail_')) {
                    const [_, __, targetId, email] = callbackData.split('_');
                    const targetUser = data.users.find(u => u.id === parseInt(targetId));
                    const currentExpiry = (targetUser.expiries && targetUser.expiries[email]) ? targetUser.expiries[email] : "غير محدد";
                    
                    const controls = [
                        [Markup.button.callback('📅 تعديل التاريخ', `ask_date_${targetId}_${email}`)],
                        [Markup.button.callback('🗑️ حذف الحساب', `del_mail_${targetId}_${email}`)],
                        [Markup.button.callback('⬅️ عودة', `view_user_${targetId}`)]
                    ];
                    await bot.telegram.sendMessage(fromId, `⚙️ <b>الحساب:</b> ${email}\n📅 ينتهي في: ${currentExpiry}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(controls) });
                }

                if (callbackData === 'admin_list') {
                    const customers = data.users.filter(u => u.id !== ADMIN_ID);
                    const buttons = customers.map(u => [Markup.button.callback(`👤 ${u.name}`, `view_user_${u.id}`)]);
                    await bot.telegram.sendMessage(fromId, "⚙️ قائمة الزبائن:", Markup.inlineKeyboard(buttons));
                }
            }
            return res.status(200).send('OK');
        }

        // 3. الأوامر النصية الأساسية
        bot.start(async (ctx) => {
            const menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['⚙️ إدارة المشتركين']];
            await ctx.reply("مرحباً بك في Monsieur NFLIX 🎬", Markup.keyboard(menu).resize());
        });

        bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
            if (ctx.from.id === ADMIN_ID) {
                const customers = data.users.filter(u => u.id !== ADMIN_ID);
                const buttons = customers.map(u => [Markup.button.callback(`👤 ${u.name}`, `view_user_${u.id}`)]);
                await ctx.reply("⚙️ اختر زبوناً:", Markup.inlineKeyboard(buttons));
            }
        });

        // أوامر الـ Admin النصية للتحديث (مثل /setdate)
        const text = req.body.message?.text || "";
        if (req.body.message?.from.id === ADMIN_ID) {
            if (text.startsWith('/setdate')) {
                const [_, targetId, email, date] = text.split(' ');
                const user = data.users.find(u => u.id === parseInt(targetId));
                if (user) {
                    if (!user.expiries) user.expiries = {};
                    user.expiries[email] = date;
                    await writeData(data);
                    await bot.telegram.sendMessage(ADMIN_ID, `✅ تم تحديث تاريخ ${email} إلى ${date}`);
                }
            }
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Error:", e.message); }
    if (!res.writableEnded) res.status(200).send('OK');
};
