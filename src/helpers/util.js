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
  const { speech, intent, mode, isCenter, voice, pauseBetween } = params;
  let elapsedOtherSpeech = 0;
  let elapsedPaused = 0;
  let elapsedAll = 0;
  let idx = 0;
  const convo = intent || 'default';
  const convoSpeech = speech[convo] || speech.default;

  convoSpeech[mode].forEach(line => {
    const sepIdx = line.indexOf('-');
    const speechDur = parseInt(line.slice(0, sepIdx));
    const text = line.slice(sepIdx + 1);

    elapsedAll += speechDur;

    if (thisPartySpeaks(idx, isCenter)) {
      twiml.say({ voice }, text);
    }
    else {
      elapsedOtherSpeech += speechDur;
      const pauseDelta = elapsedOtherSpeech - elapsedPaused;
      const durationSecs = Math.round(pauseDelta / 1000);
      const pauseActual = durationSecs * 1000;
      elapsedAll += (pauseBetween * 1000);
      twiml.pause({ length: durationSecs + pauseBetween });
      elapsedPaused += pauseActual;
    }
    idx += 1;
  });
  return Math.round(elapsedAll / 1000);
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