const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// معرف الأدمن الخاص بك
const ADMIN_ID = 6197540099; 

module.exports = async (req, res) => {
    try {
        const data = await readData();
        if (!req.body || !req.body.message) return res.status(200).send('OK');

        const chatId = req.body.message.from.id;
        const text = req.body.message.text || "";

        // تسجيل المستخدم تلقائياً عند التفاعل لضمان وجوده في النظام
        let user = data.users.find(u => u.id === chatId);
        if (!user) {
            user = { id: chatId, name: req.body.message.from.first_name, role: 'user', emails: [], clients: {} };
            data.users.push(user);
            await writeData(data);
        }

        const isReseller = user.role === 'reseller' || chatId === ADMIN_ID;

        // أمر الاختبار للتأكد من وصول التحديث الجديد
        if (text === '/test') {
            return await bot.telegram.sendMessage(chatId, `✅ نظام Monsieur NFLIX متصل.\nرتبتك الحالية: ${chatId === ADMIN_ID ? "Admin" : user.role}`);
        }

        // معالجة أمر الترقية التقليدي (بدون ترقية قسرية)
        if (text.startsWith('/make_reseller')) {
            if (chatId !== ADMIN_ID) return; 

            const targetId = parseInt(text.split(' ')[1]);
            if (!targetId) return await bot.telegram.sendMessage(chatId, "⚠️ يرجى إدخال المعرف. مثال: <code>/make_reseller 12345</code>", { parse_mode: 'HTML' });

            const userIndex = data.users.findIndex(u => u.id === targetId);
            
            if (userIndex !== -1) {
                data.users[userIndex].role = 'reseller';
                await writeData(data);
                await bot.telegram.sendMessage(chatId, `✅ تم تعيين المستخدم <code>${targetId}</code> كمورد بنجاح.`, { parse_mode: 'HTML' });
                try { await bot.telegram.sendMessage(targetId, "🎊 تم منحك صلاحيات مورد في Monsieur NFLIX. أرسل /start لتفعيل الأزرار."); } catch(e){}
            } else {
                // الرسالة تظهر الآن إذا لم يكن المستخدم مسجلاً
                await bot.telegram.sendMessage(chatId, `❌ لم يتم العثور على المستخدم (${targetId}). يجب عليه إرسال /start أولاً ليتمكن النظام من التعرف عليه.`);
            }
            return;
        }

        // أزرار الواجهة الرئيسية بناءً على الرتبة
        if (text === '/start') {
            let buttons = [
                ['🏠 طلب كود نيتفليكس', '📋 حالتي'],
                ['🔄 تجديد الاشتراك', '📞 الدعم'],
                ['🔍 البحث عن زبون']
            ];
            if (isReseller) buttons.push(['📖 دليل الاستخدام', '⚙️ إدارة المشتركين']);
            
            return await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(buttons).resize());
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Bot Error:", e); }
    res.status(200).send('OK');
};
