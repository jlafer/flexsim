const Ajv = require('ajv');
const R = require('ramda');

const { findObjInList } = require('./util');

const schema = {
  $id: 'http://twilio.com/schemas/flexsim/domain.json',
  type: 'object',
  properties: {
    brand: { type: 'string' },
    agentCnt: { type: 'integer' },
    queueFilterProp: { type: 'string' },
    queueWorkerProps: {
      type: 'array',
      items: { type: 'string' }
    },
    props: {
      type: 'object',
      properties: {
        abandonTime: { $ref: 'propDefn.json#/definitions/propDefn' },
        activity: { $ref: 'propDefn.json#/definitions/propDefn' },
        arrivalGap: { $ref: 'propDefn.json#/definitions/propDefn' },
        channel: { $ref: 'propDefn.json#/definitions/propDefn' },
        talkTime: { $ref: 'propDefn.json#/definitions/propDefn' },
        wrapTime: { $ref: 'propDefn.json#/definitions/propDefn' }
      },
      additionalProperties: true
    }
  },
  additionalProperties: false
};

const propDefnSchema = {
  $id: 'http://twilio.com/schemas/flexsim/propDefn.json',
  definitions: {
    propDefn: {
      type: 'object',
      properties: {
        dataType: {
          type: 'string',
          enum: ['boolean', 'integer', 'number', 'string'],
          default: 'string'
        },
        expr: {
          type: 'string',
          enum: ['enum', 'range'],
          default: 'enum'
        },
        min: { type: 'number' },
        max: { type: 'number' },
        values: {
          type: 'array',
          items: { type: 'string' }
        },
        instances: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              target: {
                type: 'string',
                enum: ['system', 'task', 'worker'],
                default: 'system'
              },
              name: { type: 'string' },
              scheme: {
                type: 'string',
                enum: ['independent', 'functional'],
                default: 'independent'
              },
              phase: {
                type: 'string',
                enum: ['arrival', 'assignment', 'completion']
              },
              curve: {
                type: 'string',
                enum: ['uniform', 'bell'],
                default: 'uniform'
              },
              valueCnt: {
                type: 'integer',
                default: 1
              },
              valueProps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    portion: { type: 'number' }
                  }
                }
              },
              influences: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    source: { type: 'string' },
                    effect: {
                      type: 'string',
                      enum: ['skew', 'focus'],
                      default: 'skew'
                    },
                    amount: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

const checkAndFillDomain = (defaults, domain) => {
  const ajv = new Ajv({ useDefaults: true });
  const validate = ajv.addSchema(propDefnSchema).compile(schema);

  // NOTE: ajv's validate mutates defaults and domain by filling default values
  let valid = validate(defaults);
  if (!valid) {
    console.log('ERROR: invalid locale file contents');
    return [valid, validate.errors];
  }
  if (!valid) {
    console.log('ERROR: invalid domain.json file contents');
    return [valid, validate.errors];
  }

  const res = mergeDomainIntoDefaults(defaults, domain);
  return [true, res];
}

const mergeDomainIntoDefaults = (defaults, domain) => {
  const { props: defaultProps, ...defaultKVs } = defaults;
  const { props: domainProps, ...domainKVs } = domain;

  // first, merge KVs
  const finalKVs = R.mergeRight(defaultKVs, domainKVs);

  // next, remove any non-standard props from the defaults
  // if the domain file specifies any non-standard props
  const nonStdDomainProps = getNonStdProps(domainProps);
  const finalDefaultprops = (R.isEmpty(nonStdDomainProps))
    ? defaultProps
    : getStdProps(defaultProps);

  const finalProps = R.mergeDeepRight(finalDefaultprops, domainProps);
  const finalDomain = { ...finalKVs, props: objDictToObjArr(finalProps) };
  return finalDomain;
};

const objDictToObjArr = (dictByName) => {
  const arr = R.toPairs(dictByName)
    .map(([name, prop]) => ({ ...prop, name }));
  return arr;
};

const stdPropNames = [
  'abandonTime', 'activity', 'arrivalGap', 'channel', 'talkTime', 'wrapTime'
];

const filterStdProps = ([name, _prop]) => stdPropNames.includes(name);
const filterNonStdProps = R.complement(filterStdProps);

function getNonStdProps(props) {
  const nonStdPropPairs = R.toPairs(props)
    .filter(filterNonStdProps);
  return R.fromPairs(nonStdPropPairs);
}

function getStdProps(props) {
  const stdPropPairs = R.toPairs(props)
    .filter(filterStdProps);
  return R.fromPairs(stdPropPairs);
}

const getAttributeProps = (target, props) => {
  const tgtProps = R.reduce(
    (accum, testProp) => {
      if (testProp.instances) {
        const tgtInstances = R.filter(
          inst => inst.target === target,
          testProp.instances
        );
        if (tgtInstances.length > 0) {
          const { instances, ...restOfProp } = testProp;
          const propAndInstArr = R.map(
            (inst) => {
              const propAndInst = { ...restOfProp, ...inst };
              return propAndInst;
            },
            tgtInstances
          );
          return [...accum, ...propAndInstArr];
        }
      }
      return accum
    },
    [],
    props
  );
  return tgtProps;
};

const getSingleProp = (name, props) => {
  const prop = findObjInList('name', name, props);
  const { instances, ...rest } = prop;
  const inst = instances[0];
  return { ...rest, ...inst };
};

module.exports = {
  checkAndFillDomain,
  getAttributeProps,
  getSingleProp
}