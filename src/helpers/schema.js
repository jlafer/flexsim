const Ajv = require('ajv');
const R = require('ramda');

const { findObjInList, sortPropsByFactors, sumValuesForKey } = require('./util');

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
        waitTime: { $ref: 'propDefn.json#/definitions/propDefn' },
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
                enum: ['tasks', 'workers'],
                default: 'tasks'
              },
              instName: { type: 'string' },
              phase: {
                type: 'string',
                enum: ['deploy', 'activity', 'arrive', 'assign', 'complete']
              },
              isAttribute: { type: 'boolean' },
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

const requiredParamNames = [
  'brand', 'agentCnt', 'queueFilterProp', 'queueWorkerProps', 'props'
];

const stdPropNames = [
  'abandonTime', 'activity', 'arrivalGap', 'channel', 'talkTime', 'waitTime', 'wrapTime'
];

const requiredPropProps = [
  'name', 'dataType', 'expr', 'min', 'max', 'instances'
];

const requiredInstanceProps = [
  'instName', 'entity', 'phase', 'isAttribute', 'curve', 'valueCnt'
];

const checkAndFillDomain = (defaults, domain) => {
  const ajv = new Ajv({ useDefaults: true });
  const validate = ajv.addSchema(propDefnSchema).compile(schema);

  // NOTE: ajv's validate mutates defaults and domain by filling default values
  let valid = validate(defaults);
  if (!valid) {
    console.log('ERROR: invalid locale file contents; please contact the project owners');
    return [valid, validate.errors];
  }

  if (!!domain) {
    valid = validate(domain);
    if (!valid) {
      console.log('ERROR: invalid domain.json file contents');
      return [valid, validate.errors];
    }  
  }

  const merged = (!!domain)
    ? mergeDomainIntoDefaults(defaults, domain)
    : defaults;
  const res = checkAndFill(merged);
  return [true, res];
}

const mergeDomainIntoDefaults = (defaults, domain) => {
  const { props: defaultProps, ...defaultParams } = defaults;
  const { props: domainProps, ...domainParams } = domain;

  // first, merge the parameters (except "props")
  const finalParams = R.mergeRight(defaultParams, domainParams);

  // next, remove any non-standard props from the defaults
  // if the domain file specifies any non-standard props
  const nonStdDomainProps = getNonStdProps(domainProps);
  const finalDefaultprops = (R.isEmpty(nonStdDomainProps))
    ? defaultProps
    : getStdProps(defaultProps);

  const finalProps = R.mergeDeepRight(finalDefaultprops, domainProps);
  const finalDomain = { ...finalParams, props: finalProps };
  return finalDomain;
};

const checkAndFill = (domain) => {
  const { props, ...parameters } = domain;

  //convert props to an array-of-objs for ease-of-use in the rest of flexsim
  const propsArr = objDictToObjArr('name', props);
  const finalDomain = { ...parameters, props: propsArr };

  fillDomain(finalDomain);
  checkDomain(finalDomain);

  return finalDomain;
};

const fillDomain = (domain) => {
  const { props, ...parameters } = domain;
  props.forEach(fillMissingPropFields);
  const waitTimeProp = findObjInList('name', 'waitTime', props);
  if (!!waitTimeProp)
    waitTimeProp.instances[0].hasManualCalculation = true;
};

function fillMissingPropFields(prop) {
  const { instances } = prop;
  if (!prop.expr)
    prop.expr = 'enum';
  if (!prop.dataType)
    prop.dataType = 'string';
  if (!prop.min)
    prop.min = 0;
  if (!prop.max)
    prop.max = 1;
  if (instances)
    instances.forEach(fillMissingInstanceFields(prop));
}

