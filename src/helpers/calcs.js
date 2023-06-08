const R = require('ramda');

const { findObjInList } = require('./util');

function calcCustomAttrs(properties, attributes) {
  const kvPairs = R.map(calcValueToProp(properties), attributes);
  const customAttrs = R.mergeAll(kvPairs);
  return customAttrs;
}

const calcValueToProp = R.curry((properties, attribute) => {
  const { name, property, mapping } = attribute;
  const randNum = Math.random();
  let upper = 0.0;
  let idx;
  for (let i = 0; i < mapping.length; i++) {
    upper += mapping[i];
    if (upper > randNum) {
      idx = i;
      break;
    }
  }
  const propName = property || name;
  const prop = findObjInList('name', propName, properties);
  const { enum: values } = prop;
  const val = values[idx];
  return { [name]: val };
});

module.exports = {
  calcCustomAttrs
}