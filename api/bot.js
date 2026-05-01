const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// معرف الأدمن الخاص بك
const ADMIN_ID = 6197540099; 

module.exports = async (req, res) => {
    try {
        const data = await readData();
        
        // التحقق من وجود رسالة
        if (!req.body || !req.body.message || !req.body.message.text) {
            return res.status(200).send('OK');
        }

        const chatId = req.body.message.from.id;
        const text = req.body.message.text;

        // تسجيل المستخدم أو تحديث بياناته
        let user = data.users.find(u => u.id === chatId);
        if (!user) {
            user = { 
                id: chatId, 
                name: req.body.message.from.first_name, 
                role: 'user', 
                emails: [], 
                clients: {} 
            };
            data.users.push(user);
            await writeData(data);
        }

        const isReseller = user.role === 'reseller' || chatId === ADMIN_ID;

        // 1. أمر الاختبار (سيؤكد نجاح الرفع)
        if (text === '/test') {
            return await bot.telegram.sendMessage(chatId, "✅ النظام يعمل بالنسخة المحدثة (01-05-2026).");
        }

        // 2. أمر ترقية مورد
        if (text.startsWith('/make_reseller')) {
            if (chatId !== ADMIN_ID) {
                return await bot.telegram.sendMessage(chatId, "❌ هذا الأمر مخصص للأدمن فقط.");
            }

            const targetId = parseInt(text.split(' ')[1]);
            if (!targetId) {
                return await bot.telegram.sendMessage(chatId, "⚠️ يرجى كتابة الـ ID بعد الأمر.");
            }

            const userIndex = data.users.findIndex(u => u.id === targetId);
            if (userIndex !== -1) {
                data.users[userIndex].role = 'reseller';
                await writeData(data);
                await bot.telegram.sendMessage(chatId, `✅ تم تعيين المورد ${targetId} بنجاح.`);
                try {
                    await bot.telegram.sendMessage(targetId, "🎊 مبروك! تم منحك صلاحيات مورد في Monsieur NFLIX.");
                } catch (e) {
                    console.log("Could not notify user");
                }
            } else {
                await bot.telegram.sendMessage(chatId, "❌ المستخدم غير موجود في قاعدة البيانات. يجب عليه إرسال /start أولاً.");
            }
            return;
        }

        // 3. أمر التشغيل والقائمة
        if (text === '/start') {
            let buttons = [
                ['🏠 طلب كود نيتفليكس', '📋 حالتي'],
                ['🔄 تجديد الاشتراك', '📞 الدعم'],
                ['🔍 البحث عن زبون']
            ];

            if (isReseller) {
                buttons.push(['📖 دليل الاستخدام', '⚙️ إدارة المشتركين']);
            }

            return await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", 
                Markup.keyboard(buttons).resize()
            );
        }

        await bot.handleUpdate(req.body);
    } catch (e) {
        console.error("Bot Error:", e);
    }
    res.status(200).send('OK');
};
