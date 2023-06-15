const R = require('ramda');

const { getSingleProp } = require('./schema');

function calcCustomAttrs(props) {
  let customAttrs;
  props.forEach(prop => {
    const value = calcValue(prop);
    const pathArr = prop.name.split('.');
    customAttrs = R.assocPath(pathArr, value, customAttrs);
  });
  return customAttrs;
}

const calcValue = (propAndInst) => {
  if (propAndInst.valueCnt === 1) {
    return calcScalarValue(propAndInst);
  }
  return calcArrayValue(propAndInst);
}

const calcArrayValue = (propAndInst) => {
  const res = [];
  for (let i = 0; i < propAndInst.valueCnt; i++) {
    const value = calcScalarValue(propAndInst);
    res.push(value);
  }
  return R.uniq(res);
};

const calcScalarValue = (propAndInst) => {
  const value = (propAndInst.expr === 'range')
    ? calcRangeValue(propAndInst)
    : calcEnumValue(propAndInst);
  return value;
}

const calcRangeValue = (propAndInst) => {
  const randNum = calcRandomValue(propAndInst);
  const { min, max, dataType } = propAndInst;
  const size = max - min;
  const decValue = (randNum * size) + min;
  const value = (dataType === 'integer') ? Math.round(decValue) : decValue;
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