const fillMissingInstanceFields = (prop) =>
  inst => {
    if (!inst.instName)
      inst.instName = prop.name;
    if (inst.isAttribute == undefined)
      inst.isAttribute = true;
    if (!inst.influences)
      inst.influences = [];
    if (!inst.entity)
      inst.entity = 'tasks';
    if (inst.entity === 'tasks' && !inst.phase)
      inst.phase = 'arrive';
    if (inst.entity === 'workers' && !inst.phase)
      inst.phase = 'deploy';
    if (!inst.curve)
      inst.curve = (prop.expr === 'enum') ? 'uniform' : 'bell';
    if (!inst.valueCnt)
      inst.valueCnt = 1;
    if (prop.expr === 'enum' && !inst.valueProps)
      inst.valueProps = buildDefaultValueProps(prop.values);
  }

const checkDomain = (domain) => {
  const paramNames = R.keys(domain);
  const missingParams = R.difference(requiredParamNames, paramNames);
  if (missingParams.length > 0)
    throwConfigError(`missing domain parameters: ${missingParams.join(', ')}`);

  const { props, ...parameters } = domain;

  const propNames = R.pluck('name', props);
  const missingProps = R.difference(stdPropNames, propNames);
  if (missingProps.length > 0)
    throwConfigError(`missing standard value props: ${missingProps.join(', ')}`);

  props.forEach(checkPropFields);
};

const checkPropFields = (prop) => {
  const { name, dataType, expr, values, instances } = prop;
  const propPropNames = R.keys(prop);
  const missingPropProps = R.difference(requiredPropProps, propPropNames);
  if (missingPropProps.length > 0)
    throwConfigError(`prop -${name} is missing properties: ${missingPropProps.join(', ')}`);
  if (!['boolean', 'integer', 'number', 'string'].includes(dataType))
    throwConfigError(`property ${name} has invalid dataType ${dataType}`);
  if (!['enum', 'range'].includes(expr))
    throwConfigError(`property ${name} has invalid expr ${expr}`);
  if (expr === 'enum' && (!values || values.length === 0))
    throwConfigError(`property ${name} has expr=enum but no values specified`);
  instances.forEach(checkInstanceFields(prop));
};

const checkInstanceFields = (prop) => {
  const { name } = prop;
  return (inst) => {
    const { entity, phase, curve, valueProps } = inst;
    const instanceProps = R.keys(inst);
    const missingInstanceProps = R.difference(requiredInstanceProps, instanceProps);
    if (missingInstanceProps.length > 0)
      throwConfigError(`prop -${name} is missing properties: ${missingInstanceProps.join(', ')}`);
    if (!['tasks', 'workers'].includes(entity))
      throwConfigError(`prop ${name} has instance with invalid entity ${entity}`);
    if (!['deploy', 'activity', 'arrive', 'assign', 'complete'].includes(phase))
      throwConfigError(`prop ${name} has instance with invalid phase ${phase}`);
    if (!['uniform', 'bell'].includes(curve))
      throwConfigError(`prop ${name} has instance with invalid curve ${curve}`);
    if (prop.expr === 'enum' && !valueProps)
      throwConfigError(`property ${name} has instance with no valueProps specified`);
    if (prop.expr === 'enum')
      checkValueProps(name, valueProps);
  }
}

const buildDefaultValueProps = (values) => {
  const valueCnt = values.length;
  if (valueCnt === 0)
    return [];
  const equalPortion = Math.floor(100 / valueCnt);
  const gap = 100 - (equalPortion * valueCnt);
  const valueProps = R.map(_value => ({ portion: equalPortion / 100 }), values);
  valueProps[0].portion += (gap / 100);
  return valueProps;
};

const objDictToObjArr = (key, dictByName) => {
  const arr = R.toPairs(dictByName)
    .map(([name, prop]) => ({ ...prop, [key]: name }));
  return arr;
};

const checkValueProps = (name, valueProps) => {
  const sum = sumValuesForKey('portion', valueProps);
  if (sum < 0.99 || sum > 1.01)
    throwConfigError(`property ${name} has instance with valueProps not summing to 1`);
};

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

const throwConfigError = (msg) => {
  console.error(`ERROR: ${msg}`);
  throw new Error(msg);
};

module.exports = {
  checkDomain,
  checkAndFillDomain,
  getPropInstances,
  getSinglePropInstance
}