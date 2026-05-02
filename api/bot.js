const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');

// التوكن الخاص بك المأخوذ من BotFather
const bot = new Telegraf('8459897834:AAH-gSqYBIExQJXkDc8OYltOpH7vq2WubNc');

// معرف مدير النظام (Monsieur NFLIX)
const ADMIN_ID = 6197540099;

// --- الدوال المساعدة ---

// حساب تاريخ انتهاء جديد بناءً على عدد الأيام
function calculateExpiry(days) {
    const date = new Date();
    date.setDate(date.getDate() + parseInt(days));
    return date.toISOString().split('T')[0]; // صيغة YYYY-MM-DD
}

// التحقق من أن الاشتراك لا يزال سارياً
function isSubscriptionValid(expiryDate) {
    if (!expiryDate) return false;
    const today = new Date().toISOString().split('T')[0];
    return expiryDate >= today;
}

// دالة إرسال تنبيهات للمشتركين الذين ينتهي اشتراكهم غداً
async function checkAndNotifyExpiries(data) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    for (const user of data.users) {
        if (user.expiries) {
            for (const [email, expiryDate] of Object.entries(user.expiries)) {
                if (expiryDate === tomorrowStr) {
                    const clientName = user.clients[email] || "حسابك";
                    try {
                        await bot.telegram.sendMessage(user.id, 
                            `⚠️ <b>تنبيه بانتهاء الاشتراك</b>\n\n` +
                            `عزيزي المشترك <b>${clientName}</b>، نود إعلامك بأن اشتراكك ينتهي غداً بتاريخ <code>${expiryDate}</code>.\n\n` +
                            `يرجى التواصل معنا للتجديد لضمان استمرار الخدمة.`, 
                            { parse_mode: 'HTML' }
                        );
                    } catch (err) { console.error("Notification Error:", err.message); }
                }
            }
        }
    }
}

module.exports = async (req, res) => {
    try {
        const data = await readData();

        // 1. مسار الفحص التلقائي للتنبيهات (Cron Job)
        if (req.url.includes('/api/check-expiries')) {
            await checkAndNotifyExpiries(data);
            return res.status(200).send('Done');
        }

        // 2. معالجة البيانات القادمة من الـ Webhook (الأكواد والروابط)
        if (req.body && req.body.to && req.body.content) {
            const emailTo = req.body.to.toLowerCase().trim();
            const fullContent = req.body.content;
            
            const targetUsers = data.users.filter(u => u.emails && u.emails.includes(emailTo));

            for (const u of targetUsers) {
                const displayName = u.clients[emailTo] || "مشترك";
                const expiryDate = u.expiries ? u.expiries[emailTo] : null;

                // منع الإرسال إذا كان الاشتراك منتهياً
                if (!isSubscriptionValid(expiryDate)) {
                    await bot.telegram.sendMessage(u.id, `⚠️ اشتراك <b>${displayName}</b> انتهى (${expiryDate}). يرجى التجديد.`, { parse_mode: 'HTML' });
                    continue; 
                }

                // استخراج رابط نيتفليكس (للتلفاز) أو الكود الرقمي
                const urlMatch = fullContent.match(/https?:\/\/(?:www\.)?netflix\.com\/(?:nm|setup|verify)[^\s<>"]+/g);
                const isTvProfile = /TV/i.test(displayName);

                if (isTvProfile && urlMatch) {
                    await bot.telegram.sendMessage(u.id, `📺 <b>تأكيد التلفاز لـ: ${displayName}</b>`, 
                        Markup.inlineKeyboard([[Markup.button.url('✅ إضغط هنا لتأكيد التلفاز', urlMatch[0])]]));
                } else {
                    const codeMatch = fullContent.match(/\b\d{4}\b/g);
                    if (codeMatch) {
                        await bot.telegram.sendMessage(u.id, `👤 المشترك: <b>${displayName}</b>\n🔢 كود الدخول: <code>${codeMatch[codeMatch.length-1]}</code>`, { parse_mode: 'HTML' });
                    }
                }
            }
            return res.status(200).send('OK');
        }

        // 3. معالجة رسائل تليجرام المباشرة
        if (!req.body || !req.body.message) return res.status(200).send('OK');
        const chatId = req.body.message.from.id;
        const text = req.body.message.text || "";
        const isAdmin = chatId === ADMIN_ID;

        let user = data.users.find(u => u.id === chatId);
        if (!user) {
            user = { id: chatId, name: req.body.message.from.first_name, role: 'user', emails: [], clients: {}, expiries: {} };
            data.users.push(user);
        }

        const isReseller = user.role === 'reseller' || isAdmin;

        // القائمة الرئيسية
        if (text === '/start') {
            const menu = [['🏠 طلب كود نيتفليكس', '📋 حالتي'], ['🔍 البحث عن زبون', '⚙️ إدارة المشتركين']];
            await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(menu).resize());
            return res.status(200).send('OK');
        }

        // التجديد الذكي: /renew <email> <days>
        if (isReseller && text.startsWith('/renew')) {
            const parts = text.split(' ');
            if (parts.length === 3) {
                const email = parts[1].toLowerCase();
                const days = parts[2];
                const newDate = calculateExpiry(days);
                if (!user.expiries) user.expiries = {};
                user.expiries[email] = newDate;
                await writeData(data);
                await bot.telegram.sendMessage(chatId, `✅ تم تجديد <b>${user.clients[email] || email}</b> لـ ${days} يوم.\n📅 ينتهي: <code>${newDate}</code>`, { parse_mode: 'HTML' });
            }
            return res.status(200).send('OK');
        }

        // عرض قائمة المشتركين كأزرار تفاعلية
        if (text === '⚙️ إدارة المشتركين' && isReseller) {
            const clientNames = Object.values(user.clients || {});
            if (clientNames.length === 0) {
                await bot.telegram.sendMessage(chatId, "⚠️ لا يوجد زبائن حالياً.");
            } else {
                const buttons = clientNames.map(name => [Markup.button.callback(name, `manage_${name}`)]);
                await bot.telegram.sendMessage(chatId, "⚙️ قائمة المشتركين:", Markup.inlineKeyboard(buttons));
            }
            return res.status(200).send('OK');
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Error:", e.message); }
    if (!res.writableEnded) res.status(200).send('OK');
};
