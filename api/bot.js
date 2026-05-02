const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    try {
        const data = await readData();

        if (req.body && req.body.callback_query) {
            const callbackData = req.body.callback_query.data;
            const fromId = req.body.callback_query.from.id;

            if (fromId === ADMIN_ID) {
                // 1. اختيار الإيميل بعد الضغط على اسم الزبون
                if (callbackData.startsWith('view_user_')) {
                    const targetId = parseInt(callbackData.replace('view_user_', ''));
                    const targetUser = data.users.find(u => u.id === targetId);
                    
                    if (targetUser) {
                        const emails = Object.keys(targetUser.clients || {});
                        if (emails.length > 0) {
                            const emailButtons = emails.map(email => [
                                Markup.button.callback(`📧 ${email}`, `manage_mail_${targetId}_${email}`)
                            ]);
                            emailButtons.push([Markup.button.callback('➕ ربط إيميل جديد لهذا الزبون', `ask_link_${targetId}`)]);
                            
                            await bot.telegram.sendMessage(fromId, `👤 <b>إدارة الزبون:</b> ${targetUser.name}\nاختر الحساب المراد تعديله:`, {
                                parse_mode: 'HTML',
                                ...Markup.inlineKeyboard(emailButtons)
                            });
                        } else {
                            await bot.telegram.sendMessage(fromId, `⚠️ لا توجد إيميلات مرتبطة بـ ${targetUser.name}`, 
                                Markup.inlineKeyboard([[Markup.button.callback('🔗 ربط أول إيميل الآن', `ask_link_${targetId}`)]]));
                        }
                    }
                }

                // 2. لوحة تحكم الإيميل المختار (تعديل البروفايل والتاريخ)
                if (callbackData.startsWith('manage_mail_')) {
                    const [_, __, targetId, email] = callbackData.split('_');
                    const targetUser = data.users.find(u => u.id === parseInt(targetId));
                    const currentProfile = targetUser.clients[email] || "غير محدد";
                    const currentExpiry = targetUser.expiries[email] || "غير محدد";

                    const info = `⚙️ <b>إعدادات الحساب:</b>\n📧 الحساب: <code>${email}</code>\n👤 البروفايل: <b>${currentProfile}</b>\n📅 ينتهي في: <code>${currentExpiry}</code>`;
                    
                    const controls = [
                        [Markup.button.callback('👤 تعديل اسم البروفايل', `edit_prof_${targetId}_${email}`)],
                        [Markup.button.callback('📅 تعديل تاريخ الانتهاء', `ask_date_${targetId}_${email}`)],
                        [Markup.button.callback('⬅️ عودة لقائمة الإيميلات', `view_user_${targetId}`)]
                    ];
                    await bot.telegram.sendMessage(fromId, info, { parse_mode: 'HTML', ...Markup.inlineKeyboard(controls) });
                }

                // طلب الأوامر اليدوية للتعديل
                if (callbackData.startsWith('edit_prof_')) {
                    const [_, __, targetId, email] = callbackData.split('_');
                    await bot.telegram.sendMessage(fromId, `لتغيير اسم بروفايل <code>${email}</code>، ارسل:\n\n<code>/setprofile ${targetId} ${email} الاسم_الجديد</code>`, { parse_mode: 'HTML' });
                }

                if (callbackData.startsWith('ask_date_')) {
                    const [_, __, targetId, email] = callbackData.split('_');
                    await bot.telegram.sendMessage(fromId, `لتحديد تاريخ انتهاء جديد لـ <code>${email}</code>، ارسل:\n\n<code>/setdate ${targetId} ${email} 2026-12-31</code>`, { parse_mode: 'HTML' });
                }
                
                if (callbackData.startsWith('ask_link_')) {
                    const targetId = callbackData.replace('ask_link_', '');
                    await bot.telegram.sendMessage(fromId, `لربط إيميل جديد بـ <code>${targetId}</code>، ارسل:\n\n<code>/link ${targetId} example@mail.com اسم_البروفايل</code>`, { parse_mode: 'HTML' });
                }
            }
            return res.status(200).send('OK');
        }

        // 3. تنفيذ عمليات التعديل من خلال الرسائل (Admin Only)
        const text = req.body.message?.text || "";
        const chatId = req.body.message?.from.id;

        if (chatId === ADMIN_ID) {
            // تحديث اسم البروفايل
            if (text.startsWith('/setprofile')) {
                const [_, targetId, email, ...nameParts] = text.split(' ');
                const newName = nameParts.join(' ');
                const user = data.users.find(u => u.id === parseInt(targetId));
                if (user && user.clients[email]) {
                    user.clients[email] = newName;
                    await writeData(data);
                    await bot.telegram.sendMessage(ADMIN_ID, `✅ تم تحديث البروفايل لـ ${email} إلى: ${newName}`);
                }
            }

            // تحديث التاريخ مباشرة
            if (text.startsWith('/setdate')) {
                const [_, targetId, email, date] = text.split(' ');
                const user = data.users.find(u => u.id === parseInt(targetId));
                if (user && user.expiries[email]) {
                    user.expiries[email] = date;
                    await writeData(data);
                    await bot.telegram.sendMessage(ADMIN_ID, `✅ تم تحديث تاريخ انتهاء ${email} إلى: ${date}`);
                }
            }
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Error:", e.message); }
    if (!res.writableEnded) res.status(200).send('OK');
};
