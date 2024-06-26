const {WechatyBuilder} = require('wechaty');
const qrcodeTerminal = require("qrcode-terminal");
// const config = require("../config/secret");
const secret = require("../config/confLoader");
const {downloader} = require("./common")();
const fs = require("fs");

const wxbot = WechatyBuilder.build({
    name: 'data/ctbridgebot',
    puppet: 'wechaty-puppet-wechat',
    puppetOptions: {uos: true}
});
const DTypes = {
    Default: -1,
    NotSend: 0,
    Text: 1,
    Image: 2,
    Audio: 3,
    CustomEmotion: 4,
    File: 5,
    Push: 6,
};

module.exports = (tgBotDo, wxLogger) => {
    // running instance of wxbot-pre
    let needLoginStat = 0;
    wxbot.on('scan', async (qrcode, status) => {
        const qrcodeImageUrl = [
            'https://api.qrserver.com/v1/create-qr-code/?data=',
            encodeURIComponent(qrcode),
        ].join('');
        if (status === 2) {
            qrcodeTerminal.generate(qrcode, {small: true}); // show QRcode in terminal
            console.log(qrcodeImageUrl);
            // if need User Login
            if (needLoginStat === 0) {
                needLoginStat = 1;
                const isUserTriggeredRelogin = fs.existsSync("data/userTriggerRelogin.flag");
                setTimeout(async () => {
                    if (needLoginStat === 1) {
                        if (secret.notification.send_relogin_via_tg) await tgBotDo.SendMessage(null,
                            `Your WX credential expired, please log in by scanning this qrcode:\t\n${qrcodeImageUrl}`, false, "HTML");
                        if (!isUserTriggeredRelogin) with (secret.notification) await downloader.httpsCurl(baseUrl + prompt_relogin_required + default_arg);
                        wxLogger.info(`Already send re-login reminder to user.`);
                    }
                }, isUserTriggeredRelogin ? 500 : 27000);
                // delete the flag file after sent notification.
                if(isUserTriggeredRelogin) fs.unlinkSync("data/userTriggerRelogin.flag");
            }

        } else if (status === 3) {
            wxLogger.info(`------[The code is already scanned.]------`);
            needLoginStat = 0;
        } else {
            console.log(`User may accepted login. Continue listening...`);
        }
    });

    // wxbot.on('logout', ...) is defined in BotIndex.js.

    let wxBotErrorStat = 0;
    wxbot.on('error', async (e) => {
        // This error handling function should be remastered!
        let msg = e.toString();
        const isWDogErr = e.toString().includes("WatchdogAgent reset: lastFood:");
        if (wxBotErrorStat === 0 && isWDogErr) {
            wxBotErrorStat = 1;
            // No need to output any console log now, full of errors!
            with (secret.notification) await downloader.httpsCurl(baseUrl + prompt_wx_stuck + default_arg);
            wxLogger.error(msg + `\nFirst Time;`);
            setTimeout(() => {
                if (wxBotErrorStat > 12) {
                    wxLogger.error(`Due to wx error, initiated self restart procedure!!!\n\n`);
                    setTimeout(() => process.exit(1), 5000);
                } else {
                    wxLogger.info("wxBotErrorStat not reaching threshold, not exiting.\t" + wxBotErrorStat);
                }
            }, 10000);
        } else if (wxBotErrorStat > 0 && isWDogErr) {
            wxBotErrorStat++;
            // following watchdog error, skipped
        } else {
            wxLogger.warn(msg);
        }
    });

    return {
        wxbot: wxbot,
        DTypes: DTypes,
    };
};
