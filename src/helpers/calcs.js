const R = require('ramda');

const { findObjInList } = require('./util');

function calcCustomAttrs(properties, attributes) {
  const kvPairs = R.map(calcValueToProp(properties), attributes);
  const customAttrs = R.mergeAll(kvPairs);
  return customAttrs;
}

function calcCustomAttribute(properties, attributes, attrName) {
  const attribute = findObjInList('name', attrName, attributes);
  const kvPair = calcValueToProp(properties, attribute);
  return kvPair[attrName];
}

function calcActivityChange(ctx, worker) {
  const { cfg } = ctx;
  const { metadata } = cfg;
  const { activities } = metadata;

  const mapping = activities.map(R.prop('portion'));
  const idx = getMappingIndexUniform(mapping);
  const activity = activities[idx];

  const currActivityName = worker.activityName;
  const currActivity = findObjInList('name', currActivityName, activities);
  const delayMsec = currActivity.baseDur * 1000;

  return [activity.name, delayMsec];
}

const calcValueToProp = R.curry((properties, attribute) => {
  const { name, property, mapping } = attribute;
  const propName = property || name;
  const prop = findObjInList('name', propName, properties);
  const { enum: values } = prop;
  const idx = getMappingIndexUniform(mapping);
  const val = values[idx];
  return { [name]: val };
});

function getMappingIndexUniform(mapping) {
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
  return idx;
}
module.exports = {
  calcActivityChange,
  calcCustomAttrs,
  calcCustomAttribute
}