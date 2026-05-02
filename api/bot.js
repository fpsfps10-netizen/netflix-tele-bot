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
                // 1. عند الضغط على اسم الزبون: عرض قائمة إيميلاته
                if (callbackData.startsWith('view_user_')) {
                    const targetId = parseInt(callbackData.replace('view_user_', ''));
                    const targetUser = data.users.find(u => u.id === targetId);
                    
                    if (targetUser) {
                        const emails = Object.keys(targetUser.clients || {});
                        if (emails.length > 0) {
                            const emailButtons = emails.map(email => [
                                Markup.button.callback(`📧 ${email}`, `manage_mail_${targetId}_${email}`)
                            ]);
                            emailButtons.push([Markup.button.callback('➕ ربط حساب جديد', `ask_link_${targetId}`)]);
                            
                            await bot.telegram.sendMessage(fromId, `👤 <b>زبون:</b> ${targetUser.name}\nاختر الحساب المراد إدارته:`, {
                                parse_mode: 'HTML',
                                ...Markup.inlineKeyboard(emailButtons)
                            });
                        } else {
                            await bot.telegram.sendMessage(fromId, `👤 ${targetUser.name} ليس لديه حسابات مرتبطة.`, 
                                Markup.inlineKeyboard([[Markup.button.callback('➕ ربط حساب الآن', `ask_link_${targetId}`)]]));
                        }
                    }
                }

                // 2. عند اختيار إيميل محدد: عرض خيارات (البروفايل والتاريخ)
                if (callbackData.startsWith('manage_mail_')) {
                    const [_, __, targetId, email] = callbackData.split('_');
                    const targetUser = data.users.find(u => u.id === parseInt(targetId));
                    const profileName = targetUser.clients[email];
                    const expiry = targetUser.expiries[email];

                    const info = `📝 <b>إدارة اشتراك:</b>\n👤 الزبون: ${targetUser.name}\n📧 الحساب: <code>${email}</code>\n👤 البروفايل الحالي: <b>${profileName}</b>\n📅 ينتهي في: <code>${expiry}</code>`;
                    
                    const controls = [
                        [Markup.button.callback('✏️ تعديل اسم البروفايل', `edit_prof_${targetId}_${email}`)],
                        [Markup.button.callback('📅 تعديل تاريخ الانتهاء', `ask_date_${targetId}_${email}`)],
                        [Markup.button.callback('⬅️ العودة للزبون', `view_user_${targetId}`)]
                    ];
                    await bot.telegram.sendMessage(fromId, info, { parse_mode: 'HTML', ...Markup.inlineKeyboard(controls) });
                }

                // 3. طلب تعديل اسم البروفايل
                if (callbackData.startsWith('edit_prof_')) {
                    const [_, __, targetId, email] = callbackData.split('_');
                    await bot.telegram.sendMessage(fromId, `لتعديل اسم البروفايل للحساب ${email}، ارسل:\n\n<code>/setprofile ${targetId} ${email} الاسم_الجديد</code>`, { parse_mode: 'HTML' });
                }

                // 4. طلب تعديل التاريخ
                if (callbackData.startsWith('ask_date_')) {
                    const [_, __, targetId, email] = callbackData.split('_');
                    await bot.telegram.sendMessage(fromId, `لتعديل تاريخ انتهاء الحساب ${email}، ارسل:\n\n<code>/setdate ${targetId} ${email} 2026-12-31</code>`, { parse_mode: 'HTML' });
                }
            }
            return res.status(200).send('OK');
        }

        // --- الأوامر اليدوية للتنفيذ ---
        const text = req.body.message?.text || "";
        if (req.body.message?.from.id === ADMIN_ID) {
            
            // تنفيذ تعديل البروفايل
            if (text.startsWith('/setprofile')) {
                const [_, targetId, email, newName] = text.split(' ');
                const user = data.users.find(u => u.id === parseInt(targetId));
                if (user && user.clients[email]) {
                    user.clients[email] = newName;
                    await writeData(data);
                    await bot.telegram.sendMessage(ADMIN_ID, `✅ تم تحديث اسم البروفايل إلى: ${newName}`);
                }
            }

            // تنفيذ تعديل التاريخ
            if (text.startsWith('/setdate')) {
                const [_, targetId, email, newDate] = text.split(' ');
                const user = data.users.find(u => u.id === parseInt(targetId));
                if (user && user.expiries[email]) {
                    user.expiries[email] = newDate;
                    await writeData(data);
                    await bot.telegram.sendMessage(ADMIN_ID, `✅ تم تحديث التاريخ إلى: ${newDate}`);
                }
            }
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error(e); }
    if (!res.writableEnded) res.status(200).send('OK');
};
