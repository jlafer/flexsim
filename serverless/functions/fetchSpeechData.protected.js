const { addSpeechToTwiml } = require('flexsim-lib');
const axios = require('axios');

let helpersPath = Runtime.getFunctions()['flexsim-serverless-helpers'].path;
let helpers = require(helpersPath);

exports.handler = async function (context, event, callback) {
  const { FlowSid, ixnId } = event;

  const ixnData = await helpers.fetchIxnData(context, 'calls', ixnId);
  const twiml = new Twilio.twiml.VoiceResponse();
  const url = `https://${context.SERVERLESS_ASSETS_SUBDOMAIN}-prod.twil.io/speech.json`;
  const resp = await axios.get(url);
  const speech = resp.data;
  console.log('speech:', speech);
  addSpeechToTwiml(
    twiml,
    {
      speech, intent: ixnData.intent, mode: 'selfService', isCenter: true,
      pauseBetween: 3
    }
  );
  twiml.redirect(
    { method: 'POST' },
    `https://webhooks.twilio.com/v1/Accounts/${context.ACCOUNT_SID}/Flows/${FlowSid}?FlowEvent=return`
  );
  callback(null, twiml);
};
