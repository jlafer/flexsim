const { calcPropsValues } = require('../helpers/calcs');

const propInstances = [
  {
    "name": "activity",
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
    "calculation": "standard",
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
  }
];

const propValues = {
  tasks: {},
  workers: {}
};

const ctx = {
  propInstances,
  propValues
};

const id = 'abcde';

const valuesDescriptor = { entity: 'workers', phase: 'activity', id };

let expected;

test('calculates an enum value', () => {
  expected = { activity: 'Busy' };
  const res = calcPropsValues(ctx, valuesDescriptor);
  expect(res).toBe(expected);
});

