const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// معرف الأدمن (Chat ID الخاص بك) - تأكد من تحديثه
const ADMIN_ID = 123456789; 

// نصوص دليل الاستخدام بتنسيق احترافي
const GUIDES = {
    admin: `⚙️ <b>قائمة أوامر الإدارة (Monsieur NFLIX):</b>\n\n` +
           `<code>/make_reseller &lt;ID&gt;</code>\n` +
           `تعيين مستخدم كمورد (Reseller) لتمكينه من إضافة زبائن.\n\n` +
           `<code>/add_client &lt;email&gt; &lt;name&gt;</code>\n` +
           `إضافة حساب جديد لزبائنك الشخصيين.\n\n` +
           `ℹ️ <b>Information:</b>\n` +
           `/info - عرض حالة حسابك (Admin).\n` +
           `/support - عرض رسالة المساعدة هذه.`,
    
    reseller: `📖 <b>دليل استخدام المورد:</b>\n\n` +
              `<code>/add_client &lt;email&gt; &lt;name&gt;</code>\n` +
              `ربط إيميل جديد باسم زبون لتوجيه الأكواد إليه آلياً.\n\n` +
              `ℹ️ <b>تنبيه:</b>\n` +
              `ستصلك تنبيهات الأكواد وروابط Household بأسماء زبائنك مباشرة هنا.`
};

module.exports = async (req, res) => {
    try {
        const data = await readData();

        if (req.body && req.body.message && req.body.message.text) {
            const chatId = req.body.message.from.id;
            const text = req.body.message.text;

            // تسجيل المستخدم تلقائياً لضمان التعرف عليه
            let user = data.users.find(u => u.id === chatId);
            if (!user) {
                user = { id: chatId, name: req.body.message.from.first_name, role: 'user', emails: [], clients: {} };
                data.users.push(user);
                await writeData(data);
            }
            
            const isReseller = user.role === 'reseller' || chatId === ADMIN_ID;

            // أمر البداية مع تحديث القائمة السفلية
            if (text === '/start' || text === '/support') {
                let buttons = [
                    ['🏠 طلب كود نيتفليكس', '📋 حالتي'],
                    ['🔄 تجديد الاشتراك', '📞 الدعم'],
                    ['🔍 البحث عن زبون']
                ];

                if (isReseller) {
                    buttons.push(['📖 دليل الاستخدام', '⚙️ إدارة المشتركين']);
                }

                await bot.telegram.sendMessage(chatId, "مرحباً بك في نظام Monsieur NFLIX الآلي:", 
                    Markup.keyboard(buttons).resize()
                );
            }

            // عرض الدليل الاحترافي عند الضغط على الزر
            if (text === '📖 دليل الاستخدام' && isReseller) {
                const guideText = (chatId === ADMIN_ID) ? GUIDES.admin : GUIDES.reseller;
                await bot.telegram.sendMessage(chatId, guideText, { parse_mode: 'HTML' });
            }

            // [الأدمن] تعيين مورد جديد
            if (chatId === ADMIN_ID && text.startsWith('/make_reseller')) {
                const targetId = parseInt(text.split(' ')[1]);
                const userIndex = data.users.findIndex(u => u.id === targetId);
                
                if (userIndex !== -1) {
                    data.users[userIndex].role = 'reseller';
                    await writeData(data);
                    await bot.telegram.sendMessage(chatId, `✅ تم تفعيل رتبة "مورد" للمستخدم: ${targetId}`);
                    await bot.telegram.sendMessage(targetId, "🎊 مبروك! تم منحك صلاحيات مورد. ارسل /start لمشاهدة الخيارات الجديدة.");
                } else {
                    await bot.telegram.sendMessage(chatId, "❌ المستخدم لم يسجل في البوت بعد. اطلب منه الضغط على Start.");
                }
            }

            // [المورد/الأدمن] إضافة زبون جديد
            if (isReseller && text.startsWith('/add_client')) {
                const parts = text.split(' ');
                if (parts.length >= 3) {
                    const email = parts[1].toLowerCase().trim();
                    const clientName = parts.slice(2).join(' ');
                    
                    if (!user.emails) user.emails = [];
                    if (!user.clients) user.clients = {};

                    if (!user.emails.includes(email)) user.emails.push(email);
                    user.clients[email] = clientName;

                    await writeData(data);
                    await bot.telegram.sendMessage(chatId, `✅ تم ربط الحساب <code>${email}</code> بزبونك <b>${clientName}</b>`, { parse_mode: 'HTML' });
                } else {
                    await bot.telegram.sendMessage(chatId, "⚠️ الصيغة الخاطئة. استخدم: <code>/add_client email name</code>", { parse_mode: 'HTML' });
                }
            }
        }

        // --- معالجة توجيه الأكواد التلقائية ---
        if (req.body && req.body.to && req.body.content) {
            const emailTo = req.body.to.toLowerCase().trim();
            const content = req.body.content;
            const targetUsers = data.users.filter(u => 
                (u.emails && u.emails.includes(emailTo)) || (u.email && u.email === emailTo)
            );

            const codeMatch = content.match(/\b\d{4}\b/g);
            const validCode = codeMatch ? codeMatch[codeMatch.length - 1] : null;

            for (const u of targetUsers) {
                const displayName = (u.clients && u.clients[emailTo]) ? u.clients[emailTo] : "حسابك الشخصي";
                if (validCode) {
                    await bot.telegram.sendMessage(u.id, `👤 <b>المشترك: ${displayName}</b>\n🔢 الكود: <code>${validCode}</code>`, { parse_mode: 'HTML' });
                }
            }
            return res.status(200).send('OK');
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Bot Error:", e); }
    res.status(200).send('OK');
};
