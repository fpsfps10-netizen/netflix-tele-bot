const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');
const ADMIN_ID = 6197540099;

// --- الدوال المساعدة ---
function calculateExpiry(days) {
    const date = new Date();
    date.setDate(date.getDate() + parseInt(days));
    return date.toISOString().split('T')[0];
}

function isSubscriptionValid(expiryDate) {
    if (!expiryDate) return false;
    const today = new Date().toISOString().split('T')[0];
    return expiryDate >= today;
}

module.exports = async (req, res) => {
    try {
        const data = await readData();

        // 1. معالجة الـ Webhook (الأكواد وروابط التلفاز)
        if (req.body && req.body.to && req.body.content) {
            const emailTo = req.body.to.toLowerCase().trim();
            const fullContent = req.body.content;
            const targetUsers = data.users.filter(u => u.emails && u.emails.includes(emailTo));

            for (const u of targetUsers) {
                const displayName = u.clients[emailTo] || "مشترك";
                const expiryDate = u.expiries ? u.expiries[emailTo] : null;

                if (!isSubscriptionValid(expiryDate)) {
                    await bot.telegram.sendMessage(u.id, `⚠️ اشتراك <b>${displayName}</b> انتهى. يرجى التجديد.`, { parse_mode: 'HTML' });
                    continue; 
                }

                const urlMatch = fullContent.match(/https?:\/\/(?:www\.)?netflix\.com\/(?:nm|setup|verify)[^\s<>"]+/g);
                if (/TV/i.test(displayName) && urlMatch) {
                    await bot.telegram.sendMessage(u.id, `📺 <b>تأكيد التلفاز: ${displayName}</b>`, 
                        Markup.inlineKeyboard([[Markup.button.url('✅ تأكيد الآن', urlMatch[0])]]));
                } else {
                    const codeMatch = fullContent.match(/\b\d{4}\b/g);
                    if (codeMatch) await bot.telegram.sendMessage(u.id, `👤 المشترك: <b>${displayName}</b>\n🔢 كود: <code>${codeMatch[codeMatch.length-1]}</code>`, { parse_mode: 'HTML' });
                }
            }
            return res.status(200).send('OK');
        }

        // 2. معالجة نقرات الأزرار (لوحة التحكم)
        if (req.body && req.body.callback_query) {
            const callbackData = req.body.callback_query.data;
            const fromId = req.body.callback_query.from.id;

            if (fromId === ADMIN_ID) {
                // عرض بيانات المستخدم
                if (callbackData.startsWith('view_user_')) {
                    const targetId = parseInt(callbackData.replace('view_user_', ''));
                    const targetUser = data.users.find(u => u.id === targetId);

                    if (targetUser) {
                        let info = `👤 <b>إدارة:</b> ${targetUser.name}\n🆔 <b>ID:</b> <code>${targetId}</code>\n\n`;
                        const clientEmails = Object.keys(targetUser.clients || {});
                        
                        if (clientEmails.length > 0) {
                            clientEmails.forEach(email => {
                                const exp = targetUser.expiries[email] || "غير محدد";
                                info += `${isSubscriptionValid(exp) ? "✅" : "❌"} ${email}\n📅 ينتهي: ${exp}\n`;
                            });
                        } else { info += `⚠️ لا توجد اشتراكات نشطة.`; }

                        const controls = [
                            [Markup.button.callback('➕ تجديد (شهر)', `renew_${targetId}_30`), Markup.button.callback('➕ تجديد (3 أشهر)', `renew_${targetId}_90`)],
                            [Markup.button.callback('🗑️ حذف المستخدم نهائياً', `delete_user_${targetId}`)]
                        ];
                        await bot.telegram.sendMessage(fromId, info, { parse_mode: 'HTML', ...Markup.inlineKeyboard(controls) });
                    }
                }

                // تنفيذ التجديد السريع عبر الأزرار
                if (callbackData.startsWith('renew_')) {
                    const [_, __, targetId, days] = callbackData.split('_');
                    const targetUser = data.users.find(u => u.id === parseInt(targetId));
                    if (targetUser) {
                        const email = Object.keys(targetUser.clients)[0]; // تجديد أول حساب مربوط
                        if (email) {
                            targetUser.expiries[email] = calculateExpiry(days);
                            await writeData(data);
                            await bot.telegram.answerCbQuery(req.body.callback_query.id, "✅ تم التجديد بنجاح!");
                            await bot.telegram.sendMessage(fromId, `✅ تم تجديد اشتراك ${targetUser.name} لـ ${days} يوم.`);
                        } else {
                            await bot.telegram.answerCbQuery(req.body.callback_query.id, "❌ لا يوجد إيميل مربوط لتجديده!", { show_alert: true });
                        }
                    }
                }

                // تنفيذ حذف المستخدم
                if (callbackData.startsWith('delete_user_')) {
                    const targetId = parseInt(callbackData.replace('delete_user_', ''));
                    data.users = data.users.filter(u => u.id !== targetId);
                    await writeData(data);
                    await bot.telegram.answerCbQuery(req.body.callback_query.id, "🗑️ تم الحذف!");
                    await bot.telegram.sendMessage(fromId, `✅ تم حذف المستخدم نهائياً من النظام.`);
                }
            }
            return res.status(200).send('OK');
        }

        // 3. معالجة الرسائل العادية والقائمة الرئيسية
        if (!req.body || !req.body.message) return res.status(200).send('OK');
        const chatId = req.body.message.from.id;
        const text = req.body.message.text || "";
        const isAdmin = chatId === ADMIN_ID;

        let user = data.users.find(u => u.id === chatId);
        if (!user) {
            user = { id: chatId, name: req.body.message.from.first_name || "مستخدم", role: 'user', emails: [], clients: {}, expiries: {} };
            data.users.push(user);
            await writeData(data);
        }

        if (text === '/start') {
            const menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['⚙️ إدارة المشتركين']];
            await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(menu).resize());
            return res.status(200).send('OK');
        }

        if (text === '⚙️ إدارة المشتركين' && isAdmin) {
            const allUsers = data.users.filter(u => u.id !== ADMIN_ID); 
            if (allUsers.length === 0) {
                await bot.telegram.sendMessage(chatId, "⚠️ لا يوجد مستخدمين مسجلين.");
            } else {
                const buttons = allUsers.map(u => [Markup.button.callback(`${u.name} (ID: ${u.id})`, `view_user_${u.id}`)]);
                await bot.telegram.sendMessage(chatId, "⚙️ اختر زبوناً للتحكم في حسابه:", Markup.inlineKeyboard(buttons));
            }
            return res.status(200).send('OK');
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Error:", e.message); }
    if (!res.writableEnded) res.status(200).send('OK');
};
