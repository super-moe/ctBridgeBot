// noinspection JSUnresolvedVariable

const secretConfig = require('./config/secret');
const Config = require('./config/public');
const TelegramBot = require('node-telegram-bot-api');
const FileBox = require("file-box");
const fs = require("fs");
const {wxLogger, tgLogger, conLogger, cyLogger, LogWxMsg} = require('./logger')();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tgbot = new TelegramBot(secretConfig.TGToken,
    {polling: true, request: {proxy: require("./config/proxy")},});
const tgBotSendMessage = async (msg, isSilent = false, parseMode) => {
    /*Debug Only;no TG messages delivered*/
    // return tgLogger.info(`Blocked Msg: ${msg}`);
    await delay(100);
    let form = {};
    if (isSilent) form.disable_notification = true;
    if (parseMode) form.parse_mode = parseMode;
    return await tgbot.sendMessage(secretConfig.My_TG_ID, msg, form).catch((e) => tgLogger.error(e));
};
const tgBotRevokeMessage = async (msgId) => {
    await delay(100);
    return await tgbot.deleteMessage(secretConfig.My_TG_ID, msgId).catch((e) => tgLogger.error(e));
};
const tgBotSendAnimation = async (msg, path, isSilent = false, hasSpoiler = true) => {
    await delay(100);
    let form = {
        caption: msg,
        has_spoiler: hasSpoiler,
        width: 100,
        height: 100,
    };
    if (isSilent) form.disable_notification = true;
    return await tgbot.sendAnimation(secretConfig.My_TG_ID, path, form, {contentType: 'image/gif'}).catch((e) => tgLogger.error(e));
};
const tgBotSendPhoto = async (msg, path, isSilent = false, hasSpoiler = false) => {
    await delay(100);
    let form = {
        caption: msg,
        has_spoiler: hasSpoiler,
        width: 100,
        height: 100,
    };
    if (isSilent) form.disable_notification = true;
    return await tgbot.sendPhoto(secretConfig.My_TG_ID, path, form, {contentType: 'image/jpeg'}).catch((e) => tgLogger.error(e));
};
const tgBotSendAudio = async (msg, path, isSilent = false) => {
    await delay(100);
    let form = {
        caption: msg,
        width: 100,
        height: 100,
    };
    if (isSilent) form.disable_notification = true;
    return await tgbot.sendAudio(secretConfig.My_TG_ID, path, form, {contentType: 'image/jpeg'}).catch((e) => tgLogger.error(e));
};

tgbot.on('message', onTGMsg);

