const R = require('ramda');
const seedrandom = require('seedrandom');

const { calcPropsValues, calcValue } = require('../helpers/calcs');

const overridePropInstance = (basePropInst, name, overrides) => {
  const clone = R.clone(basePropInst);
  clone.name = name;
  clone.instName = name;
  const res = R.mergeRight(clone, overrides);
  return res;
};

const makeCtx = (other) => {
  const ctx = R.clone(other);
  ctx.rng = seedrandom('predictable');
  return ctx;
};

const enumPropBase = {
  "dataType": "string",
  "expr": "enum",
  "values": [
    "Available",
    "Busy",
    "Break",
    "Lunch"
  ],
  "min": 0,
  "max": 1,
  "entity": "workers",
  "instName": "activity",
  "phase": "activity",
  "curve": "uniform",
  "isAttribute": false,
  "influences": [],
  "valueCnt": 1,
  "valueProps": [
    {
      "baseDur": 90,
      "portion": 0.25
    },
    {
      "baseDur": 15,
      "portion": 0.15
    },
    {
      "baseDur": 30,
      "portion": 0.35
    },
    {
      "baseDur": 120,
      "portion": 0.25
    }
  ]
};

const rangePropBase = {
  "name": "testRangeProp",
  "dataType": "integer",
  "expr": "range",
  "min": 0,
  "max": 100,
  "entity": "tasks",
  "instName": "testRangeProp",
  "phase": "assign",
  "curve": "bell",
  "isAttribute": true,
  "influences": [],
  "valueCnt": 1,
};

const prereq1 = overridePropInstance(rangePropBase, 'prereq1', { phase: 'arrive' });
const prereq2 = overridePropInstance(rangePropBase, 'prereq2', { phase: 'arrive' });
const prereq3 = overridePropInstance(rangePropBase, 'prereq3', { phase: 'arrive' });

const bellShiftProp = overridePropInstance(rangePropBase, 'bellShift', {
  phase: 'assign',
  influences: [
    {
      "factor": "prereq1.prereq1",
      "effect": "shift",
      "amount": "0.20"
    }
  ]
});

const piBase = [
  prereq1,
  prereq2,
  prereq3,
  rangePropBase,
  enumPropBase
];

const id = 'abcde';
const pvBase = {
  tasks: {
    [id]: {
      prereq1: 75,
      prereq2: 50,
      prereq3: 25
    }
  },
  workers: {}
};

const workersValuesDescriptor = { entity: 'workers', phase: 'activity', id };
const tasksValuesDescriptor = { entity: 'tasks', phase: 'assign', id };


test('calculates an enum value', () => {
  const ctx = makeCtx({ propInstances: piBase, propValues: pvBase });
  const expected = { activity: 'Busy' };
  const res = calcPropsValues(ctx, workersValuesDescriptor);
  expect(res).toStrictEqual(expected);
});

test('calculates a range-bell value', () => {
  const ctx = makeCtx({ propInstances: piBase, propValues: pvBase });
  const expected = { testRangeProp: 58 };
  const res = calcPropsValues(ctx, tasksValuesDescriptor);
  expect(res).toStrictEqual(expected);
});

test('calculates a range-bell value with a shift', () => {
  const propInstances = [prereq1, bellShiftProp];
  const ctx = makeCtx({ propInstances, propValues: pvBase });
  const expected = { bellShift: 63 };
  const res = calcPropsValues(ctx, tasksValuesDescriptor);
  expect(res).toStrictEqual(expected);
});

test('calculates many range-bell values accurately', () => {
  const ctx = makeCtx({ propInstances: piBase, propValues: pvBase });
  const propAndInst = rangePropBase;
  const count = 1000;
  const expected = 50;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const value = calcValue(ctx, tasksValuesDescriptor, propAndInst);
    //console.log(value);
    sum = sum + value;
  }
  const res = Math.round(sum / count);
  expect(res).toBe(expected);
});

test('calculates many bell-shifted values accurately', () => {
  const propInstances = [prereq1, bellShiftProp];
  const ctx = makeCtx({ propInstances, propValues: pvBase });
  const propAndInst = bellShiftProp;
  const count = 1000;
  const expected = 55;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const value = calcValue(ctx, tasksValuesDescriptor, propAndInst);
    sum = sum + value;
  }
  const res = Math.round(sum / count);
  expect(res).toBe(expected);
});

