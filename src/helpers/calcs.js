const R = require('ramda');

const { getSinglePropInstance } = require('./schema');
const { filterPropInstances } = require('./util');

function calcPropsValues(ctx, valuesDescriptor) {
  const { propInstances } = ctx;
  const instancesToCalc = filterPropInstances(valuesDescriptor, propInstances)
    .filter(propAndInst => !propAndInst.hasManualCalculation);
  const values = R.reduce(
    calcAndAccumValue(ctx, valuesDescriptor),
    {},
    instancesToCalc
  );
  return values;
}

const calcAndAccumValue = R.curry((ctx, valuesDescriptor, accum, propAndInst) => {
  const value = calcAndSaveValue(ctx, valuesDescriptor, propAndInst);
  const keyPath = R.split('.', propAndInst.instName);
  return R.assocPath(keyPath, value, accum);
});

const calcAndSaveValue = (ctx, valuesDescriptor, propAndInst) => {
  const { propValues } = ctx;
  const value = calcValue(ctx, valuesDescriptor, propAndInst);
  const keyPath = R.split('.', propAndInst.instName);
  addPropValueToContext(propValues, valuesDescriptor, keyPath, value);
  return value;
};

const calcValue = R.curry((ctx, valuesDescriptor, propAndInst) => {
  const value = (propAndInst.valueCnt === 1)
    ? calcScalarValue(ctx, valuesDescriptor, propAndInst)
    : calcArrayValue(ctx, valuesDescriptor, propAndInst);
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

const calcArrayValue = (ctx, valuesDescriptor, propAndInst) => {
  const res = [];
  for (let i = 0; i < propAndInst.valueCnt; i++) {
    const value = calcScalarValue(ctx, valuesDescriptor, propAndInst);
    res.push(value);
  }
  return R.uniq(res);
};

const calcScalarValue = (ctx, valuesDescriptor, propAndInst) => {
  const value = (propAndInst.expr === 'range')
    ? calcRangeValue(ctx, valuesDescriptor, propAndInst)
    : calcEnumValue(ctx, propAndInst);
  return value;
}

const calcRangeValue = (ctx, valuesDescriptor, propAndInst) => {
  const { dataType, curve, max, min } = propAndInst;
  const decValue = (curve == 'uniform')
    ? calcUniformValue(ctx, propAndInst)
    : calcBellValue(ctx, valuesDescriptor, propAndInst);
  let value = (dataType === 'integer') ? Math.round(decValue) : decValue;
  if (value > max)
    value = max;
  if (value < min)
    value = min;
  return value;
};

const calcEnumValue = (ctx, propAndInst) => {
  const { values, valueProps } = propAndInst;
  const portions = valueProps.map(R.prop('portion'));
  const randNum = calcUniformValue(ctx, propAndInst);
  const idx = getPortionsIndexUniform(portions, randNum);
  const value = values[idx];
  return value;
};

const calcUniformValue = (ctx, propAndInst) => {
  const { rng } = ctx;
  const { min, max } = propAndInst;
  const size = max - min;
  const decValue = (rng() * size) + min;
  return decValue;
};

const calcBellValue = (ctx, valuesDescriptor, propAndInst) => {
  const { rng } = ctx;
  const { min, max, influences } = propAndInst;
  const size = max - min;
  const mean = min + (size / 2);
  const stddev = size / 10;
  const shift = calculateInfluencesAmount(ctx, valuesDescriptor, influences);
  const decValue = randomSkewNormal(rng, mean + shift, stddev, 0);
  return decValue;
};

const calculateInfluencesAmount = (ctx, valuesDescriptor, influences) => {
  if (influences.length === 0)
    return 0;
  const { propInstances, propValues } = ctx;
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
  const { propInstances, rng } = ctx;
  const propAndInst = getSinglePropInstance('activity', propInstances);
  const activityName = calcEnumValue(ctx, propAndInst);

  const currActivityName = worker.activityName;
  const idx = propAndInst.values.indexOf(currActivityName);
  if (idx === -1)
    return ['Available', 5000];
  const valueProp = propAndInst.valueProps[idx];
  const delay = randomSkewNormal(rng, valueProp.baseDur, valueProp.baseDur * 0.20, 0);
  const delayMsec = Math.round(delay * 1000);

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
const randomNormals = (rng) => {
  let u1 = 0, u2 = 0;
  // convert [0,1) to (0,1)
  while (u1 === 0) u1 = rng();
  while (u2 === 0) u2 = rng();
  const R = Math.sqrt(-2.0 * Math.log(u1));
  const Θ = 2.0 * Math.PI * u2;
  return [R * Math.cos(Θ), R * Math.sin(Θ)];
};

const randomSkewNormal = (rng, mean, stddev, skew = 0) => {
  const [u0, v] = randomNormals(rng);
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
  calcValue
}