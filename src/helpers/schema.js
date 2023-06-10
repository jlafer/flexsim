const Ajv = require('ajv');
const R = require('ramda');

const schema = {
  $id: "http://twilio.com/schemas/flexsim/domain.json",
  type: 'object',
  properties: {
    agentCnt: { type: 'number', default: 15 },
    arrivalGap: { $ref: "valueDefn.json#/definitions/valueDefn" },
    talkTime: { $ref: "valueDefn.json#/definitions/valueDefn" },
    brand: { type: 'string', default: 'Owl Industries' },
    taskAttributes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          property: { type: 'string' },
          phase: {
            type: 'string',
            enum: ['arrival', 'routing', 'completion']
          },
          mapping: {
            type: 'array',
            items: {
              type: 'number'
            }
          }
        },
        required: ['name']
      }
    },
    workerAttributes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          property: { type: 'string' },
          mapping: {
            type: 'array',
            items: {
              type: 'number'
            }
          }
        },
        required: ['name']
      },
    },
    properties: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          expr: {
            type: 'string',
            enum: ['identity', 'range', 'enum'],
            default: 'identity'
          },
          enum: {
            type: 'array',
            items: { type: 'string' }
          },
          curve: {
            type: 'string',
            enum: ['bell', 'uniform', 'log'],
            default: 'uniform'
          },
        },
        required: ['name']
      },
    },
  },
  additionalProperties: true
};

const valueDefnSchema = {
  $id: "http://twilio.com/schemas/flexsim/valueDefn.json",
  definitions: {
    valueDefn: {
      type: 'object',
      properties: {
        expr: {
          type: 'string',
          enum: ['enum', 'range', 'identity'],
          default: 'enum'
        },
        curve: {
          type: 'string',
          enum: ['uniform', 'bell'],
          default: 'uniform'
        },
        min: { type: 'number' },
        max: { type: 'number' }
      }
    }
  }
};

const checkAndFillDomain = (domain) => {
  const ajv = new Ajv({ useDefaults: true });
  const validate = ajv.addSchema(valueDefnSchema).compile(schema);
  // NOTE: ajv mutates domain by filling default values
  const valid = validate(domain);
  if (!valid)
    return [valid, validate.errors];

  let res;
  // supply defaults for elements using referenced subschemas; ajv "default" keyword not usable with these
  res = setDefaultProp(domain, ['arrivalGap', 'min'], 3);
  res = setDefaultProp(res, ['arrivalGap', 'max'], 20);
  res = setDefaultProp(res, ['talkTime', 'min'], 10);
  res = setDefaultProp(res, ['talkTime', 'max'], 50);

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

module.exports = {
  checkAndFillDomain
}