const R = require('ramda');
const { fakerEN, fakerDE, fakerES, fakerFR } = require('@faker-js/faker');

const findObjInList = R.curry((key, val, arr) =>
  R.find(R.propEq(val, key), arr)
);

const filterObjInList = R.curry((key, val, arr) =>
  R.filter(R.propEq(val, key), arr)
);

const hasAttributeValue = R.curry((key, val, obj) => R.propEq(val, key, obj.attributes));

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

function formatDt(tsMsec) {
  const dt = new Date(tsMsec);
  return dt.toLocaleTimeString();
}

function formatSid(sid) {
  return `${sid.slice(0, 2)}...${sid.slice(-4)}`
}

const fakerModules = {
  'EN': fakerEN,
  'DE': fakerDE,
  'ES': fakerES,
  'FR': fakerFR,
};

function localeToFakerModule(locale) {
  const lang = locale.slice(0, 2).toUpperCase();
  const module = fakerModules[lang] || fakerModules['EN'];
  return module;
}

module.exports = {
  delay,
  filterObjInList,
  findObjInList,
  formatDt,
  formatSid,
  hasAttributeValue,
  localeToFakerModule
}