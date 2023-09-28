exports.handler = function (context, event, callback) {
  const { FlowSid } = event;
  const twiml = new Twilio.twiml.VoiceResponse();

  const assets = Runtime.getAssets();
  console.log('read assets:', assets);
  const openFile = assets['/speech.json'].open;
  const data = JSON.parse(openFile());
  const { ivr } = data;
  console.log('read ivr speech:', ivr);
  let idx = 0;
  ivr.forEach(line => {
    const sepIdx = line.indexOf('-');
    const duration = parseInt(line.slice(0, sepIdx)) + 1;
    const text = line.slice(sepIdx);
    if (idx % 2 === 1)
      twiml.pause({ length: duration });
    else
      twiml.say({ voice: 'Polly.Joanna' }, text);
    idx += 1;
  });
  twiml.redirect({ method: 'POST' }, `https://webhooks.twilio.com/v1/Accounts/${context.ACCOUNT_SID}/Flows/${FlowSid}?FlowEvent=return`);
  callback(null, twiml);
};
