const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// معرف الأدمن الخاص بك
const ADMIN_ID = 6197540099; 

module.exports = async (req, res) => {
    try {
        if (!req.body || !req.body.message) return res.status(200).send('OK');

        const data = await readData();
        const chatId = req.body.message.from.id;
        const text = req.body.message.text || "";

        // تسجيل المستخدم تلقائياً لضمان وجوده في النظام
        let user = data.users.find(u => u.id === chatId);
        if (!user) {
            user = { id: chatId, name: req.body.message.from.first_name, role: 'user', emails: [], clients: {} };
            data.users.push(user);
            await writeData(data);
        }

        const isReseller = user.role === 'reseller' || chatId === ADMIN_ID;

        // --- 1. معالجة نصوص الأزرار (Buttons Listeners) ---

        if (text === '🏠 طلب كود نيتفليكس') {
            await bot.telegram.sendMessage(chatId, "📩 من فضلك أرسل إيميل الحساب المطلوب كوده.");
            return res.status(200).send('OK');
        }

        if (text === '📋 حالتي') {
            const roleName = isReseller ? "مورد معتمد" : "زبون";
            await bot.telegram.sendMessage(chatId, `👤 الاسم: ${user.name}\n🎖️ الرتبة: ${roleName}`);
            return res.status(200).send('OK');
        }

        if (text === '⚙️ إدارة المشتركين') {
            if (!isReseller) return res.status(200).send('OK');
            await bot.telegram.sendMessage(chatId, "🛠️ لوحة الإدارة: يمكنك هنا البحث عن العملاء ومتابعة التجديدات.");
            return res.status(200).send('OK');
        }

        if (text === '📞 الدعم') {
            await bot.telegram.sendMessage(chatId, "👨‍💻 للتواصل مع الدعم الفني لمشروع Monsieur NFLIX: @AdminUsername");
            return res.status(200).send('OK');
        }

        // --- 2. معالجة الأوامر البرمجية (Commands) ---

        // أمر الاختبار للتحقق من النسخة الحالية
        if (text === '/test') {
            await bot.telegram.sendMessage(chatId, "✅ نظام Monsieur NFLIX يعمل الآن بالنسخة المستقرة والمحدثة.");
            return res.status(200).send('OK');
        }

        // أمر ترقية مورد (خاص بالأدمن فقط)
        if (text.startsWith('/make_reseller') && chatId === ADMIN_ID) {
            const targetId = parseInt(text.split(' ')[1]);
            const userIndex = data.users.findIndex(u => u.id === targetId);
            
            if (userIndex !== -1) {
                data.users[userIndex].role = 'reseller';
                await writeData(data);
                await bot.telegram.sendMessage(chatId, `✅ تم ترقية المعرف ${targetId} إلى رتبة مورد بنجاح.`);
                try { await bot.telegram.sendMessage(targetId, "🎊 مبروك! تم منحك صلاحيات مورد في النظام."); } catch(e){}
            } else {
                await bot.telegram.sendMessage(chatId, "❌ هذا المستخدم لم يقم بتشغيل البوت بعد.");
            }
            return res.status(200).send('OK');
        }

        // عرض القائمة الرئيسية
        if (text === '/start') {
            let buttons = [
                ['🏠 طلب كود نيتفليكس', '📋 حالتي'],
                ['🔄 تجديد الاشتراك', '📞 الدعم']
            ];
            
            if (isReseller) {
                buttons.push(['📖 دليل الاستخدام', '⚙️ إدارة المشتركين']);
            }

            await bot.telegram.sendMessage(chatId, "مرحباً بك في لوحة تحكم Monsieur NFLIX:", 
                Markup.keyboard(buttons).resize()
            );
            return res.status(200).send('OK');
        }

        await bot.handleUpdate(req.body);
    } catch (e) {
        console.error("Execution Error:", e.message);
    }
    // ضمان إغلاق الطلب لتيليجرام لتجنب تكرار الرسائل
    if (!res.writableEnded) res.status(200).send('OK');
};
