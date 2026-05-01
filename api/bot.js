const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// معرف مدير النظام (Owner)
const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    try {
        const data = await readData();

        // --- 1. استقبال البيانات من الـ Webhook (الأكواد والروابط) ---
        if (req.body && req.body.to && req.body.content) {
            const emailTo = req.body.to.toLowerCase().trim();
            const fullContent = req.body.content; // نستخدم البيانات الكاملة لاستخراج الروابط
            
            const targetUsers = data.users.filter(u => 
                (u.emails && u.emails.includes(emailTo)) || (u.email && u.email === emailTo)
            );

            // استخراج رابط التأكيد (خاص بالتلفاز)
            const urlMatch = fullContent.match(/https?:\/\/(?:www\.)?netflix\.com\/(?:nm|setup|verify)[^\s<>"]+/g);
            const confirmationUrl = urlMatch ? urlMatch[0] : null;

            // استخراج الكود الرقمي (4 أرقام)
            const codeMatch = fullContent.match(/\b\d{4}\b/g);
            const validCode = codeMatch ? codeMatch[codeMatch.length - 1] : null;

            for (const u of targetUsers) {
                const displayName = (u.clients && u.clients[emailTo]) ? u.clients[emailTo] : "حسابك الشخصي";
                const isTvProfile = /TV/i.test(displayName); // فحص إذا كان الاسم يحتوي على TV

                if (isTvProfile && confirmationUrl) {
                    await bot.telegram.sendMessage(u.id, 
                        `📺 <b>تأكيد التلفاز لـ: ${displayName}</b>\n\n` +
                        `🔗 تم اكتشاف رابط تأكيد الموقع لجهاز التلفاز الخاص بك.`, 
                        { 
                            parse_mode: 'HTML',
                            ...Markup.inlineKeyboard([[Markup.button.url('✅ إضغط هنا لتأكيد التلفاز', confirmationUrl)]])
                        }
                    );
                } else if (validCode) {
                    await bot.telegram.sendMessage(u.id, 
                        `👤 <b>المشترك: ${displayName}</b>\n🔢 كود تسجيل الدخول: <code>${validCode}</code>`, 
                        { parse_mode: 'HTML' }
                    );
                }
            }
            return res.status(200).send('OK');
        }

        // --- 2. معالجة رسائل البوت المباشرة ---
        if (!req.body || !req.body.message) return res.status(200).send('OK');

        const chatId = req.body.message.from.id;
        const text = req.body.message.text || "";
        const isAdmin = chatId === ADMIN_ID;

        let user = data.users.find(u => u.id === chatId);
        if (!user) {
            user = { id: chatId, name: req.body.message.from.first_name, role: 'user', emails: [], clients: {} };
            data.users.push(user);
            await writeData(data);
        }

        const isReseller = user.role === 'reseller' || isAdmin;

        // القائمة الرئيسية (Keyboard)
        if (text === '/start' || text === '🏠 القائمة الرئيسية') {
            const menu = [
                ['🏠 طلب كود نيتفليكس', '📋 حالتي'],
                ['🔍 البحث عن زبون', '⚙️ إدارة المشتركين']
            ];
            await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(menu).resize());
            return res.status(200).send('OK');
        }

        // عرض حالتي والرتبة
        if (text === '📋 حالتي') {
            let roleName = "زبون";
            if (isAdmin) roleName = "👑 مدير النظام (Owner)"; // تمييز رتبتك كمدير
            else if (user.role === 'reseller') roleName = "⭐ مورد معتمد";

            await bot.telegram.sendMessage(chatId, `👤 الاسم: ${user.name}\n🎖️ الرتبة: ${roleName}\n🆔 ID: <code>${chatId}</code>`, { parse_mode: 'HTML' });
            return res.status(200).send('OK');
        }

        // إدارة المشتركين - عرض الأزرار كما في الصورة
        if (text === '⚙️ إدارة المشتركين' && isReseller) {
            const clientsObj = user.clients || {};
            const clientNames = Object.values(clientsObj);

            if (clientNames.length === 0) {
                await bot.telegram.sendMessage(chatId, "⚠️ لا يوجد زبائن مسجلين. أضف زبوناً باستخدام:\n<code>/add_client email name</code>", { parse_mode: 'HTML' });
                return res.status(200).send('OK');
            }

            const buttons = clientNames.map(name => [Markup.button.callback(name, `manage_${name}`)]);
            await bot.telegram.sendMessage(chatId, "⚙️ قائمة آخر المشتركين:", Markup.inlineKeyboard(buttons));
            return res.status(200).send('OK');
        }

        // إضافة زبون جديد
        if (isReseller && text.startsWith('/add_client')) {
            const parts = text.split(' ');
            if (parts.length >= 3) {
                const email = parts[1].toLowerCase().trim();
                const clientName = parts.slice(2).join(' ');
                if (!user.emails) user.emails = [];
                if (!user.clients) user.clients = {};
                user.clients[email] = clientName;
                if (!user.emails.includes(email)) user.emails.push(email);
                await writeData(data);
                await bot.telegram.sendMessage(chatId, `✅ تم تسجيل الزبون <b>${clientName}</b> بريد: <code>${email}</code>`, { parse_mode: 'HTML' });
            }
            return res.status(200).send('OK');
        }

        // التعامل مع الأحداث (Actions) للأزرار التفاعلية
        bot.action(/manage_(.+)/, async (ctx) => {
            const name = ctx.match[1];
            const actions = [
                [Markup.button.callback('🗑️ حذف', `del_${name}`)],
                [Markup.button.callback('🔄 تجديد', `renew_${name}`)],
                [Markup.button.callback('📧 ربط إيميل', `link_${name}`)]
            ];
            await ctx.editMessageText(`اختر الإجراء لـ <b>${name}</b>:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(actions) });
        });

        bot.action(/del_(.+)/, async (ctx) => {
            const name = ctx.match[1];
            const emailKey = Object.keys(user.clients).find(k => user.clients[k] === name);
            if (emailKey) {
                delete user.clients[emailKey];
                user.emails = user.emails.filter(e => e !== emailKey);
                await writeData(data);
                await ctx.answerCbQuery(`✅ تم حذف ${name}`);
                await ctx.editMessageText(`✅ تم حذف الزبون بنجاح.`);
            }
        });

        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Error:", e.message); }
    if (!res.writableEnded) res.status(200).send('OK');
};
