const { Telegraf, Markup } = require('telegraf');
// استيراد الدوال من قاعدة البيانات المحلية - تأكد من وجود المجلد lib والملف database.js
const { readData, writeData } = require('../lib/database');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// معرف الأدمن الخاص بك بناءً على تحديثات مايو 2026
const ADMIN_ID = 6197540099; 

module.exports = async (req, res) => {
    try {
        // التحقق من صحة الطلب الوارد من تيليجرام لتجنب أخطاء السيرفر
        if (!req.body || !req.body.message) {
            return res.status(200).send('OK');
        }

        const data = await readData();
        const chatId = req.body.message.from.id;
        const text = req.body.message.text || "";

        // تسجيل المستخدم تلقائياً عند أول تفاعل لضمان وجوده في النظام
        let user = data.users.find(u => u.id === chatId);
        if (!user) {
            user = { 
                id: chatId, 
                name: req.body.message.from.first_name || "User", 
                role: 'user', 
                emails: [], 
                clients: {} 
            };
            data.users.push(user);
            await writeData(data);
        }

        const isReseller = user.role === 'reseller' || chatId === ADMIN_ID;

        // 1. أمر الاختبار للتأكد من نجاح عملية الرفع (Deployment)
        if (text === '/test') {
            return await bot.telegram.sendMessage(chatId, "✅ النسخة المحدثة تعمل الآن بنجاح على Vercel.");
        }

        // 2. أمر ترقية مورد (Reseller) - مخصص للأدمن فقط
        if (text.startsWith('/make_reseller')) {
            if (chatId !== ADMIN_ID) {
                return await bot.telegram.sendMessage(chatId, "❌ هذا الأمر مخصص للأدمن فقط.");
            }

            const parts = text.split(' ');
            const targetId = parseInt(parts[1]);

            if (!targetId) {
                return await bot.telegram.sendMessage(chatId, "⚠️ يرجى إدخال الـ ID. مثال: <code>/make_reseller 8267729310</code>", { parse_mode: 'HTML' });
            }

            const userIndex = data.users.findIndex(u => u.id === targetId);
            if (userIndex !== -1) {
                data.users[userIndex].role = 'reseller';
                await writeData(data);
                await bot.telegram.sendMessage(chatId, `✅ تم ترقية المستخدم <code>${targetId}</code> إلى رتبة مورد.`, { parse_mode: 'HTML' });
                try {
                    await bot.telegram.sendMessage(targetId, "🎊 مبروك! تم منحك صلاحيات مورد في Monsieur NFLIX. أرسل /start لتحديث القائمة.");
                } catch (err) {
                    console.log("User has not started the bot or blocked it.");
                }
            } else {
                await bot.telegram.sendMessage(chatId, `❌ المستخدم (${targetId}) غير مسجل. يجب عليه إرسال /start أولاً.`);
            }
            return;
        }

        // 3. إعداد القائمة الرئيسية بناءً على الصلاحيات (Dark Mode Style)
        if (text === '/start' || text === '/support') {
            let buttons = [
                ['🏠 طلب كود نيتفليكس', '📋 حالتي'],
                ['🔄 تجديد الاشتراك', '📞 الدعم'],
                ['🔍 البحث عن زبون']
            ];

            if (isReseller) {
                buttons.push(['📖 دليل الاستخدام', '⚙️ إدارة المشتركين']);
            }

            return await bot.telegram.sendMessage(chatId, "مرحباً بك في نظام Monsieur NFLIX الآلي:", 
                Markup.keyboard(buttons).resize()
            );
        }

        await bot.handleUpdate(req.body);
    } catch (e) {
        console.error("Critical Error:", e.message);
    }
    res.status(200).send('OK');
};