async function onTGMsg(tgMsg) {
    try {
        if (process.uptime() < 10) return;
        if (tgMsg.reply_to_message) {
            for (const pair of msgMappings) {
                if (pair[0] === tgMsg.reply_to_message.message_id) {
                    pair[1].say(tgMsg.text);
                    tgLogger.debug(`Handled a message send-back to ${pair[2]}.`);
                    return;
                }
            }
            tgLogger.debug(`Unable to send-back due to no match in msgReflection.`);
        } else if (tgMsg.text === "/find") {
            const tgMsg2 = await tgbot.sendMessage(tgMsg.chat.id, 'Entering find mode; enter token to find it.');
            state.lastOpt = ["/find", tgMsg2];
        } else if (tgMsg.text.indexOf("/find") === 0) {
            // Want to find somebody
            await findSbInWechat(tgMsg.text.replace("/find ", ""));
        } else if (tgMsg.text === "/clear") {
            state.lastOpt = null;
        } else if (tgMsg.text === "/info") {
            const statusReport = `---state.lastOpt: <code>${JSON.stringify(state.lastOpt)}</code>\n---RunningTime: <code>${process.uptime()}</code>`;
            await tgBotSendMessage(statusReport, true, "HTML");
        } else if (tgMsg.text === "/placeholder") {
            await tgbot.sendMessage(tgMsg.chat.id, `Start---\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nStop----`);
        } else {
            // !!! No valid COMMAND matches to msg
            if (state.lastOpt === null) {
                // Activate chat & env. set
                // noinspection JSUnresolvedVariable,JSIgnoredPromiseFromCall
                await tgbot.sendMessage(tgMsg.chat.id, 'Nothing to do upon your message, ' + tgMsg.chat.id);
                // const setChatMenuButtonState = await tgbot.setChatMenuButton({chat_id:config.TGToken,menu_button:TGBotCommands});
                const result = await tgbot.setMyCommands(Config.TGBotCommands);
                tgLogger.debug(`I received a message from chatId ${tgMsg.chat.id}, Update ChatMenuButton:${result ? "OK" : "X"}.`);
            } else if (state.lastOpt[0] === "/find") {
                const msgToRevoke1 = state.lastOpt[1];
                const result = await findSbInWechat(tgMsg.text);
                // Revoke the prompt 'entering find mode'
                if (result) {
                    await tgBotRevokeMessage(msgToRevoke1.message_id);
                    await tgBotRevokeMessage(tgMsg.message_id);
                }
                // if (result) state.lastOpt = null;
            } else if (state.lastOpt[0] === "chat") {
                // forward to last talker
                state.lastOpt[1].say(tgMsg.text);

                tgLogger.debug(`Handled a message send-back to speculative talker:${await state.lastOpt[2]}.`);
            } else {
                // Empty here.
            }
        }
    } catch (e) {
        tgLogger.warn(`Uncaught Error while handling TG message: ${e.toString()}`);
    }
}

async function findSbInWechat(token) {
    await tgbot.sendChatAction(secretConfig.My_TG_ID, "typing");
    const wxFinded1 = await wxbot.Contact.find({name: token});
    const wxFinded2 = wxFinded1 || await wxbot.Room.find({topic: token});
    if (wxFinded1) {
        const tgMsg = await tgBotSendMessage(`🔍Found Person: name=<code>${await wxFinded1.name()}</code> <tg-spoiler>alias=${await wxFinded1.alias()}</tg-spoiler>`,
            true, "HTML");
        await addToMsgMappings(tgMsg.message_id, wxFinded1);
    } else if (wxFinded2) {
        const tgMsg = await tgBotSendMessage(`🔍Found Group: topic=<code>${await wxFinded2.topic()}</code>`,
            true, "HTML");
        await addToMsgMappings(tgMsg.message_id, wxFinded2);
    } else {
        await tgBotSendMessage(`🔍Found Failed. Please enter token again or /clear.`);
        return false;
    }
    return true;
}

async function downloadFile(url, pathName) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(pathName);
        require('http').get(url, (response) => {
            // response.setEncoding("binary");
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve("SUCCESS");
            });
        }).on('error', (error) => {
            fs.unlink(pathName, () => reject(error));
        });
    });
}

let msgMappings = [];
let state = {
    lastOpt: null
};   // as for talker, [1] is Object, [2] is name.


async function addToMsgMappings(tgMsg, talker) {
    const name = await (talker.name ? talker.name() : talker.topic());
    msgMappings.push([tgMsg, talker, name]);
    state.lastOpt = ["chat", talker, name];
}

