// noinspection JSUnreachableSwitchBranches

const dayjs = require("dayjs");
const {tgBotDo} = require("../src/tgbot-pre");
let env;

// async function a() {
//     const {} = env;
// }

async function mergeToPrev_tgMsg(msg, isGroup, content, name = "") {
    const {state, defLogger, tgBotDo, secret} = env;
    const word = isGroup ? "Room" : "Person";
    const _ = isGroup ? state.preRoom : state.prePerson;
    const newFirstTitle = (msg.receiver.wx) ? 0 : (isGroup ? _.topic : name);
    const who = isGroup ? `${_.topic}/${name}` : name;
    const newItemTitle = (() => {
        const s = secret.settings.changeTitleForSameTalkerInMergedRoomMsg;
        if (s === false || _.lastTalker !== name) {
            _.talkerCount = 0;
            _.lastTalker = name;
            return `[<u>${isGroup ? name : dayjs().format("H:mm:ss")}</u>]`;
        }
        _.talkerCount++;
        if (typeof s === "string") return s || `|→ `;
        if (typeof s === "function") return s(_.talkerCount);
        defLogger.warn(`Invalid configuration found for {settings.changeTitleForSameTalkerInMergedRoomMsg}!`);
        return `|→ `;
    })();
    msg[`pre${word}NeedUpdate`] = false;
    content = filterMsgText(content);
    // from same talker check complete, ready to merge
    if (_.firstWord === "") {
        // Already merged, so just append newer to last
        const newString = `${_.msgText}\n${newItemTitle} ${content}`;
        _.msgText = newString;
        _.tgMsg = await tgBotDo.EditMessageText(newString, _.tgMsg, _.receiver);
        defLogger.debug(`Merged msg from ${word}: ${who}, "${content}" into former.`);
        return true;
    } else {
        // Ready to modify first msg, refactoring it.
        ///* C2C msg do not need header */qdata.receiver.qTarget ? `` :`📨⛓️ [<b>${name}</b>] - - - -\n`)
        const newString = (newFirstTitle === 0 ? `` : `📨⛓️ [<b>${newFirstTitle}</b>] - - - -\n`) +
            `${_.firstWord}\n${newItemTitle} ${content}`;
        _.msgText = newString;
        _.firstWord = "";
        _.tgMsg = await tgBotDo.EditMessageText(newString, _.tgMsg, _.receiver);
        defLogger.debug(`Merged msg from ${word}: ${who}, "${content}" into first.`);
        return true;
    }
}

async function replyWithTips(tipMode = "", target = null, timeout = 6, additional = null) {
    const {tgLogger, state, defLogger, tgBotDo} = env;
    let message = "", form = {};
    switch (tipMode) {
        case "globalCmdToC2C":
            message = `You sent a global command to a C2C chat. The operation has been blocked and please check.`;
            break;
        case "C2CNotFound":
            message = `Your C2C peer could not be found. Please Check!`;
            break;
        case "wrongMYSTAT_setter":
            message = `You sent a global command to a C2C chat. The operation has been blocked and please check.`;
            break;
        case "mystat_changed":
            message = `Changed myStat into ${additional}.`;
            break;
        case "lockStateChange":
            message = `Now conversation lock state is ${additional}.`;
            break;
        case "softReboot":
            message = `Soft Reboot Successful.\nReason: <code>${additional}</code>`;
            form = {reply_markup: {}};
            break;
        case "nothingToDo":
            message = `Nothing to do upon your message, ${target}`;
            break;
        case "audioProcessFail":
            message = `Audio transcript request received, But error occurred when processing.`;
            break;
        default:
            tgLogger.error(`Wrong call of tg replyWithTips() with invalid 'tipMode'. Please check arguments.\n${tipMode}\t${target}`);
            return;
    }
    try {
        const tgMsg = await tgBotDo.SendMessage(target, message, true, "HTML", form);
        defLogger.debug(`Sent out following tips: {${message}}`);
        if (timeout !== 0) {
            tgLogger.debug(`Added message #${tgMsg.message_id} to poolToDelete with timer (${timeout})sec.`);
            state.poolToDelete.push({tgMsg: tgMsg, toDelTs: (dayjs().unix()) + timeout, receiver: target});
        }
    } catch (e) {
        defLogger.warn(`Sending Tip failed in post-check, please check!`);
    }
    // if (timeout !== 0) state.poolToDelete.add(tgMsg, timeout);

}

async function addSelfReplyTs() {
    const {processor, state, ctLogger} = env;
    if (processor.isPreRoomValid(state.preRoom, state.last.name) && state.preRoom.firstWord === "") {
        // preRoom valid and already merged (more than 2 msg)
        const _ = state.preRoom;
        const newString = `${_.msgText}\n⬅️[${dayjs().format("H:mm:ss")}] {My Reply}`;
        _.tgMsg = await tgBotDo.EditMessageText(newString, _.tgMsg, _.receiver);
        ctLogger.debug(`Delivered myself reply stamp into Room:${_.topic} 's former message, and cleared its preRoom.`);
        state.preRoom = {
            firstWord: "",
            tgMsg: null,
            topic: "",
        };
    } else {
        ctLogger.debug(`PreRoom not valid, skip delivering myself reply stamp into former message.`);
    }
}

function filterMsgText(inText) {
    const {tgLogger} = env;
    let txt = inText;
    let appender = "";
    if (/"(.{1,10}): (.*?)"<br\/>- - - - - - - - - - - - - - -<br\/>/.test(txt)) {
        // Filter Wx ReplyTo / Quote      Parameter: (quote-ee name must within [1,10])
        const match = txt.match(/"(.{1,10}): (.*?)"<br\/>- - - - - - - - - - - - - - -<br\/>/);
        // 0 is all match, 1 is orig-msg sender, 2 is orig-msg
        const origMsgClip = (match[2].length > 8) ? match[2].substring(0, 8) : match[2];
        // In clip, we do not need <br/> to be revealed
        const origMsgClip2 = origMsgClip.replaceAll("<br/>", " ");
        txt = txt.replace(match[0], ``);
        // to let this <i> not escaped by "Filter <> for recaller"
        appender += `\n<i>(Quoted "${origMsgClip2}" of ${match[1]})</i>`;
    }
    if (txt.includes("<br/>")) {
        // Telegram would not accept this tag in all mode! Must remind.
        tgLogger.warn(`Unsupported <br/> tag found and cleared. Check Raw Log for reason!`);
        txt = txt.replaceAll("<br/>", "\n");
    }
    // Filter <> for recaller!
    // txt = txt.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    // This function helps reduce the possibility of mistaken substitution
    txt = (t => {
        // noinspection RegExpUnnecessaryNonCapturingGroup
        const tagRegex = /<\/?(\w+)(?:\s+[\w\-.:]+\s*=\s*(?:(?:"[^"]*")|(?:'[^']*')|[^>\s]+))*\s*\/?>/g;
        // Replace all HTML entities with &__; except excluded tags.
        return t.replace(tagRegex, (match, tagName) => {
            const isExcludedTag = ['a', 'b', 'i', 'pre', 'code', 'u', 's'].includes(tagName.toLowerCase());
            return isExcludedTag ? match : match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        });
    })(txt);
    return txt + appender;
}

module.exports = (incomingEnv) => {
    env = incomingEnv;
    return {addSelfReplyTs, replyWithTips, mergeToPrev_tgMsg};
};