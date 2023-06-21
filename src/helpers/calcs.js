const R = require('ramda');

const { getSinglePropInstance } = require('./schema');
const { filterPropInstances } = require('./util');

function calcPropsValues(ctx, valuesDescriptor) {
  const { propInstances, propValues } = ctx;
  const instancesToCalc = filterPropInstances(valuesDescriptor, propInstances);
  const values = R.reduce(
    calcAndAccumValue(propInstances, propValues, valuesDescriptor),
    {},
    instancesToCalc
  );
  return values;
}

const calcAndAccumValue = R.curry((propInstances, propValues, valuesDescriptor, accum, propAndInst) => {
  const value = calcAndSaveValue(propInstances, propValues, valuesDescriptor, propAndInst);
  const keyPath = R.split('.', propAndInst.instName);
  return R.assocPath(keyPath, value, accum);
});

const calcAndSaveValue = (propInstances, propValues, valuesDescriptor, propAndInst) => {
  const value = calcValue(propInstances, propValues, valuesDescriptor, propAndInst);
  const keyPath = R.split('.', propAndInst.instName);
  addPropValueToContext(propValues, valuesDescriptor, keyPath, value);
  return value;
};

const calcValue = R.curry((propInstances, propValues, valuesDescriptor, propAndInst) => {
  const value = (propAndInst.valueCnt === 1)
    ? calcScalarValue(propInstances, propValues, valuesDescriptor, propAndInst)
    : calcArrayValue(propInstances, propValues, valuesDescriptor, propAndInst);
  return value;
});

const addPropValueToContext = (propValues, valuesDescriptor, keyPath, value) => {
  const { id, entity } = valuesDescriptor;
  propValues[entity][id] = R.assocPath(
    keyPath,
    value,
    propValues[entity][id]
  );
};

const calcArrayValue = (propInstances, propValues, valuesDescriptor, propAndInst) => {
  const res = [];
  for (let i = 0; i < propAndInst.valueCnt; i++) {
    const value = calcScalarValue(propInstances, propValues, valuesDescriptor, propAndInst);
    res.push(value);
  }
  return R.uniq(res);
};

const calcScalarValue = (propInstances, propValues, valuesDescriptor, propAndInst) => {
  const value = (propAndInst.expr === 'range')
    ? calcRangeValue(propInstances, propValues, valuesDescriptor, propAndInst)
    : calcEnumValue(propAndInst);
  return value;
}

const calcRangeValue = (propInstances, propValues, valuesDescriptor, propAndInst) => {
  const { dataType, curve } = propAndInst;
  const decValue = (curve == 'uniform')
    ? calcUniformValue(propAndInst)
    : calcBellValue(propInstances, propValues, valuesDescriptor, propAndInst);
  const value = (dataType === 'integer') ? Math.round(decValue) : decValue;
  return value;
};

const calcEnumValue = (propAndInst) => {
  const { values, valueProps } = propAndInst;
  const portions = valueProps.map(R.prop('portion'));
  const randNum = calcUniformValue(propAndInst);
  const idx = getPortionsIndexUniform(portions, randNum);
  const value = values[idx];
  return value;
};

const calcUniformValue = (propAndInst) => {
  const { min, max } = propAndInst;
  const size = max - min;
  const decValue = (Math.random() * size) + min;
  return decValue;
};

const calcBellValue = (propInstances, propValues, valuesDescriptor, propAndInst) => {
  const { min, max, influences } = propAndInst;
  const size = max - min;
  const mean = min + (size / 2);
  const stddev = size / 2;
  const shift = calculateInfluencesAmount(propInstances, propValues, valuesDescriptor, influences);
  const decValue = randomSkewNormal(mean + shift, stddev, 0);
  return decValue;
};

const calculateInfluencesAmount = (propInstances, propValues, valuesDescriptor, influences) => {
  if (influences.length === 0)
    return 0;
  const { entity, id } = valuesDescriptor;
  const shifts = R.map(
    influence => {
      const { factor, amount } = influence;
      const [_prop, instName] = factor.split('.');
      const propAndInst = getSinglePropInstance(instName, propInstances);
      const { min, max } = propAndInst;
      const factorValue = propValues[entity][id][instName];
      const size = max - min;
      const mean = min + (size / 2);
      const factorDiff = (factorValue - mean);
      return factorDiff * amount;
    },
    influences
  )
  const amount = R.reduce((accum, value) => accum + value, 0, shifts);
  return amount;
};

function calcActivityChange(ctx, worker) {
  const { propInstances } = ctx;
  const propAndInst = getSinglePropInstance('activity', propInstances);
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

// use Box-Muller transform to create normal variates, u0 and v,
// from uniform variates 
const randomNormals = () => {
  let u1 = 0, u2 = 0;
  // convert [0,1) to (0,1)
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  const R = Math.sqrt(-2.0 * Math.log(u1));
  const Θ = 2.0 * Math.PI * u2;
  return [R * Math.cos(Θ), R * Math.sin(Θ)];
};

const randomSkewNormal = (mean, stddev, skew = 0) => {
  const [u0, v] = randomNormals();
  if (skew === 0)
    return mean + stddev * u0;
  const correlation = skew / Math.sqrt(1 + skew * skew);
  const u1 = correlation * u0 + Math.sqrt(1 - correlation * correlation) * v;
  const z = u0 >= 0 ? u1 : -u1;
  return mean + stddev * z;
};

module.exports = {
  calcActivityChange,
  calcPropsValues,
  calcAndSaveValue
}