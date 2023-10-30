const R = require('ramda');

const left = {
  a: 'foo',
  b: {
    e1: 'e1',
    e2: 'e2'
  },
  d: [1, 2]
};

const right = {
  b: {
    e2: 'e21',
    e3: 'e31'
  },
  c: 'baz',
  d: [3, 4, 5]
};

let res;
//res = R.mergeDeepRight(left, right);
//console.log(res);

res = R.assocPath(['b', 'e4'], 42, right);
console.log(res);
