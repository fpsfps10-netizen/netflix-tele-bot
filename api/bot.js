const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

// توكن البوت ومعرف الإدمن الخاص بك
const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    // 1. ضمان استجابة سريعة لتليجرام لتجنب تعليق البوت (403/504)
    if (!res.headersSent) {
        res.status(200).send('OK');
    }

    try {
        const data = await readData();

        // 2. معالجة نقرات الأزرار (Callback Queries)
        if (req.body && req.body.callback_query) {
            const callbackData = req.body.callback_query.data;
            const fromId = req.body.callback_query.from.id;

            if (fromId === ADMIN_ID) {
                // المرحلة الأولى: عرض قائمة الإيميلات عند اختيار زبون (Wassim, Badi, إلخ)
                if (callbackData.startsWith('view_user_')) {
                    const targetId = parseInt(callbackData.replace('view_user_', ''));
                    const targetUser = data.users.find(u => u.id === targetId);
                    
                    if (targetUser) {
                        const emails = Object.keys(targetUser.clients || {});
                        const buttons = emails.map(email => [
                            Markup.button.callback(`📧 ${email}`, `manage_mail_${targetId}_${email}`)
                        ]);
                        buttons.push([Markup.button.callback('➕ ربط حساب جديد', `ask_link_${targetId}`)]);
                        
                        await bot.telegram.sendMessage(fromId, `👤 <b>إدارة الزبون:</b> ${targetUser.name}\nاختر الحساب المطلوب:`, {
                            parse_mode: 'HTML',
                            ...Markup.inlineKeyboard(buttons)
                        });
                    }
                }

                // المرحلة الثانية: لوحة تحكم الإيميل المختار (بروفايل + تاريخ)
                if (callbackData.startsWith('manage_mail_')) {
                    const [_, __, targetId, email] = callbackData.split('_');
                    const targetUser = data.users.find(u => u.id === parseInt(targetId));
                    const currentProf = targetUser.clients[email];
                    const currentExp = targetUser.expiries[email];

                    const info = `⚙️ <b>إعدادات الحساب:</b>\n📧 ${email}\n👤 البروفايل: <b>${currentProf}</b>\n📅 ينتهي: <code>${currentExp}</code>`;
                    
                    const controls = [
                        [Markup.button.callback('👤 تعديل البروفايل', `edit_prof_${targetId}_${email}`)],
                        [Markup.button.callback('📅 تعديل التاريخ', `ask_date_${targetId}_${email}`)],
                        [Markup.button.callback('⬅️ عودة لقائمة الإيميلات', `view_user_${targetId}`)]
                    ];
                    await bot.telegram.sendMessage(fromId, info, { parse_mode: 'HTML', ...Markup.inlineKeyboard(controls) });
                }

                // طلب الأوامر اليدوية
                if (callbackData.startsWith('edit_prof_')) {
                    const [_, __, targetId, email] = callbackData.split('_');
                    await bot.telegram.sendMessage(fromId, `لتعديل بروفايل <code>${email}</code>، ارسل:\n\n<code>/setprofile ${targetId} ${email} اسم_جديد</code>`, { parse_mode: 'HTML' });
                }

                if (callbackData.startsWith('ask_date_')) {
                    const [_, __, targetId, email] = callbackData.split('_');
                    await bot.telegram.sendMessage(fromId, `لتعديل تاريخ <code>${email}</code>، ارسل:\n\n<code>/setdate ${targetId} ${email} 2026-12-31</code>`, { parse_mode: 'HTML' });
                }
            }
            return;
        }

        // 3. معالجة الرسائل والأوامر اليدوية
        if (req.body && req.body.message) {
            const chatId = req.body.message.from.id;
            const text = req.body.message.text || "";

            if (chatId === ADMIN_ID) {
                // تنفيذ تعديل البروفايل
                if (text.startsWith('/setprofile')) {
                    const [_, targetId, email, ...nameParts] = text.split(' ');
                    const newName = nameParts.join(' ');
                    const user = data.users.find(u => u.id === parseInt(targetId));
                    if (user && user.clients[email]) {
                        user.clients[email] = newName;
                        await writeData(data);
                        await bot.telegram.sendMessage(ADMIN_ID, `✅ تم تحديث البروفايل بنجاح.`);
                    }
                }

                // تنفيذ تعديل التاريخ يدوياً
                if (text.startsWith('/setdate')) {
                    const [_, targetId, email, date] = text.split(' ');
                    const user = data.users.find(u => u.id === parseInt(targetId));
                    if (user && user.expiries[email]) {
                        user.expiries[email] = date;
                        await writeData(data);
                        await bot.telegram.sendMessage(ADMIN_ID, `✅ تم تحديث التاريخ إلى: ${date}`);
                    }
                }
            }

            // القائمة الرئيسية
            if (text === '/start') {
                const menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['⚙️ إدارة المشتركين']];
                await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(menu).resize());
            } 
            else if (text === '⚙️ إدارة المشتركين' && chatId === ADMIN_ID) {
                const allUsers = data.users.filter(u => u.id !== ADMIN_ID);
                const buttons = allUsers.map(u => [Markup.button.callback(`${u.name} (ID: ${u.id})`, `view_user_${u.id}`)]);
                await bot.telegram.sendMessage(chatId, "⚙️ اختر زبوناً للإدارة:", Markup.inlineKeyboard(buttons));
            }

            await bot.handleUpdate(req.body);
        }
    } catch (error) {
        console.error("Error occurred:", error.message);
    }
};
