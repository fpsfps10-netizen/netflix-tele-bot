const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// معرف الأدمن (Chat ID الخاص بك)
const ADMIN_ID = 123456789; 

// نص دليل الاستخدام
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

        if (req.body && req.body.message && req.body.message.text) {
            const chatId = req.body.message.from.id;
            const text = req.body.message.text;
            const user = data.users.find(u => u.id === chatId);
            const isReseller = user && (user.role === 'reseller' || chatId === ADMIN_ID);

            // --- زر دليل الاستخدام عند البدء /start ---
            if (text === '/start') {
                let welcomeMsg = "مرحباً بك في بوت Monsieur NFLIX لخدمات الاشتراكات 🚀";
                let keyboard = [];

                if (isReseller) {
                    keyboard.push([Markup.button.callback('📖 فتح دليل الاستخدام', 'show_guide')]);
                }

                await bot.telegram.sendMessage(chatId, welcomeMsg, Markup.inlineKeyboard(keyboard));
            }

            // --- أوامر الأدمن ---
            if (chatId === ADMIN_ID && text.startsWith('/make_reseller')) {
                const targetId = parseInt(text.split(' ')[1]);
                const userIndex = data.users.findIndex(u => u.id === targetId);
                if (userIndex !== -1) {
                    data.users[userIndex].role = 'reseller';
                    await writeData(data);
                    await bot.telegram.sendMessage(chatId, "✅ تم تفعيل رتبة المورد.");
                }
            }

            // --- أوامر الموردين ---
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
                    await bot.telegram.sendMessage(chatId, `✅ تم الربط بنجاح.`, Markup.inlineKeyboard([
                        [Markup.button.callback('📖 عرض الدليل', 'show_guide')]
                    ]));
                }
            }
        }

        // --- معالجة الضغط على زر الدليل (Actions) ---
        if (req.body && req.body.callback_query) {
            const callbackData = req.body.callback_query.data;
            const chatId = req.body.callback_query.from.id;

            if (callbackData === 'show_guide') {
                const guideText = (chatId === ADMIN_ID) ? GUIDES.admin : GUIDES.reseller;
                await bot.telegram.sendMessage(chatId, guideText, { parse_mode: 'HTML' });
            }
        }

        // --- معالجة الإيميلات الواردة (كما في الكود السابق) ---
        if (req.body && req.body.to && req.body.content) {
            // (نفس منطق إرسال الأكواد السابق دون تغيير)
            const emailTo = req.body.to.toLowerCase().trim();
            const content = req.body.content;
            const targetUsers = data.users.filter(u => 
                (u.emails && u.emails.includes(emailTo)) || (u.email && u.email.toLowerCase() === emailTo)
            );
            
            const codeMatch = content.match(/\b\d{4}\b/g);
            const validCode = codeMatch ? codeMatch[codeMatch.length - 1] : null;

            for (const u of targetUsers) {
                const displayName = (u.clients && u.clients[emailTo]) ? u.clients[emailTo] : "حساب شخصي";
                if (validCode) {
                    await bot.telegram.sendMessage(u.id, `👤 <b>${displayName}</b>\n🔢 الكود: <code>${validCode}</code>`, { parse_mode: 'HTML' });
                }
            }
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error(e); }
    res.status(200).send('OK');
};
