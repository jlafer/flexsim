const R = require('ramda');

const findObjInList = R.curry((key, val, arr) =>
  R.find(R.propEq(val, key), arr)
);

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

module.exports = {
  delay,
  findObjInList
}