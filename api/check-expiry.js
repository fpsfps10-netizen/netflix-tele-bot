const { Telegraf } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

module.exports = async (req, res) => {
    try {
        const data = await readData();
        const users = data.users || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let updateCount = 0;

        for (let user of users) {
            if (!user.expiryDate) continue;

            const expiry = new Date(user.expiryDate);
            expiry.setHours(0, 0, 0, 0);

            const diffTime = expiry.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // التنبيه قبل يوم واحد (يوم 1)
            if (diffDays === 1 && !user.notifiedBefore) {
                await bot.telegram.sendMessage(user.id, 
                    `⏰ <b>تذكير بانتهاء الاشتراك:</b>\n\nعزيزي ${user.name || 'المشترك'}، باقي <b>يوم واحد</b> فقط على انتهاء اشتراكك في نيتفليكس.\n\nيرجى التواصل مع الدعم لتجديد الاشتراك لضمان عدم توقف الخدمة.`, 
                    { parse_mode: 'HTML' }
                );
                user.notifiedBefore = true;
                updateCount++;
            } 
            
            // التنبيه في يوم الانتهاء (يوم 0)
            else if (diffDays === 0 && !user.notifiedOnEnd) {
                await bot.telegram.sendMessage(user.id, 
                    `⚠️ <b>تنبيه انتهاء الاشتراك اليوم:</b>\n\nعزيزي ${user.name || 'المشترك'}، اليوم هو اليوم الأخير في اشتراكك.\n\nسيتم توقف نظام الأكواد التلقائي غداً في حال عدم التجديد.`, 
                    { parse_mode: 'HTML' }
                );
                user.notifiedOnEnd = true;
                updateCount++;
            }

            // إعادة ضبط الإشعارات إذا قام الأدمن بتمديد التاريخ ليوم مستقبلي
            if (diffDays > 1 && (user.notifiedBefore || user.notifiedOnEnd)) {
                user.notifiedBefore = false;
                user.notifiedOnEnd = false;
                updateCount++;
            }
        }

        if (updateCount > 0) {
            await writeData(data);
        }

        res.status(200).json({ success: true, notificationsSent: updateCount });
    } catch (error) {
        console.error('Check-Expiry Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
