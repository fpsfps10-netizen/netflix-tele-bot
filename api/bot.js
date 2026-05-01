const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- الإعدادات الأساسية ---
const ADMIN_ID = 123456789; // استبدله بـ ID الخاص بك الظاهر في الصورة

const GUIDES = {
    admin: `🛠 <b>دليل تحكم الأدمن:</b>\n\n` +
           `1️⃣ لتعيين مورد جديد ارسل:\n<code>/make_reseller [ID]</code>\n\n` +
           `2️⃣ لإضافة زبون لنفسك ارسل:\n<code>/add_client [email] [name]</code>\n\n` +
           `3️⃣ لاستقبال الأكواد: تأكد من ربط المايلر بالإيميلات الصحيحة.`,
    
    reseller: `📖 <b>دليل استخدام المورد (Monsieur NFLIX):</b>\n\n` +
              `✅ <b>إضافة زبون:</b> ارسل الإيميل واسم الزبون كالتالي:\n` +
              `<code>/add_client email@example.com اسم الزبون</code>\n\n` +
              `✅ <b>تلقي الأكواد:</b> ستصلك الأكواد وروابط "المنزل" تلقائياً هنا مع اسم الزبون.\n\n` +
              `✅ <b>ملاحظة:</b> الكود المكون من 4 أرقام هو كود الدخول الصحيح.`
};

module.exports = async (req, res) => {
    try {
        const data = await readData();

        // --- 1. معالجة الرسائل والأوامر ---
        if (req.body && req.body.message && req.body.message.text) {
            const chatId = req.body.message.from.id;
            const text = req.body.message.text;
            const user = data.users.find(u => u.id === chatId);
            
            // التحقق من الرتبة (أدمن أو مورد)
            const isReseller = user && (user.role === 'reseller' || chatId === ADMIN_ID);

            // أمر البداية وتحديث الأزرار السفلية (Reply Keyboard)
            if (text === '/start') {
                let buttons = [
                    ['🏠 طلب كود نيتفليكس', '📋 حالتي'],
                    ['🔄 تجديد الاشتراك', '📞 الدعم'],
                    ['🔍 البحث عن زبون']
                ];

                // إضافة أزرار المورد/الأدمن فقط إذا كان يملك الصلاحية
                if (isReseller) {
                    buttons.push(['📖 دليل الاستخدام', '⚙️ إدارة المشتركين']);
                }

                await bot.telegram.sendMessage(chatId, "مرحباً بك في Mrnflix (Monsieur NFLIX):", 
                    Markup.keyboard(buttons).resize()
                );
            }

            // عرض دليل الاستخدام عند الضغط على الزر
            if (text === '📖 دليل الاستخدام' && isReseller) {
                const guideText = (chatId === ADMIN_ID) ? GUIDES.admin : GUIDES.reseller;
                await bot.telegram.sendMessage(chatId, guideText, { parse_mode: 'HTML' });
            }

            // [الأدمن فقط] تعيين مورد جديد عبر البوت
            if (chatId === ADMIN_ID && text.startsWith('/make_reseller')) {
                const targetId = parseInt(text.split(' ')[1]);
                const userIndex = data.users.findIndex(u => u.id === targetId);
                
                if (userIndex !== -1) {
                    data.users[userIndex].role = 'reseller';
                    await writeData(data);
                    await bot.telegram.sendMessage(chatId, `✅ تم تفعيل رتبة "مورد" للمستخدم: ${targetId}`);
                    await bot.telegram.sendMessage(targetId, "🎊 مبروك! تم تعيينك كمورد في Monsieur NFLIX. استخدم أمر /start لمشاهدة الخيارات الجديدة.");
                } else {
                    await bot.telegram.sendMessage(chatId, "❌ المستخدم غير موجود. يجب أن يراسل البوت أولاً.");
                }
            }

            // [المورد/الأدمن] إضافة زبون وإيميل جديد
            if (isReseller && text.startsWith('/add_client')) {
                const parts = text.split(' ');
                if (parts.length < 3) {
                    await bot.telegram.sendMessage(chatId, "⚠️ الصيغة: `/add_client [email] [name]`");
                } else {
                    const email = parts[1].toLowerCase().trim();
                    const clientName = parts.slice(2).join(' ');

                    const currentUser = data.users.find(u => u.id === chatId);
                    if (!currentUser.emails) currentUser.emails = [];
                    if (!currentUser.clients) currentUser.clients = {};

                    if (!currentUser.emails.includes(email)) currentUser.emails.push(email);
                    currentUser.clients[email] = clientName;

                    await writeData(data);
                    await bot.telegram.sendMessage(chatId, `✅ تم ربط الحساب <code>${email}</code> بزبونك <b>${clientName}</b> بنجاح.`, { parse_mode: 'HTML' });
                }
            }
        }

        // --- 2. معالجة الإيميلات الواردة وتوجيه الأكواد ---
        if (req.body && req.body.to && req.body.content) {
            const emailTo = req.body.to.toLowerCase().trim();
            const content = req.body.content;

            // البحث عن الموردين أو الزبائن المرتبطين بهذا الإيميل
            const targetUsers = data.users.filter(u => 
                (u.emails && u.emails.includes(emailTo)) || (u.email && u.email.toLowerCase() === emailTo)
            );

            // استخراج كود الـ 4 أرقام والروابط
            const codeMatch = content.match(/\b\d{4}\b/g);
            const validCode = codeMatch ? codeMatch[codeMatch.length - 1] : null;
            const linkMatch = content.match(/https:\/\/www\.netflix\.com\/[^\s"']+/);
            const getCodeLink = linkMatch ? linkMatch[0] : null;
            const isHouseholdAlert = /Your temporary access|Household|foyer|منزل نيتفليكس|رمز الوصول المؤقت/i.test(content);

            for (const u of targetUsers) {
                const displayName = (u.clients && u.clients[emailTo]) ? u.clients[emailTo] : "حسابك الشخصي";
                const header = `👤 <b>المشترك: ${displayName}</b>\n📧 الحساب: <code>${emailTo}</code>\n\n`;

                if (getCodeLink && isHouseholdAlert) {
                    await bot.telegram.sendMessage(u.id, `${header}🏠 <b>تنبيه منزل نيتفليكس:</b>`, {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([[Markup.button.url('🚀 استخراج الكود', getCodeLink)]])
                    });
                }
                if (validCode) {
                    await bot.telegram.sendMessage(u.id, `${header}📩 الكود الجديد: <code>${validCode}</code>`, { parse_mode: 'HTML' });
                }
            }
            return res.status(200).send('OK');
        }

        await bot.handleUpdate(req.body);
    } catch (e) {
        console.error("Bot Error:", e);
    }
    res.status(200).send('OK');
};
