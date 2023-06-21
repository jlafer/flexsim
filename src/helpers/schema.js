const Ajv = require('ajv');
const R = require('ramda');

const { findObjInList, sortPropsByFactors } = require('./util');

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
              entity: {
                type: 'string',
                enum: ['system', 'tasks', 'workers'],
                default: 'system'
              },
              instName: { type: 'string' },
              phase: {
                type: 'string',
                enum: ['deploy', 'activity', 'arrive', 'assign', 'complete']
              },
              curve: {
                type: 'string',
                enum: ['uniform', 'bell'],
                default: 'uniform'
              },
              influences: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    factor: { type: 'string' },
                    amount: { type: 'number' }
                  }
                }
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
                    factor: { type: 'string' },
                    effect: {
                      type: 'string',
                      enum: ['shift', 'skew', 'focus'],
                      default: 'shift'
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
  const propsArr = objDictToObjArr(finalProps);
  propsArr.forEach(fillMissingPropFields);
  const finalDomain = { ...finalKVs, props: propsArr };
  return finalDomain;
};

function fillMissingPropFields(prop) {
  const { name } = prop;
  if (!prop.expr)
    prop.expr = 'enum';
  if (!prop.dataType)
    prop.dataType = 'string';
  if (prop.expr === 'enum' && (!prop.values || prop.values.length === 0))
    throw new Error(`property ${name} has expr=enum but no values specified`);
  if (!prop.min)
    prop.min = 0;
  if (!prop.max)
    prop.max = 1;
  if (!prop.instances)
    throw new Error(`property ${name} has no instances specified`);
  prop.instances.forEach(fillMissingInstanceFields(prop));
}

const fillMissingInstanceFields = (prop) =>
  inst => {
    if (!inst.instName)
      inst.instName = prop.name;
    if (!inst.influences)
      inst.influences = [];
    if (!inst.entity)
      inst.entity = 'tasks';
    if (inst.entity === 'tasks' && !inst.phase)
      inst.phase = 'arrive';
    if (inst.entity === 'workers' && !inst.phase)
      inst.phase = 'deploy';
    if (inst.entity === 'system' && !inst.phase)
      inst.phase = 'system';
    if (!inst.curve)
      inst.curve = (prop.expr === 'enum') ? 'uniform' : 'bell';
    if (!inst.valueCnt)
      inst.valueCnt = 1;
    if (prop.expr === 'enum' && !inst.valueProps)
      throw new Error(`property ${prop.name} has instance with no valueProps specified`);
  }

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

const getPropInstances = (props) => {
  const tgtPropInstances = R.reduce(
    (accum, testProp) => {
      if (testProp.instances.length > 0) {
        const { instances, ...restOfProp } = testProp;
        const propAndInstArr = R.map(
          (inst) => {
            const propAndInst = { ...restOfProp, ...inst };
            return propAndInst;
          },
          testProp.instances
        );
        return [...accum, ...propAndInstArr];
      }
      return accum
    },
    [],
    props
  );
  return sortPropsByFactors(tgtPropInstances);
};

const getSinglePropInstance = (name, propInstances) => findObjInList('instName', name, propInstances);

module.exports = {
  checkAndFillDomain,
  getPropInstances,
  getSinglePropInstance
}