const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ADMIN_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',') : [process.env.ADMIN_USER_ID];

// --- الوظيفة الاحترافية لاستقبال ومعالجة إيميلات Instaddr ---
module.exports = async (req, res) => {
    // استقبال البيانات من Webhook (تطبيق الإيميلات)
    if (req.body && req.body.to && req.body.content) {
        const emailContent = req.body.content;
        const recipientEmail = req.body.to;

        // البحث عن أي سلسلة أرقام (من 4 إلى 8 أرقام) داخل الإيميل
        const codeMatch = emailContent.match(/\b\d{4,8}\b/);
        
        if (codeMatch) {
            const extractedCode = codeMatch[0];
            const data = await readData();
            
            // البحث عن كل الزبائن المرتبطين بهذا الإيميل في قاعدة بياناتك
            const targetUsers = data.users.filter(u => u.email === recipientEmail);
            
            for (const user of targetUsers) {
                await bot.telegram.sendMessage(user.id, 
                    `📩 <b>وصلك كود جديد تلقائياً!</b>\n\n` +
                    `👤 البروفايل: ${user.profileName || 'غير محدد'}\n` +
                    `🔢 الكود هو: <code>${extractedCode}</code>\n\n` +
                    `⚙️ مصدر الكود: إيميل الحساب المسجل (${recipientEmail})`, 
                    { parse_mode: 'HTML' }
                );
            }
        }
        return res.status(200).send('Processed');
    }

    // استقبال أوامر التليجرام
    if (req.body && req.body.update_id) {
        await bot.handleUpdate(req.body);
        return res.status(200).send('OK');
    }

    res.status(200).send('Service Active');
};

// --- تحديث رسالة زر طلب الكود للزبون ---
bot.hears('🏠 طلب كود نيتفليكس', (ctx) => {
    ctx.replyWithHTML('✅ <b>نظام الأكواد التلقائي نشط.</b>\n\nقم بطلب الكود الآن من تطبيق Netflix (إرسال إلى الإيميل)، وسيظهر لك هنا فور وصوله دون الحاجة لمراسلة الدعم.');
});
