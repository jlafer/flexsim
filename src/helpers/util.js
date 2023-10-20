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

function respondWithTwiml(res, twiml) {
  res.type('text/xml');
  const twimlStr = twiml.toString();
  //log('generated twiml:', twimlStr, 'debug');
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
  delay,
  log,
  respondWithTwiml
}