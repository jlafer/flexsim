const Ajv = require('ajv');

const schema = {
  type: 'object',
  properties: {
    agentCnt: { type: 'number', default: 15 },
    arrivalRate: { type: 'number', default: 3 },
    brand: { type: 'string', default: 'Owl Industries' },
    handleTimeBase: { type: 'number', default: 30 },
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

const checkAndFillDomain = (domain) => {
  const ajv = new Ajv({ useDefaults: true });
  const validate = ajv.compile(schema);
  const valid = validate(domain);
  return [valid, validate.errors];
}

module.exports = {
  checkAndFillDomain
}