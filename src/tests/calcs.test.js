const R = require('ramda');
const seedrandom = require('seedrandom');

const { calcDimsValues, calcValue } = require('../helpers/calcs');

const overrideDimInstance = (baseDimInst, name, overrides) => {
  const clone = R.clone(baseDimInst);
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

const enumDimBase = {
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
  "valueParams": [
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

const rangeDimBase = {
  "name": "testRangeDim",
  "dataType": "integer",
  "expr": "range",
  "min": 0,
  "max": 100,
  "entity": "tasks",
  "instName": "testRangeDim",
  "phase": "assign",
  "curve": "bell",
  "isAttribute": true,
  "influences": [],
  "valueCnt": 1,
};

const prereq1 = overrideDimInstance(rangeDimBase, 'prereq1', { phase: 'arrive' });
const prereq2 = overrideDimInstance(rangeDimBase, 'prereq2', { phase: 'arrive' });
const prereq3 = overrideDimInstance(rangeDimBase, 'prereq3', { phase: 'arrive' });

const bellShiftDim = overrideDimInstance(rangeDimBase, 'bellShift', {
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
  rangeDimBase,
  enumDimBase
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
  const ctx = makeCtx({ dimInstances: piBase, dimValues: pvBase });
  const expected = { activity: 'Busy' };
  const res = calcDimsValues(ctx, workersValuesDescriptor);
  expect(res).toStrictEqual(expected);
});

test('calculates a range-bell value', () => {
  const ctx = makeCtx({ dimInstances: piBase, dimValues: pvBase });
  const expected = { testRangeDim: 58 };
  const res = calcDimsValues(ctx, tasksValuesDescriptor);
  expect(res).toStrictEqual(expected);
});

test('calculates a range-bell value with a shift', () => {
  const dimInstances = [prereq1, bellShiftDim];
  const ctx = makeCtx({ dimInstances, dimValues: pvBase });
  const expected = { bellShift: 63 };
  const res = calcDimsValues(ctx, tasksValuesDescriptor);
  expect(res).toStrictEqual(expected);
});

test('calculates many range-bell values accurately', () => {
  const ctx = makeCtx({ dimInstances: piBase, dimValues: pvBase });
  const dimAndInst = rangeDimBase;
  const count = 1000;
  const expected = 50;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const value = calcValue(ctx, tasksValuesDescriptor, dimAndInst);
    //console.log(value);
    sum = sum + value;
  }
  const res = Math.round(sum / count);
  expect(res).toBe(expected);
});

test('calculates many bell-shifted values accurately', () => {
  const dimInstances = [prereq1, bellShiftDim];
  const ctx = makeCtx({ dimInstances, dimValues: pvBase });
  const dimAndInst = bellShiftDim;
  const count = 1000;
  const expected = 55;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const value = calcValue(ctx, tasksValuesDescriptor, dimAndInst);
    sum = sum + value;
  }
  const res = Math.round(sum / count);
  expect(res).toBe(expected);
});

