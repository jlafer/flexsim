const Ajv = require('ajv');
const R = require('ramda');

const { findObjInList } = require('./util');

const schema = {
  $id: 'http://twilio.com/schemas/flexsim/domain.json',
  type: 'object',
  properties: {
    brand: { type: 'string', default: 'Owl Industries' },
    queueFilterProp: { type: 'string' },
    queueWorkerProps: {
      type: 'array',
      items: { type: 'string' }
    },
    props: {
      type: 'array',
      items: { $ref: 'propDefn.json#/definitions/propDefn' }
    }
  },
  additionalProperties: true
};

const propDefnSchema = {
  $id: 'http://twilio.com/schemas/flexsim/propDefn.json',
  definitions: {
    propDefn: {
      type: 'object',
      properties: {
        name: { type: 'string' },
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
              target: { type: 'string' },
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

const checkAndFillDomain = (domain) => {
  const ajv = new Ajv({ useDefaults: true });
  const validate = ajv.addSchema(propDefnSchema).compile(schema);
  // NOTE: ajv's validate mutates domain by filling default values
  const valid = validate(domain);
  if (!valid)
    return [valid, validate.errors];

  let res;
  // supply defaults for elements using referenced subschemas; ajv "default" keyword not usable with these
  res = setDefaultProp(domain, ['props', 'arrivalGap', 'min'], 3);
  res = setDefaultProp(res, ['props', 'arrivalGap', 'max'], 20);
  res = setDefaultProp(res, ['props', 'talkTime', 'min'], 10);
  res = setDefaultProp(res, ['props', 'talkTime', 'max'], 50);
  res = setDefaultProp(res, ['props', 'wrapTime', 'min'], 10);
  res = setDefaultProp(res, ['props', 'wrapTime', 'max'], 30);

  return [true, res];
}

function setDefaultProp(domain, path, value) {
  const patch = makeDeepProp(path, value);
  const filled = R.mergeDeepLeft(domain, patch);
  return filled;
}

function makeDeepProp(path, value) {
  const deepProp = R.reduceRight(
    (pathElem, accum) => {
      const res = { [pathElem]: accum };
      return res;
    },
    value,
    path
  );
  return deepProp;
}

const getAttributeProps = (target, props) => {
  const tgtProps = R.reduce(
    (accum, testProp) => {
      if (testProp.instances) {
        const tgtInst = R.find(
          inst => inst.target === target,
          testProp.instances
        );
        if (tgtInst) {
          const propAndInst = { ...testProp, ...tgtInst };
          return [...accum, propAndInst];
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