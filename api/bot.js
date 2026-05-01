const { Telegraf, Markup } = require('telegraf');
const { readData, writeData } = require('../lib/database');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// معرفك كمدير للنظام (Owner)
const ADMIN_ID = 6197540099;

module.exports = async (req, res) => {
    try {
        const data = await readData();
        
        // 1. معالجة توجيه الأكواد التلقائية (من السيرفر)
        if (req.body && req.body.to && req.body.content) {
            const emailTo = req.body.to.toLowerCase().trim();
            const content = req.body.content;
            const targetUsers = data.users.filter(u => 
                (u.emails && u.emails.includes(emailTo)) || (u.email && u.email === emailTo)
            );
            const codeMatch = content.match(/\b\d{4}\b/g);
            const validCode = codeMatch ? codeMatch[codeMatch.length - 1] : null;

            for (const u of targetUsers) {
                const displayName = (u.clients && u.clients[emailTo]) ? u.clients[emailTo] : "حساب شخصي";
                if (validCode) {
                    await bot.telegram.sendMessage(u.id, `👤 <b>المشترك: ${displayName}</b>\n🔢 الكود: <code>${validCode}</code>`, { parse_mode: 'HTML' });
                }
            }
            return res.status(200).send('OK');
        }

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

        // --- عرض قائمة الزبائن (إدارة المشتركين) ---
        if (text === '⚙️ إدارة المشتركين') {
            if (!isReseller) return res.status(200).send('OK');
            
            // التأكد من وجود كائن clients واستخراج القيم منه
            const clientsObj = user.clients || {};
            const clientNames = Object.values(clientsObj);

            if (clientNames.length === 0) {
                await bot.telegram.sendMessage(chatId, "⚠️ لا يوجد زبائن مسجلين حالياً. استخدم <code>/add_client</code> لإضافة زبون جديد.", { parse_mode: 'HTML' });
                return res.status(200).send('OK');
            }

            // إنشاء أزرار الأسماء (صف بكل اسم)
            const buttons = clientNames.map(name => [Markup.button.callback(name, `manage_${name}`)]);
            
            await bot.telegram.sendMessage(chatId, "⚙️ قائمة آخر المشتركين:", Markup.inlineKeyboard(buttons));
            return res.status(200).send('OK');
        }

        // --- معالجة الضغط على اسم الزبون (القائمة الفرعية) ---
        bot.action(/manage_(.+)/, async (ctx) => {
            const clientName = ctx.match[1];
            const actionButtons = [
                [Markup.button.callback('🗑️ حذف المشترك', `delete_${clientName}`)],
                [Markup.button.callback('🔄 تجديد (التاريخ)', `renew_${clientName}`)],
                [Markup.button.callback('📧 ربط/تعديل إيميل', `link_${clientName}`)]
            ];
            await ctx.editMessageText(`👤 الزبون: <b>${clientName}</b>\nاختر الإجراء المطلوب:`, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard(actionButtons)
            });
        });

        // --- الرد على الأزرار النصية الأخرى ---
        if (text === '📋 حالتي') {
            const roleName = isAdmin ? "👑 مدير النظام (Owner)" : (user.role === 'reseller' ? "⭐ مورد معتمد" : "زبون");
            await bot.telegram.sendMessage(chatId, `👤 الاسم: ${user.name}\n🎖️ الرتبة: ${roleName}\n🆔 ID: <code>${chatId}</code>`, { parse_mode: 'HTML' });
            return res.status(200).send('OK');
        }

        if (text === '/start') {
            const menu = [
                ['🏠 طلب كود نيتفليكس', '📋 حالتي'],
                ['🔍 البحث عن زبون', '⚙️ إدارة المشتركين']
            ];
            await bot.telegram.sendMessage(chatId, "مرحباً بك في Monsieur NFLIX:", Markup.keyboard(menu).resize());
            return res.status(200).send('OK');
        }

        // أمر إضافة زبون (مهم جداً لتعبئة البيانات)
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
                await bot.telegram.sendMessage(chatId, `✅ تم تسجيل الزبون <b>${clientName}</b> بنجاح.`, { parse_mode: 'HTML' });
            }
            return res.status(200).send('OK');
        }

        await bot.handleUpdate(req.body);
    } catch (e) { console.error("Error:", e.message); }
    if (!res.writableEnded) res.status(200).send('OK');
};
