const { formatDt } = require('flexsim-lib');

const delay = (mSec) => {
  return new Promise(
    function (resolve, _reject) {
      setTimeout(
        function () {
          resolve(mSec);
        },
        mSec
      );
    }
  );
};

function addGatherDigitsToTwiml(twiml, actionHost) {
  twiml.gather({
    input: 'dtmf',
    finishOnKey: '#',
    timeout: 5,
    action: `${actionHost}/digitsGathered`,
    actionOnEmptyResult: true
  });
}

function addSpeechToTwiml(twiml, params) {
  const { speech, isCenter, voice, pauseBetween } = params;
  let elapsed = 0;
  let idx = 0;
  speech.forEach(line => {
    const sepIdx = line.indexOf('-');
    const duration = parseInt(line.slice(0, sepIdx)) + pauseBetween;
    const text = line.slice(sepIdx + 1);
    if (thisPartySpeaks(idx, isCenter))
      twiml.say({ voice }, text);
    else
      twiml.pause({ length: duration });
    idx += 1;
    elapsed += duration;
  });
  return elapsed;
}

function thisPartySpeaks(idx, isCenter) {
  return (idx % 2 === 0) === isCenter
}

function respondWithTwiml(res, twiml) {
  res.type('text/xml');
  const twimlStr = twiml.toString();
  log('generated twiml:', twimlStr);
  res.send(twimlStr);
}

function log(text, obj, level = 'log') {
  const now = Date.now();
  if (obj)
    console[level](`${formatDt(now)}: ${text}`, obj);
  else
    console[level](`${formatDt(now)}: ${text}`);

}

module.exports = {
  addGatherDigitsToTwiml,
  addSpeechToTwiml,
  delay,
  log,
  respondWithTwiml
}