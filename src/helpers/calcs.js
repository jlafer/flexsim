const R = require('ramda');

const { getSingleProp } = require('./schema');

function calcCustomAttrs(attributes) {
  const kvPairs = R.map(calcKeyValue, attributes);
  const customAttrs = R.mergeAll(kvPairs);
  return customAttrs;
}

const calcKeyValue = (propAndInst) => {
  const { name } = propAndInst;
  const value = calcValue(propAndInst);
  return { [name]: value };
}

const calcValue = (propAndInst) => {
  const { name, expr } = propAndInst;
  const value = (expr === 'range')
    ? calcRangeValue(propAndInst)
    : calcEnumValue(propAndInst);
  return value;
}

const calcRangeValue = (propAndInst) => {
  const randNum = calcRandomValue(propAndInst);
  const { min, max } = propAndInst;
  const size = max - min;
  const value = (randNum * size) + min;
  return value;
};

const calcEnumValue = (propAndInst) => {
  const { values, valueProps } = propAndInst;
  const portions = valueProps.map(R.prop('portion'));
  const randNum = calcRandomValue(propAndInst);
  const idx = getPortionsIndexUniform(portions, randNum);
  const value = values[idx];
  return value;
};

const calcRandomValue = (propAndInst) => {
  const { curve } = propAndInst;
  const value = (curve == 'uniform')
    ? Math.random()
    : (Math.random() + Math.random()) / 2;
  return value;
};

function calcActivityChange(ctx, worker) {
  const { cfg } = ctx;
  const { metadata } = cfg;
  const { props } = metadata;
  const propAndInst = getSingleProp('activity', props);
  const activityName = calcEnumValue(propAndInst);

  const currActivityName = worker.activityName;
  const idx = propAndInst.values.indexOf(currActivityName);
  if (idx === -1)
    return ['Available', 2000]
  const valueProp = propAndInst.valueProps[idx];
  const delayMsec = valueProp.baseDur * 1000;

  return [activityName, delayMsec];
}

function getPortionsIndexUniform(mapping, randNum) {
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
  calcValue
}