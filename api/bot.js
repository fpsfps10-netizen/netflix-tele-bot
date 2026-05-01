const { Telegraf, Markup } = require('telegraf');
const { readData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

module.exports = async (req, res) => {
    try {
        // --- 1. معالجة الإيميلات الواردة من نظام المايلر ---
        if (req.body && req.body.to && req.body.content) {
            const content = req.body.content;
            const emailTo = req.body.to;
            const data = await readData();
            
            // البحث عن المورد أو الزبون الذي يملك الإيميل (سواء كان إيميل واحد أو قائمة إيميلات)
            const targetUsers = data.users.filter(u => {
                // التحقق إذا كان المستخدم موردًا ولديه مصفوفة إيميلات
                if (Array.isArray(u.emails)) {
                    return u.emails.includes(emailTo);
                }
                // التحقق إذا كان زبونًا عاديًا بإيميل واحد
                return u.email === emailTo;
            });

            // أ- استخراج الكود المكون من 4 أرقام فقط (لتجنب الأرقام الخاطئة المكونة من 5 خانات)
            const codeMatch = content.match(/\b\d{4}\b/g);
            const validCode = codeMatch ? codeMatch[codeMatch.length - 1] : null;

            // ب- استخراج رابط "Get Code" المباشر من محتوى الإيميل
            const linkMatch = content.match(/https:\/\/www\.netflix\.com\/[^\s"']+/);
            const getCodeLink = linkMatch ? linkMatch[0] : null;

            // ج- الكلمات المفتاحية لتحديد إيميلات الـ Household والوصول المؤقت (بثلاث لغات)
            const isHouseholdAlert = /Your temporary access|Household|Get Code|foyer|منزل نيتفليكس|رمز الوصول المؤقت/i.test(content);

            for (const user of targetUsers) {
                // رسالة توضح للمورد أي حساب استقبل الكود حالياً لتسهيل الإدارة
                const headerMsg = `📧 <b>تنبيه لحساب:</b> <code>${emailTo}</code>\n\n`;

                // الحالة الأولى: وجود رابط استخراج الكود (مشكلة المنزل / الوصول المؤقت)
                if (getCodeLink && isHouseholdAlert) {
                    await bot.telegram.sendMessage(user.id, 
                        `${headerMsg}🏠 <b>تنبيه منزل نيتفليكس:</b>\n\nنظام نيتفليكس يطلب تأكيد الموقع عبر "رمز الوصول المؤقت".\n\nاضغط على الزر أدناه لفتح الرابط في متصفحك واستخراج الكود الجديد مباشرة:`, 
                        { 
                            parse_mode: 'HTML',
                            ...Markup.inlineKeyboard([
                                [Markup.button.url('🚀 استخراج الكود (Get Code)', getCodeLink)]
                            ])
                        }
                    );
                } 
                
                // الحالة الثانية: وصول الكود الرقمي الصريح المكون من 4 أرقام
                if (validCode) {
                    await bot.telegram.sendMessage(user.id, 
                        `${headerMsg}📩 <b>وصلك كود جديد!</b>\n\n🔢 الكود: <code>${validCode}</code>\n\n(اضغط على الكود لنسخه مباشرة)`, 
                        { parse_mode: 'HTML' }
                    );
                }
            }
            return res.status(200).send('OK');
        }

        // --- 2. معالجة أوامر البوت العادية من قبل المستخدمين ---
        if (req.body && req.body.update_id) {
            await bot.handleUpdate(req.body);
        }
    } catch (error) {
        console.error('Webhook Error:', error);
    }
    res.status(200).send('OK');
};
