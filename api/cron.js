const { Telegraf } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

module.exports = async (req, res) => {
    // تأمين الرابط (اختياري: يمكنك إضافة رمز سري في الإعدادات)
    try {
        const data = await readData();
        const users = data.users || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let user of users) {
            if (!user.expiryDate) continue;

            const expiry = new Date(user.expiryDate);
            expiry.setHours(0, 0, 0, 0);

            const diffTime = expiry.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // 1. التنبيه قبل يوم واحد
            if (diffDays === 1 && !user.notifiedBefore) {
                await bot.telegram.sendMessage(user.id, `⏰ <b>تذكير اشتراك:</b>\nباقي يوم واحد فقط على انتهاء اشتراكك. يرجى التجديد الآن لتجنب انقطاع الخدمة.`, { parse_mode: 'HTML' });
                user.notifiedBefore = true; // علامة لمنع تكرار الرسالة
            } 
            
            // 2. التنبيه يوم الانتهاء
            else if (diffDays === 0 && !user.notifiedOnEnd) {
                await bot.telegram.sendMessage(user.id, `⚠️ <b>تنبيه هام:</b>\nاشتراكك ينتهي اليوم! يرجى التواصل مع الدعم للتجديد لضمان استمرار عمل الأكواد.`, { parse_mode: 'HTML' });
                user.notifiedOnEnd = true;
            }
            
            // 3. التنبيه بعد انتهاء الاشتراك (اختياري)
            else if (diffDays === -1 && !user.notifiedAfter) {
                await bot.telegram.sendMessage(user.id, `🚫 <b>انتهى الاشتراك:</b>\nلقد انتهى اشتراكك بالأمس وتوقف نظام الأكواد التلقائي. نأمل رؤيتك معنا مجدداً!`, { parse_mode: 'HTML' });
                user.notifiedAfter = true;
            }

            // إعادة ضبط العلامات إذا قام الأدمن بتجديد الاشتراك (تاريخ جديد مستقبلي)
            if (diffDays > 1) {
                user.notifiedBefore = false;
                user.notifiedOnEnd = false;
                user.notifiedAfter = false;
            }
        }

        await writeData(data);
        return res.status(200).send('Notifications sent successfully.');
    } catch (error) {
        console.error('Cron Error:', error);
        return res.status(500).send('Internal Server Error');
    }
};
