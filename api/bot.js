const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    // استجابة سريعة للسيرفر لتجنب التوقف
    if (req.method !== 'POST') return res.status(200).send('Monsieur NFLIX System: Online');

    try {
        const data = await readData();

        // 1. استقبال إشعارات MailNow (تلقائي)
        if (req.body && req.body.content && !req.body.message) {
            const content = req.body.content;
            await bot.telegram.sendMessage(ADMIN_ID, `📩 <b>كود جديد وصل:</b>\n\n<code>${content}</code>`, { parse_mode: 'HTML' });
            return res.status(200).send('OK');
        }

        // 2. معالجة الأزرار (Inline Buttons) - الإدارة المتقدمة
        if (req.body.callback_query) {
            const callbackData = req.body.callback_query.data;
            const fromId = req.body.callback_query.from.id;

            if (fromId === ADMIN_ID) {
                // عرض إيميلات الزبون المختار
                if (callbackData.startsWith('view_user_')) {
                    const targetId = parseInt(callbackData.replace('view_user_', ''));
                    const targetUser = data.users.find(u => u.id === targetId);
                    
                    if (targetUser) {
                        const emails = Object.keys(targetUser.clients || {});
                        const emailButtons = emails.map(email => [
                            Markup.button.callback(`📧 ${email}`, `manage_mail_${targetId}_${email}`)
                        ]);
                        emailButtons.push([Markup.button.callback('➕ ربط إيميل جديد', `ask_link_${targetId}`)]);
                        emailButtons.push([Markup.button.callback('⬅️ عودة للقائمة', 'admin_list')]);
                        
                        await bot.telegram.sendMessage(fromId, `👤 <b>إدارة:</b> ${targetUser.name}\nاختر الحساب لتعديله:`, {
                            parse_mode: 'HTML',
                            ...Markup.inlineKeyboard(emailButtons)
                        });
                    }
                }

                // لوحة تحكم الإيميل المختار
                if (callbackData.startsWith('manage_mail_')) {
                    const [_, __, targetId, email] = callbackData.split('_');
                    const targetUser = data.users.find(u => u.id === parseInt(targetId));
                    const currentProfile = targetUser.clients[email] || "غير محدد";
                    const currentExpiry = (targetUser.expiries && targetUser.expiries[email]) ? targetUser.expiries[email] : "غير محدد";

                    const info = `⚙️ <b>إعدادات الحساب:</b>\n📧 الحساب: <code>${email}</code>\n👤 البروفايل: <b>${currentProfile}</b>\n📅 ينتهي في: <code>${currentExpiry}</code>`;
                    
                    const controls = [
                        [Markup.button.callback('👤 تعديل البروفايل', `edit_prof_${targetId}_${email}`)],
                        [Markup.button.callback('📅 تعديل التاريخ', `ask_date_${targetId}_${email}`)],
                        [Markup.button.callback('⬅️ عودة للإيميلات', `view_user_${targetId}`)]
                    ];
                    await bot.telegram.sendMessage(fromId, info, { parse_mode: 'HTML', ...Markup.inlineKeyboard(controls) });
                }

                // طلب الأوامر اليدوية
                if (callbackData === 'admin_list') {
                    const customers = data.users.filter(u => u.id !== ADMIN_ID);
                    const buttons = customers.map(u => [Markup.button.callback(`👤 ${u.name}`, `view_user_${u.id}`)]);
                    await bot.telegram.sendMessage(fromId, "⚙️ قائمة الزبائن:", Markup.inlineKeyboard(buttons));
                }

                if (callbackData.startsWith('edit_prof_')) {
                    const [_, __, targetId, email] = callbackData.split('_');
                    await bot.telegram.sendMessage(fromId, `لتغيير بروفايل <code>${email}</code>، ارسل:\n\n<code>/setprofile ${targetId} ${email} الاسم_الجديد</code>`, { parse_mode: 'HTML' });
                }

                if (callbackData.startsWith('ask_date_')) {
                    const [_, __, targetId, email] = callbackData.split('_');
                    await bot.telegram.sendMessage(fromId, `لتحديد تاريخ جديد لـ <code>${email}</code>، ارسل:\n\n<code>/setdate ${targetId} ${email} 2026-12-31</code>`, { parse_mode: 'HTML' });
                }
                
                if (callbackData.startsWith('ask_link_')) {
                    const targetId = callbackData.replace('ask_link_', '');
                    await bot.telegram.sendMessage(fromId, `لربط إيميل جديد، ارسل:\n\n<code>/link ${targetId} example@mail.com اسم_البروفايل</code>`, { parse_mode: 'HTML' });
                }
            }
            return res.status(200).send('OK');
        }

        // 3. معالجة الرسائل النصية والأوامر
        bot.start(async (ctx) => {
            const menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['⚙️ إدارة المشتركين']];
            await ctx.reply("مرحباً بك في Monsieur NFLIX:", Markup.keyboard(menu).resize());
        });

        bot.hears('⚙️ إدارة المشتركين', async (ctx) => {
            if (ctx.from.id === ADMIN_ID) {
                const customers = data.users.filter(u => u.id !== ADMIN_ID);
                if (customers.length > 0) {
                    const buttons = customers.map(u => [Markup.button.callback(`👤 ${u.name}`, `view_user_${u.id}`)]);
                    await ctx.reply("⚙️ اختر زبوناً للإدارة:", Markup.inlineKeyboard(buttons));
                } else {
                    await ctx.reply("❌ لا يوجد زبائن حالياً.");
                }
            }
        });

        // تنفيذ أوامر التعديل (Admin Only)
        const text = req.body.message?.text || "";
        if (req.body.message?.from.id === ADMIN_ID) {
            
            if (text.startsWith('/link')) {
                const [_, targetId, email, ...prof] = text.split(' ');
                const user = data.users.find(u => u.id === parseInt(targetId));
                if (user) {
                    if (!user.clients) user.clients = {};
                    if (!user.expiries) user.expiries = {};
                    user.clients[email] = prof.join(' ');
                    user.expiries[email] = "غير محدد";
                    await writeData(data);
                    await bot.telegram.sendMessage(ADMIN_ID, `✅ تم ربط ${email} بـ ${user.name}`);
                }
            }

            if (text.startsWith('/setprofile')) {
                const [_, targetId, email, ...nameParts] = text.split(' ');
                const user = data.users.find(u => u.id === parseInt(targetId));
                if (user && user.clients[email]) {
                    user.clients[email] = nameParts.join(' ');
                    await writeData(data);
                    await bot.telegram.sendMessage(ADMIN_ID, `✅ تم تحديث بروفايل ${email}`);
                }
            }

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
    } catch (e) {
        console.error("Critical Error:", e.message);
    }
    if (!res.writableEnded) res.status(200).send('OK');
};
