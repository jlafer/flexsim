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

function respondWithTwiml(res, twiml) {
  res.type('text/xml');
  const twimlStr = twiml.toString();
  console.log('  generated twiml:', twimlStr);
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
  delay,
  log,
  respondWithTwiml
}