// 监听对话
async function onWxMessage(msg) {

    // 按照距今时间来排除wechaty重启时的重复消息
    let isMessageDropped = msg.age() > 30 && process.uptime() < 50;
    //将收到的所有消息之摘要保存到wxLogger->trace,消息详情保存至wxMsg文件夹
    LogWxMsg(msg, isMessageDropped);
    if (isMessageDropped) return;

    //基本信息提取-------------
    const contact = msg.talker(); // 发消息人
    let content = msg.text().trim(); // 消息内容
    const room = msg.room(); // 是否是群消息
    const name = await contact.name();
    const alias = await contact.alias() || await contact.name(); // 发消息人备注
    //DeliverType
    const DTypes = {
        Default: -1,
        NotSend: 0,
        Text: 1,
        Image: 2,
        Audio: 3,
        CustomEmotion: 4,
    };
    let DType = DTypes.Default;

    //已撤回的消息单独处理
    if (msg.type() === wxbot.Message.Type.Recalled) {
        const recalledMessage = await msg.toRecalled();
        wxLogger.debug(`This message was a recaller, original is {{ ${recalledMessage} }}`);
        // await tgbot.sendMessage(config.My_TG_ID, `Message: ${recalledMessage} has been recalled.`);
        await tgBotSendMessage(`Message: {{ ${recalledMessage} }} has been recalled.`, true);
        return;
    }

    //处理自定义表情
    const CustomEmotionRegex = new RegExp(/&lt;msg&gt;(.*?)md5="(.*?)"(.*?)cdnurl(.*?)"(.*?)" designer/g);
    if (msg.type() === wxbot.Message.Type.Image) try {
        let result = CustomEmotionRegex.exec(content);
        let emotionHref = result[5].replace(/&amp;amp;/g, "&");
        let md5 = result[2];
        content = content.replace(/&lt;msg&gt;(.*?)&lt;\/msg&gt;/, `[CustomEmotion]`);
        wxLogger.debug(`Discovered as CustomEmotion, Got a link: ${emotionHref}`);
        DType = DTypes.CustomEmotion;
        //查找是否有重复项,再保存CustomEmotion并以md5命名.消息详情中的filename有文件格式信息
        //Sometimes couldn't get fileExt so deprecate it
        // const fileExt = msg.payload.filename.substring(19, 22) || ".gif";
        const fileExt = ".gif";
        const cEPath = `./downloaded/customEmotion/${md5 + fileExt}`;
        if (!fs.existsSync(cEPath)) {
            if (await downloadFile(emotionHref, cEPath)) {
                // downloadFile_old(emotionHref, path + ".backup.gif");
                msg.downloadedPath = cEPath;
            } else msg.downloadedPath = null;
        } else msg.downloadedPath = cEPath;
    } catch (e) {
        wxLogger.trace(`CustomEmotion Check not pass, Maybe identical photo.`);
        //尝试解析为图片
        const fBox = await msg.toFileBox();
        const photoPath = `./downloaded/photo/${alias}-${msg.payload.filename}`;
        await fBox.toFile(photoPath);
        if (fs.existsSync(photoPath)) {
            wxLogger.debug(`Discovered as Image, Downloaded as: ${photoPath}`);
            DType = DTypes.Image;
            msg.downloadedPath = photoPath;
        } else wxLogger.debug(`Discovered as Image, But download failed. Ignoring.`);

    }

    if (msg.type() === wxbot.Message.Type.Audio) try {
        const fBox = await msg.toFileBox();
        const audioPath = `./downloaded/audio/${alias}-${msg.payload.filename}`;
        await fBox.toFile(audioPath);
        if (fs.existsSync(audioPath)) {
            wxLogger.debug(`Discovered as Audio, Downloaded as: ${audioPath}`);
            DType = DTypes.Audio;
            msg.downloadedPath = audioPath;
        } else wxLogger.debug(`Discovered as Audio, But download failed. Ignoring.`);
    } catch (e) {
        wxLogger.debug(`Discovered as Audio, But download failed. Ignoring.`);
    }
    //文字消息判断:
    if (DType === DTypes.Default && msg.type() === wxbot.Message.Type.Text) DType = DTypes.Text;

    //处理未受支持的emoji表情
    if (DType === DTypes.Text) {
        const UsEmojiRegex = new RegExp(/<img class="(.*?)" text="(.*?)" src="\/zh_CN\/htmledition\/v2\/images\/spacer.gif" \/>/);
        let replaceFlag = 1;
        while (replaceFlag > 0) try {
            UsEmojiRegex.lastIndex = 0;
            let execResult = UsEmojiRegex.exec(content);
            wxLogger.trace('UsEmoji Replaced,' + JSON.stringify([execResult[1], execResult[2]]));
            content = content.replace(/<img class="(.*?)" text="(.*?)" src="\/zh_CN\/htmledition\/v2\/images\/spacer.gif" \/>/, `${execResult[2]}`);
            content = content.replace("_web", "");
        } catch (e) {
            replaceFlag = 0;
        }
    }

    //正式处理消息--------------
    // ---目前只处理文字消息,后续此代码块同时处理
    if (DType > 0) {
        if (room) {
            //是群消息 - - - - - - - -
            const topic = await room.topic();
            //筛选出自己的消息
            if (msg.self() && topic !== "CyTest") return;

            // 群系统消息,如拍一拍
            if (name === topic) {
                wxLogger.debug(`群聊[in ${topic}] ${content}`);
                await tgBotSendMessage(`[in ${topic}] ${content}`, 1);
                return;
            }
            let tgMsg;
            if (DType === DTypes.CustomEmotion) {
                if (fs.existsSync(msg.downloadedPath)) {
                    const stream = fs.createReadStream(msg.downloadedPath);
                    tgMsg = await tgBotSendAnimation(`📬[${name}@${topic}] [CustomEmotion]`, stream, true, true);
                } else {
                    wxLogger.warn(`Attempt to read CuEmo file but ENOENT. Please check environment.`);
                }
            } else {
                //End up:发送正常文字消息
                wxLogger.debug(`群聊[From ${name} in ${topic}] ${content}`);
                // if (topic === "xx三人组") return;
                tgMsg = await tgBotSendMessage(`📬<b>[${name}@${topic}]</b> ${content}`, 0, "HTML");
            }
            await addToMsgMappings(tgMsg.message_id, room);
        } else {
            //不是群消息 - - - - - - - -
            if (msg.self()) return;
            //微信运动-wipe-out(由于客户端不支持微信运动消息的显示，故被归类为text)
            if (alias === "微信运动") {
                return;
            }
            let tgMsg;
            if (DType === DTypes.CustomEmotion) {
                try {
                    const stream = fs.createReadStream(msg.downloadedPath);
                    tgMsg = await tgBotSendAnimation(`[${alias}] [CustomEmotion]`, stream, true, false);
                } catch (e) {
                    wxLogger.warn(`Attempt to read CuEmo file but ENOENT. Please check environment.`);
                    tgMsg = await tgBotSendMessage(`📨[${alias}] [CustomEmotion](Couldn't send)`, true);
                }
            } else if (DType === DTypes.Audio) {
                wxLogger.debug(`发消息人: ${alias} 消息内容为语音，保存至 ${msg.downloadedPath}.`);
                const stream = fs.createReadStream(msg.downloadedPath);
                tgMsg = await tgBotSendAudio(`[${alias}] 🎤`, stream, false);
            } else if (DType === DTypes.Image) {
                const stream = fs.createReadStream(msg.downloadedPath);
                tgMsg = await tgBotSendPhoto(`[${alias}] 🖼`, stream, true, false);
            } else {
                wxLogger.debug(`发消息人: ${alias} 消息内容: ${content}`);
                tgMsg = await tgBotSendMessage(`📨[${alias}] ${content}`);
            }
            if (!tgMsg) {
                return tgLogger.warn("Didn't get valid TG receipt, bind Mapping failed.");
            }

            await addToMsgMappings(tgMsg.message_id, msg.talker());
        }
    }
}

wxbot = require('./wxbot-pre')(tgbot, wxLogger);


wxbot.on('message', onWxMessage);
wxbot.on('login', async user => {
    wxLogger.info(`${user}已登录.`);
    // await tgBotSendMessage(`[Cy Notice] Service Started.`,1);
});
wxbot.start()
    .then(() => wxLogger.info('开始登陆大而丑...'))
    .catch((e) => wxLogger.error(e));
require('./logger')("startup");
